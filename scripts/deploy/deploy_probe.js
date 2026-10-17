const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { createClient, chains, createAccount } = require('genlayer-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RPC_URL = "https://studio.genlayer.com/api";

async function main() {
  console.log("=================================================");
  console.log("LINGUAPROOF: PHASE 0 RUNTIME PROBES");
  console.log("Network: GenLayer Studionet (Preview) | Chain: 61999");
  console.log("=================================================");

  const account = createAccount();
  console.log("Generated diagnostic account:", account.address);

  const client = createClient({
    chain: chains.studionet,
    account: account,
  });

  const probePath = path.join(__dirname, '../../contracts/Probe.py');
  const code = fs.readFileSync(probePath, 'utf8');
  const codeSha = crypto.createHash('sha256').update(code, 'utf8').digest('hex');
  console.log("Probe source sha256:", codeSha);

  console.log("\nDeploying Probe contract to GenLayer Studionet (Preview)...");
  const t0 = Date.now();
  const deployTxHash = await client.deployContract({
    code: code,
    args: [],
  });
  console.log("Deploy tx submitted. Hash:", deployTxHash);

  const deployReceipt = await client.waitForTransactionReceipt({
    hash: deployTxHash,
    retries: 120,
    interval: 3000,
  });
  const deployLatency = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`Deploy receipt received in ${deployLatency}s:`);
  console.log("  status_name:", deployReceipt.status_name);
  console.log("  result_name:", deployReceipt.result_name);
  const leaderRes = deployReceipt.consensus_data?.leader_receipt?.[0]?.execution_result;
  console.log("  leader execution_result:", leaderRes);

  const contractAddress = deployReceipt.recipient;
  console.log("Probe contract deployed address:", contractAddress);

  if (!contractAddress || leaderRes !== 'SUCCESS') {
    throw new Error("Probe contract deployment failed: " + JSON.stringify(deployReceipt));
  }

  const results = {
    network: "GenLayer Studionet (Preview)",
    chainId: 61999,
    contractAddress,
    deployTxHash,
    deployLatency,
    codeSha256: codeSha,
    sender: account.address,
    probes: {},
    transactions: [],
  };

  async function runWrite(actionName, fnName, args) {
    console.log(`\n>>> Executing ${actionName} (${fnName})...`);
    const tw0 = Date.now();
    const txHash = await client.writeContract({
      address: contractAddress,
      functionName: fnName,
      args: args,
    });
    console.log(`  tx submitted: ${txHash}`);
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      retries: 120,
      interval: 3000,
    });
    const latency = ((Date.now() - tw0) / 1000).toFixed(2);
    const lRes = receipt.consensus_data?.leader_receipt?.[0]?.execution_result;
    const votes = receipt.consensus_data?.votes;
    console.log(`  finished in ${latency}s | status: ${receipt.status_name} | result: ${receipt.result_name} | leader: ${lRes} | votes: ${votes ? Object.keys(votes).length : 'N/A'}`);

    const txRecord = {
      action: actionName,
      txHash,
      latency_seconds: latency,
      status_name: receipt.status_name,
      result_name: receipt.result_name,
      leader_result: lRes,
      votes: receipt.consensus_data?.votes,
    };
    results.transactions.push(txRecord);
    return { receipt, latency, txRecord };
  }

  // -------------------------------------------------------------
  // P1. UTF-8 Round-Trip Test (Vietnamese with complex diacritics)
  // -------------------------------------------------------------
  console.log("\n-------------------------------------------------------------");
  console.log("P1: UTF-8 Round-Trip Test (Vietnamese string with diacritics)");
  console.log("-------------------------------------------------------------");
  const sampleVietnamese = "\u0110\u0103ng k\u00fd t\u00e0i kho\u1ea3n v\u00e0 x\u00e1c minh danh t\u00ednh l\u00e0 b\u1eaft bu\u1ed9c \u0111\u1ed1i v\u1edbi t\u1ea5t c\u1ea3 th\u00e0nh vi\u00ean tham gia h\u1ec7 th\u1ed1ng qu\u1ea3n tr\u1ecb phi t\u1eadp trung n\u00e0y tr\u01b0\u1edbc ng\u00e0y 15/11/2026. M\u1ecdi giao d\u1ecbch chuy\u1ec3n nh\u01b0\u1ee3ng v\u01b0\u1ee3t qu\u00e1 50,000 USD ho\u1eb7c 1.500.000 VN\u0110 \u0111\u1ec1u ph\u1ea3i \u0111\u01b0\u1ee3c th\u00f4ng b\u00e1o c\u00f4ng khai t\u1ea1i https://example.com/terms v\u00e0 \u0111\u1ecba ch\u1ec9 v\u00ed 0x1234567890abcdef1234567890abcdef12345678.";
  const localCharLen = sampleVietnamese.length;
  const localByteLen = Buffer.byteLength(sampleVietnamese, 'utf8');
  const localSha256 = crypto.createHash('sha256').update(sampleVietnamese, 'utf8').digest('hex');

  console.log(`Local Char Length: ${localCharLen}`);
  console.log(`Local Byte Length: ${localByteLen}`);
  console.log(`Local SHA-256:     ${localSha256}`);

  await runWrite("p1_utf8_write", "probe_p1_utf8", [sampleVietnamese]);

  const p1RawRead = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['p1_raw'],
  });
  const p1MetaRead = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['p1_meta'],
  });
  const p1Meta = JSON.parse(p1MetaRead);
  const readBackSha256 = crypto.createHash('sha256').update(p1RawRead, 'utf8').digest('hex');

  const p1ExactMatch = (p1RawRead === sampleVietnamese);
  const p1ShaMatch = (readBackSha256 === localSha256 && p1Meta.sha256 === localSha256);
  const p1LenMatch = (p1Meta.char_len === localCharLen && p1Meta.byte_len === localByteLen);

  console.log(`P1 Exact String Match: ${p1ExactMatch}`);
  console.log(`P1 SHA-256 Match:      ${p1ShaMatch}`);
  console.log(`P1 Length Match:       ${p1LenMatch}`);

  results.probes.p1_utf8 = {
    exactMatch: p1ExactMatch,
    shaMatch: p1ShaMatch,
    lenMatch: p1LenMatch,
    localCharLen,
    localByteLen,
    localSha256,
    onChainMeta: p1Meta,
    readBackSha256,
    passed: p1ExactMatch && p1ShaMatch && p1LenMatch,
  };

  if (!results.probes.p1_utf8.passed) {
    console.error("CRITICAL FAILURE: P1 UTF-8 Round-Trip Failed! Stopping per instructions.");
    process.exit(1);
  }

  // -------------------------------------------------------------
  // P2. Python Runtime Features Probe
  // -------------------------------------------------------------
  console.log("\n-------------------------------------------------------------");
  console.log("P2: Python Runtime Features (re, unicodedata, hashlib, json, decimal)");
  console.log("-------------------------------------------------------------");
  await runWrite("p2_runtime_write", "probe_p2_runtime", []);
  const p2Read = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['p2_runtime'],
  });
  const p2Data = JSON.parse(p2Read);
  console.log("P2 On-Chain Results:", JSON.stringify(p2Data, null, 2));
  results.probes.p2_runtime = p2Data;

  // -------------------------------------------------------------
  // P3. gl.nondet.exec_prompt 12-item JSON batch over 5 runs
  // -------------------------------------------------------------
  console.log("\n-------------------------------------------------------------");
  console.log("P3: exec_prompt 12-item JSON batch over 5 runs");
  console.log("-------------------------------------------------------------");
  const p3Prompt = "You are a translation assistant. Translate the following 12 numbered Vietnamese sentences into English faithfully and literally. Return ONLY a valid JSON object with the exact key 'back' containing an array of exactly 12 translated strings. Do not add markdown or explanation.\n{\"back\": [\"...\", ...]}\nSentences:\n1. Hop dong nay co hieu luc tu ngay ky.\n2. Tat ca cac khoan thanh toan phai bang USD.\n3. Ben A cam ket bao mat thong tin cua Ben B.\n4. Moi tranh chap se duoc giai quyet tai toa an.\n5. Khong duoc chuyen nhuong cho ben thu ba.\n6. Thong bao cham dut phai gui truoc 30 ngay.\n7. Ben B co quyen kiem tra tai lieu dinh ky.\n8. Tien dat coc se duoc hoan lai sau khi hoan thanh.\n9. Bat kha khang bao gom thien tai va dich benh.\n10. Cac ben dong y tuan thu quy dinh.\n11. Moi sua doi phai lap thanh van ban.\n12. Thoa thuan nay duoc lap thanh hai ban.";

  const p3Runs = [];
  for (let i = 1; i <= 5; i++) {
    console.log(`\n--- P3 Run ${i} of 5 ---`);
    const writeRes = await runWrite(`p3_batch_run_${i}`, "probe_p3_exec_batch", [p3Prompt]);
    const readVal = await client.readContract({
      address: contractAddress,
      functionName: 'get_result',
      args: ['p3_exec_batch'],
    });

    let parsed = null;
    let isValidJson = false;
    let hasBackKey = false;
    let itemCount = 0;
    try {
      parsed = JSON.parse(readVal);
      isValidJson = true;
      if (Array.isArray(parsed.back)) {
        hasBackKey = true;
        itemCount = parsed.back.length;
      }
    } catch (e) {
      isValidJson = false;
    }

    console.log(`  Run ${i} JSON Valid: ${isValidJson} | Has 'back': ${hasBackKey} | Item Count: ${itemCount} | Latency: ${writeRes.latency}s`);
    p3Runs.push({
      run: i,
      txHash: writeRes.txRecord.txHash,
      latencySec: writeRes.latency,
      isValidJson,
      hasBackKey,
      itemCount,
      leaderResult: writeRes.txRecord.leader_result,
      outputSnippet: readVal.substring(0, 150),
    });
  }
  results.probes.p3_batch = p3Runs;

  // -------------------------------------------------------------
  // P4. Practical Calldata Limit (2 KB, 4 KB, 8 KB)
  // -------------------------------------------------------------
  console.log("\n-------------------------------------------------------------");
  console.log("P4: Practical Calldata Limit (2 KB, 4 KB, 8 KB)");
  console.log("-------------------------------------------------------------");
  const sizes = [2048, 4096, 8192];
  const p4Results = [];
  for (const size of sizes) {
    const payload = "A".repeat(size);
    const tag = `payload_${size}b`;
    console.log(`Testing calldata payload: ${size} bytes...`);
    const writeRes = await runWrite(`p4_calldata_${size}`, "probe_p4_calldata", [payload, tag]);
    const readVal = await client.readContract({
      address: contractAddress,
      functionName: 'get_result',
      args: [`p4_${tag}`],
    });
    const parsed = JSON.parse(readVal);
    console.log(`  Result for ${size}b: char_len=${parsed.char_len}, byte_len=${parsed.byte_len}, sha256 match=${parsed.sha256 === crypto.createHash('sha256').update(payload, 'utf8').digest('hex')}`);
    p4Results.push({
      size,
      txHash: writeRes.txRecord.txHash,
      latencySec: writeRes.latency,
      status: writeRes.txRecord.status_name,
      verified: parsed.byte_len === size,
    });
  }
  results.probes.p4_calldata = p4Results;

  // -------------------------------------------------------------
  // P5. Two Sequential exec_prompt Calls in One Leader Function
  // -------------------------------------------------------------
  console.log("\n-------------------------------------------------------------");
  console.log("P5: Two Sequential exec_prompt Calls in One Leader Function");
  console.log("-------------------------------------------------------------");
  const promptA = "Translate to English: 'Chung toi dong y voi cac dieu khoan nay.' Return JSON only: {\"back\": [\"We agree to these terms.\"]}";
  const promptB = "Compare two sentences: Original: 'Chung toi dong y voi cac dieu khoan nay.', Back: 'We agree to these terms.'. Return JSON only: {\"label\": \"PRESERVED\"}";

  const p5Res = await runWrite("p5_sequential_exec", "probe_p5_sequential_exec", [promptA, promptB]);
  const p5Read = await client.readContract({
    address: contractAddress,
    functionName: 'get_result',
    args: ['p5_sequential'],
  });
  console.log("P5 On-Chain Read:", p5Read);
  results.probes.p5_sequential = {
    txHash: p5Res.txRecord.txHash,
    latencySec: p5Res.latency,
    status: p5Res.txRecord.status_name,
    readBack: JSON.parse(p5Read),
  };

  // -------------------------------------------------------------
  // Save probe findings and record in deployments.json
  // -------------------------------------------------------------
  const outPath = path.join(__dirname, 'probe_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nProbe results saved successfully to ${outPath}`);

  // Deployments tracking
  const depPath = path.join(__dirname, 'deployments.json');
  const deploymentsData = {
    network: "GenLayer Studionet (Preview)",
    chainId: 61999,
    rpc: RPC_URL,
    supersededDeployments: [
      {
        name: "Probe (superseded diagnostic)",
        contractAddress: contractAddress,
        deployTxHash: deployTxHash,
        sourceSha256: codeSha,
        deployedAt: new Date().toISOString(),
      }
    ]
  };
  fs.writeFileSync(depPath, JSON.stringify(deploymentsData, null, 2));
  console.log(`Saved initial deployment tracker to ${depPath}`);
}

main().catch(err => {
  console.error("PROBE ERROR:", err);
  process.exit(1);
});
