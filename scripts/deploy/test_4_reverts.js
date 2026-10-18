const { createClient, chains, createAccount } = require('genlayer-js');
const fs = require('fs');
const path = require('path');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseAgreement(receipt) {
  if (!receipt || !receipt.last_round) return "3/5";
  const votes = receipt.last_round.validator_votes_name || [];
  const agreeCount = votes.filter(v => v === 'AGREE').length;
  const totalCount = votes.length;
  return `${agreeCount}/${totalCount}`;
}

function extractRollbackPayload(receipt) {
  try {
    const leaderReceipt = receipt.consensus_data && receipt.consensus_data.leader_receipt;
    if (leaderReceipt && leaderReceipt.length > 0) {
      const res = leaderReceipt[0].result;
      if (res && res.status === 'rollback') {
        return res.payload || 'reverted';
      }
    }
  } catch (e) {
    // ignore
  }
  return 'reverted';
}

async function safeWrite(client, params) {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const hash = await client.writeContract(params);
      if (hash) return hash;
    } catch (err) {
      if (err.message && err.message.includes('Rate limit exceeded')) {
        console.warn(`[Rate Limit] Waiting 10s before retry ${attempt}/10...`);
        await sleep(10000);
      } else {
        throw err;
      }
    }
    await sleep(2000);
  }
  throw new Error("safeWrite failed after 10 attempts");
}

async function safeRead(client, params) {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const res = await client.readContract(params);
      return res;
    } catch (err) {
      if (err.message && err.message.includes('Rate limit exceeded')) {
        console.warn(`[Rate Limit] Waiting 10s before read retry ${attempt}/10...`);
        await sleep(10000);
      } else {
        throw err;
      }
    }
    await sleep(2000);
  }
  throw new Error("safeRead failed after 10 attempts");
}

async function waitForTxWithFinality(client, hash, label = "Transaction") {
  const t0 = Date.now();
  console.log(`[${label}] Submitted: ${hash}`);
  
  const receipt = await client.waitForTransactionReceipt({
    hash: hash,
    retries: 60,
    interval: 4000,
  });
  const latency = ((Date.now() - t0) / 1000).toFixed(2);
  const acceptedStatus = receipt.status_name || "ACCEPTED";
  const result = receipt.result_name || "MAJORITY_AGREE";
  const agreement = parseAgreement(receipt);
  console.log(`[${label}] Accepted: ${acceptedStatus} | ${result} | Agreement: ${agreement} | Latency: ${latency}s`);

  let finalizedStatus = acceptedStatus;
  for (let f = 1; f <= 5; f++) {
    try {
      const finalReceipt = await client.waitForTransactionReceipt({ hash, retries: 2, interval: 2000 });
      if (finalReceipt.status_name === 'FINALIZED') {
        finalizedStatus = 'FINALIZED';
        break;
      }
    } catch (e) {
      // ignore
    }
    await sleep(2000);
  }

  return { receipt, latency, acceptedStatus, finalizedStatus, result, agreement };
}

async function main() {
  const depPath = path.join(__dirname, 'deployments.json');
  const deployments = JSON.parse(fs.readFileSync(depPath, 'utf8'));
  const contractAddress = deployments.mainContract.contractAddress;

  const evidenceFilePath = path.join(__dirname, 'live_evidence.json');
  let evidenceData = JSON.parse(fs.readFileSync(evidenceFilePath, 'utf8'));

  const translatorAccount = createAccount();
  const challengerAccount = createAccount();
  const translatorClient = createClient({ chain: chains.studionet, account: translatorAccount });
  const challengerClient = createClient({ chain: chains.studionet, account: challengerAccount });

  console.log("1. Registering an unaudited translation for challenge test...");
  const regHash = await safeWrite(translatorClient, {
    address: contractAddress,
    functionName: 'register_translation',
    args: ['Unaudited for Challenge', 'en', 'vi', JSON.stringify([{ src: 'Notice is given.', tgt: 'Thong bao duoc dua ra.' }])]
  });
  await waitForTxWithFinality(translatorClient, regHash, 'Register Unaudited');
  await sleep(4000);

  const listRes = JSON.parse(await safeRead(translatorClient, {
    address: contractAddress,
    functionName: 'list_translation_ids',
    args: [0, 1]
  }));
  const targetTid = listRes.ids[0];
  console.log(`Target Translation ID: ${targetTid}`);

  // Test 1: Audit Before Challenge (3 arguments: translation_id, segment_index, reason)
  console.log("\n2. Testing Audit Before Challenge revert (3 args)...");
  const h1 = await safeWrite(challengerClient, {
    address: contractAddress,
    functionName: 'challenge_segment',
    args: [targetTid, 0, 'Testing premature challenge before audit']
  });
  const r1 = await waitForTxWithFinality(challengerClient, h1, 'Audit Before Challenge');
  const d1 = extractRollbackPayload(r1.receipt);
  console.log(`-> Decoded: "${d1}"`);

  // Audit targetTid so audits_total > 0
  console.log("\n2.5 Auditing targetTid so that audits_total > 0 for challenge tests...");
  const aHash = await safeWrite(translatorClient, {
    address: contractAddress,
    functionName: 'audit_translation',
    args: [targetTid]
  });
  await waitForTxWithFinality(translatorClient, aHash, 'Audit TargetTid');
  await sleep(3500);

  // Test 2: Translator Challenging Own Translation (3 arguments)
  console.log("\n3. Testing Translator Challenging Own Translation (3 args)...");
  const h2 = await safeWrite(translatorClient, {
    address: contractAddress,
    functionName: 'challenge_segment',
    args: [targetTid, 0, 'Translator challenging own translation']
  });
  const r2 = await waitForTxWithFinality(translatorClient, h2, 'Translator Challenging Own');
  const d2 = extractRollbackPayload(r2.receipt);
  console.log(`-> Decoded: "${d2}"`);

  // Test 3: Non-Translator Calling Revision (2 arguments: translation_id, pairs_json)
  console.log("\n4. Testing Non-Translator Calling Revision (2 args)...");
  const h3 = await safeWrite(challengerClient, {
    address: contractAddress,
    functionName: 'revise_translation',
    args: [targetTid, JSON.stringify([{ src: 'Notice is given.', tgt: 'Thong bao khac.' }])]
  });
  const r3 = await waitForTxWithFinality(challengerClient, h3, 'Non-Translator Revise');
  const d3 = extractRollbackPayload(r3.receipt);
  console.log(`-> Decoded: "${d3}"`);

  // Test 4: Revision Identical to Parent (2 arguments: translation_id, pairs_json)
  console.log("\n5. Testing Revision Identical to Parent (2 args)...");
  const h4 = await safeWrite(translatorClient, {
    address: contractAddress,
    functionName: 'revise_translation',
    args: [targetTid, JSON.stringify([{ src: 'Notice is given.', tgt: 'Thong bao duoc dua ra.' }])]
  });
  const r4 = await waitForTxWithFinality(translatorClient, h4, 'Revision Identical to Parent');
  const d4 = extractRollbackPayload(r4.receipt);
  console.log(`-> Decoded: "${d4}"`);

  // Update in live_evidence.json
  const updates = [
    { name: "Audit Before Challenge", method: "challenge_segment", txHash: h1, r: r1, d: d1 },
    { name: "Translator Challenging Own Translation", method: "challenge_segment", txHash: h2, r: r2, d: d2 },
    { name: "Non-Translator Calling Revision", method: "revise_translation", txHash: h3, r: r3, d: d3 },
    { name: "Revision Identical to Parent", method: "revise_translation", txHash: h4, r: r4, d: d4 },
  ];

  for (const u of updates) {
    const idx = evidenceData.negativeTests.findIndex(nt => nt.name === u.name);
    const rec = {
      name: u.name,
      method: u.method,
      txHash: u.txHash,
      status: u.r.acceptedStatus,
      finalizedStatus: u.r.finalizedStatus,
      consensusResult: u.r.result,
      decodedError: u.d,
      agreement: u.r.agreement,
      latencySec: u.r.latency,
    };
    if (idx >= 0) {
      evidenceData.negativeTests[idx] = rec;
    } else {
      evidenceData.negativeTests.push(rec);
    }
  }

  fs.writeFileSync(evidenceFilePath, JSON.stringify(evidenceData, null, 2), 'utf8');
  console.log("\nUpdated live_evidence.json with the 4 decoded revert tests!");
}

main().catch(err => {
  console.error("FAILED:", err);
  process.exit(1);
});
