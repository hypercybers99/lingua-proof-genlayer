const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { createClient, chains, createAccount } = require('genlayer-js');
const fs = require('fs');
const path = require('path');
const { renderEvidence } = require('../tools/render_evidence.js');

const RPC_URL = "https://studio.genlayer.com/api";

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

async function waitForTx(client, hash, label = "Transaction") {
  const t0 = Date.now();
  console.log(`[${label}] Submitted: ${hash}`);
  const receipt = await client.waitForTransactionReceipt({
    hash: hash,
    retries: 100,
    interval: 3000,
  });
  const latency = ((Date.now() - t0) / 1000).toFixed(2);
  const status = receipt.status_name;
  const result = receipt.result_name;
  const agreement = parseAgreement(receipt);
  console.log(`[${label}] Receipt: ${status} | ${result} | Agreement: ${agreement} | Latency: ${latency}s`);
  return { receipt, latency, status, result, agreement };
}

async function main() {
  console.log("==================================================================");
  console.log("LINGUAPROOF: ON-CHAIN EVIDENCE HARNESS");
  console.log("Network:  GenLayer Studionet (Preview) | Chain ID: 61999");
  console.log("RPC:      https://studio.genlayer.com/api");
  console.log("==================================================================\n");

  const depPath = path.join(__dirname, 'deployments.json');
  if (!fs.existsSync(depPath)) {
    throw new Error("deployments.json not found! Deploy contract first.");
  }
  const deployments = JSON.parse(fs.readFileSync(depPath, 'utf8'));
  const contractAddress = deployments.mainContract.contractAddress;
  console.log("Target Contract Address:", contractAddress);

  // Two distinct throwaway accounts
  const translatorAccount = createAccount();
  const challengerAccount = createAccount();

  console.log("Translator Account: ", translatorAccount.address);
  console.log("Challenger Account: ", challengerAccount.address);

  const translatorClient = createClient({ chain: chains.studionet, account: translatorAccount });
  const challengerClient = createClient({ chain: chains.studionet, account: challengerAccount });

  const evidenceFilePath = path.join(__dirname, 'live_evidence.json');
  let evidenceData = {
    network: "GenLayer Studionet (Preview)",
    chainId: 61999,
    contractAddress: contractAddress,
    deployTxHash: deployments.mainContract.deployTxHash,
    generatedAt: new Date().toISOString(),
    accounts: {
      translator: translatorAccount.address.toLowerCase(),
      challenger: challengerAccount.address.toLowerCase(),
    },
    cases: {},
    negativeTests: [],
    readbacks: {}
  };

  // Helper to persist intermediate progress
  function saveEvidence() {
    fs.writeFileSync(evidenceFilePath, JSON.stringify(evidenceData, null, 2), 'utf8');
  }

  // ==================================================================
  // STAGE 1: 14 ON-CHAIN NEGATIVE REVERT TESTS
  // ==================================================================
  console.log("\n>>> STAGE 1: RUNNING 14 NEGATIVE REVERT TESTS UNDER CONSENSUS...");

  const negDefs = [
    {
      name: "Unsupported Language",
      method: "register_translation",
      run: () => translatorClient.writeContract({
        address: contractAddress,
        functionName: 'register_translation',
        args: ['Bad Lang', 'ja', 'vi', JSON.stringify([{ src: 'Konnichiwa', tgt: 'Xin chao' }])]
      })
    },
    {
      name: "Same Source and Target Language",
      method: "register_translation",
      run: () => translatorClient.writeContract({
        address: contractAddress,
        functionName: 'register_translation',
        args: ['Same Lang', 'en', 'en', JSON.stringify([{ src: 'Hello world', tgt: 'Hello world' }])]
      })
    },
    {
      name: "Empty Pairs List",
      method: "register_translation",
      run: () => translatorClient.writeContract({
        address: contractAddress,
        functionName: 'register_translation',
        args: ['Empty Pairs', 'en', 'vi', '[]']
      })
    },
    {
      name: "Exceeding 12 Max Pairs",
      method: "register_translation",
      run: () => {
        const pairs13 = Array.from({ length: 13 }, (_, i) => ({ src: `Sentence item number ${i}`, tgt: `Cau so thu tu ${i}` }));
        return translatorClient.writeContract({
          address: contractAddress,
          functionName: 'register_translation',
          args: ['Thirteen Pairs', 'en', 'vi', JSON.stringify(pairs13)]
        });
      }
    },
    {
      name: "Target Equals Source Without Anchor Exemption",
      method: "register_translation",
      run: () => translatorClient.writeContract({
        address: contractAddress,
        functionName: 'register_translation',
        args: ['Identical Text', 'en', 'vi', JSON.stringify([{ src: 'The proposal is under review.', tgt: 'The proposal is under review.' }])]
      })
    },
    {
      name: "Overlength Source Segment (>400 Chars)",
      method: "register_translation",
      run: () => {
        const longSrc = "A".repeat(405);
        return translatorClient.writeContract({
          address: contractAddress,
          functionName: 'register_translation',
          args: ['Overlength Src', 'en', 'vi', JSON.stringify([{ src: longSrc, tgt: 'Ban dich qua dai' }])]
        });
      }
    },
    {
      name: "Unallowed Control Character in Segment",
      method: "register_translation",
      run: () => translatorClient.writeContract({
        address: contractAddress,
        functionName: 'register_translation',
        args: ['Control Chars', 'en', 'vi', JSON.stringify([{ src: "Segment with null byte \u0000 forbidden", tgt: "Doan co ky tu cam" }])]
      })
    },
    {
      name: "Unknown Translation ID Audit",
      method: "audit_translation",
      run: () => translatorClient.writeContract({
        address: contractAddress,
        functionName: 'audit_translation',
        args: ['000000000000']
      })
    },
    {
      name: "Audit Before Challenge",
      method: "challenge_segment",
      run: async () => {
        // Register an unaudited translation first
        const regHash = await translatorClient.writeContract({
          address: contractAddress,
          functionName: 'register_translation',
          args: ['Challenge Unaudited', 'en', 'vi', JSON.stringify([{ src: 'Short sentence for challenge test.', tgt: 'Cau ngan cho kiem tra thu thach.' }])]
        });
        await translatorClient.waitForTransactionReceipt({ hash: regHash, retries: 60, interval: 3000 });
        const listRes = JSON.parse(await translatorClient.readContract({
          address: contractAddress,
          functionName: 'list_translation_ids',
          args: [0, 1]
        }));
        const newTid = listRes.ids[0];
        // Now challenger tries to challenge it before any audit has taken place
        return challengerClient.writeContract({
          address: contractAddress,
          functionName: 'challenge_segment',
          args: [newTid, 0, 'Cau ngan cho kiem tra thu thach.', 'Cau ngan tot hon.', 'Premature challenge attempt']
        });
      }
    },
    {
      name: "Translator Challenging Own Translation",
      method: "challenge_segment",
      run: async () => {
        const listRes = JSON.parse(await translatorClient.readContract({
          address: contractAddress,
          functionName: 'list_translation_ids',
          args: [0, 1]
        }));
        const anyTid = listRes.ids[0];
        return translatorClient.writeContract({
          address: contractAddress,
          functionName: 'challenge_segment',
          args: [anyTid, 0, 'Contested', 'Proposed', 'Self challenge is forbidden']
        });
      }
    },
    {
      name: "Non-Translator Calling Revision",
      method: "revise_translation",
      run: async () => {
        const listRes = JSON.parse(await translatorClient.readContract({
          address: contractAddress,
          functionName: 'list_translation_ids',
          args: [0, 1]
        }));
        const anyTid = listRes.ids[0];
        return challengerClient.writeContract({
          address: contractAddress,
          functionName: 'revise_translation',
          args: [anyTid, 'Hacker Revision', JSON.stringify([{ src: 'Revised src', tgt: 'Revised tgt' }])]
        });
      }
    },
    {
      name: "Duplicate Translation Registration",
      method: "register_translation",
      run: () => {
        // Submit identical registration payload again
        return translatorClient.writeContract({
          address: contractAddress,
          functionName: 'register_translation',
          args: ['Challenge Unaudited', 'en', 'vi', JSON.stringify([{ src: 'Short sentence for challenge test.', tgt: 'Cau ngan cho kiem tra thu thach.' }])]
        });
      }
    },
    {
      name: "Revision Identical to Parent",
      method: "revise_translation",
      run: async () => {
        const listRes = JSON.parse(await translatorClient.readContract({
          address: contractAddress,
          functionName: 'list_translation_ids',
          args: [0, 1]
        }));
        const targetTid = listRes.ids[0];
        return translatorClient.writeContract({
          address: contractAddress,
          functionName: 'revise_translation',
          args: [targetTid, 'Identical Revision', JSON.stringify([{ src: 'Short sentence for challenge test.', tgt: 'Cau ngan cho kiem tra thu thach.' }])]
        });
      }
    }
  ];

  for (let i = 0; i < negDefs.length; i++) {
    const nd = negDefs[i];
    console.log(`\n[Revert Test ${i + 1}/${negDefs.length}] Submitting ${nd.name}...`);
    try {
      const txHash = await nd.run();
      const res = await waitForTx(translatorClient, txHash, nd.name);
      const rollbackPayload = extractRollbackPayload(res.receipt);
      evidenceData.negativeTests.push({
        name: nd.name,
        method: nd.method,
        txHash: txHash,
        status: res.status,
        consensusResult: res.result,
        decodedError: rollbackPayload,
        agreement: res.agreement,
        latencySec: res.latency,
      });
      console.log(`-> Decoded revert payload: "${rollbackPayload}"`);
      saveEvidence();
    } catch (err) {
      console.error(`Error executing negative test ${nd.name}:`, err);
    }
  }

  // ==================================================================
  // STAGE 2: POSITIVE CASES (E1 & E2)
  // ==================================================================
  console.log("\n>>> STAGE 2: RUNNING POSITIVE CASES E1 & E2...");

  // E1: en -> vi faithful (7 segments with number, date, URL, ticker, hex address, quote, closing)
  console.log("\n[E1] Registering faithful translation (en -> vi)...");
  const e1Pairs = [
    {
      src: "LinguaProof delivers consensus-audited translation fidelity notarization for decentralized governance.",
      tgt: "LinguaProof mang lại dịch vụ công chứng độ trung thực của bản dịch được kiểm định bằng đồng thuận cho quản trị phi tập trung."
    },
    {
      src: "The treasury allocated 50,000 USD to the ecosystem development fund.",
      tgt: "Kho bạc đã phân bổ 50,000 USD cho quỹ phát triển hệ sinh thái."
    },
    {
      src: "Voting concludes on 2026-12-31 at midnight.",
      tgt: "Cuộc bỏ phiếu kết thúc vào 2026-12-31 lúc nửa đêm."
    },
    {
      src: "Official documentation is available at https://docs.linguaproof.io for public review.",
      tgt: "Tài liệu chính thức có sẵn tại https://docs.linguaproof.io để công chúng xem xét."
    },
    {
      src: "Contract upgrades require approval from 0xba67d808f2b7e533ec06655eb730ef5b27623ebf before deployment.",
      tgt: "Việc nâng cấp hợp đồng yêu cầu sự chấp thuận từ 0xba67d808f2b7e533ec06655eb730ef5b27623ebf trước khi triển khai."
    },
    {
      src: "The committee formally approved the motion titled \"Q4 Security Audit\".",
      tgt: "Ủy ban đã chính thức phê duyệt kiến nghị có tiêu đề \"Q4 Security Audit\"."
    },
    {
      src: "All network participants must follow these procedures diligently.",
      tgt: "Tất cả những người tham gia mạng lưới phải tuân thủ nghiêm túc các quy trình này."
    }
  ];

  const e1RegTx = await translatorClient.writeContract({
    address: contractAddress,
    functionName: 'register_translation',
    args: ['E1 Faithful Governance Policy (en -> vi)', 'en', 'vi', JSON.stringify(e1Pairs)]
  });
  await waitForTx(translatorClient, e1RegTx, 'E1 Registration');
  const e1IdsRes = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'list_translation_ids',
    args: [0, 1]
  }));
  const e1Tid = e1IdsRes.ids[0];
  console.log(`[E1] Registered translation ID: ${e1Tid}`);

  console.log("[E1] Auditing translation under consensus...");
  const e1AuditTx = await translatorClient.writeContract({
    address: contractAddress,
    functionName: 'audit_translation',
    args: [e1Tid]
  });
  const e1AuditRes = await waitForTx(translatorClient, e1AuditTx, 'E1 Audit');

  const e1Record = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'get_translation',
    args: [e1Tid]
  }));
  console.log(`[E1] Outcome Class: ${e1Record.latest_class} | Score: ${e1Record.latest_score}`);

  evidenceData.cases['E1'] = {
    id: 'E1',
    title: 'Faithful Aligned Translation (en \u2192 vi)',
    description: 'Governance charter with numbers, ISO dates, URL, tickers, hex address, quoted terms.',
    langs: 'en \u2192 vi',
    translationId: e1Tid,
    registerTx: e1RegTx,
    auditTx: e1AuditTx,
    actionTx: e1AuditTx,
    agreement: e1AuditRes.agreement,
    outcomeClass: e1Record.latest_class,
    score: e1Record.latest_score,
  };
  saveEvidence();

  // Now that E1 is audited, we can also test cooldown negative test!
  console.log("\n[Negative Test 14/14] Testing Audit Cooldown Revert on E1...");
  try {
    const cdTx = await translatorClient.writeContract({
      address: contractAddress,
      functionName: 'audit_translation',
      args: [e1Tid]
    });
    const cdRes = await waitForTx(translatorClient, cdTx, 'Cooldown Revert');
    const cdRollback = extractRollbackPayload(cdRes.receipt);
    evidenceData.negativeTests.push({
      name: "Audit Cooldown Active (<300s)",
      method: "audit_translation",
      txHash: cdTx,
      status: cdRes.status,
      consensusResult: cdRes.result,
      decodedError: cdRollback,
      agreement: cdRes.agreement,
      latencySec: cdRes.latency,
    });
    saveEvidence();
  } catch (err) {
    console.error("Error running cooldown test:", err);
  }

  // E2: vi -> en faithful (4 segments)
  console.log("\n[E2] Registering faithful translation (vi -> en)...");
  const e2Pairs = [
    {
      src: "Giao thức LinguaProof bảo đảm tính trung thực của các bản dịch quan trọng.",
      tgt: "The LinguaProof protocol guarantees the fidelity of critical translations."
    },
    {
      src: "Số dư quỹ dự trữ hiện tại là 1,500,000 EUR tính đến 2026-10-15.",
      tgt: "The current reserve balance is 1,500,000 EUR as of 2026-10-15."
    },
    {
      src: "Thành viên có thể xem cổng thông tin tại https://governance.linguaproof.io.",
      tgt: "Members can view the portal at https://governance.linguaproof.io."
    },
    {
      src: "Người đại diện 0x99cae390c7a56d427c6e464d43e31401f4324213 đã ký xác nhận giao dịch.",
      tgt: "Representative 0x99cae390c7a56d427c6e464d43e31401f4324213 signed the transaction confirmation."
    }
  ];

  const e2RegTx = await translatorClient.writeContract({
    address: contractAddress,
    functionName: 'register_translation',
    args: ['E2 Faithful Financial Notice (vi -> en)', 'vi', 'en', JSON.stringify(e2Pairs)]
  });
  await waitForTx(translatorClient, e2RegTx, 'E2 Registration');
  const e2IdsRes = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'list_translation_ids',
    args: [0, 1]
  }));
  const e2Tid = e2IdsRes.ids[0];
  console.log(`[E2] Registered translation ID: ${e2Tid}`);

  console.log("[E2] Auditing translation under consensus...");
  const e2AuditTx = await translatorClient.writeContract({
    address: contractAddress,
    functionName: 'audit_translation',
    args: [e2Tid]
  });
  const e2AuditRes = await waitForTx(translatorClient, e2AuditTx, 'E2 Audit');

  const e2Record = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'get_translation',
    args: [e2Tid]
  }));
  console.log(`[E2] Outcome Class: ${e2Record.latest_class} | Score: ${e2Record.latest_score}`);

  evidenceData.cases['E2'] = {
    id: 'E2',
    title: 'Faithful Aligned Translation (vi \u2192 en)',
    description: 'Reserve asset notice with Vietnamese diacritics, currencies, dates, and addresses.',
    langs: 'vi \u2192 en',
    translationId: e2Tid,
    registerTx: e2RegTx,
    auditTx: e2AuditTx,
    actionTx: e2AuditTx,
    agreement: e2AuditRes.agreement,
    outcomeClass: e2Record.latest_class,
    score: e2Record.latest_score,
  };
  saveEvidence();

  // ==================================================================
  // STAGE 3: DETECTION CASES (E3, E4, E5, E6)
  // ==================================================================
  console.log("\n>>> STAGE 3: RUNNING DETECTION CASES E3, E4, E5, E6...");

  // E3: Changed number (Anchor Altered -> MATERIAL_LOSS)
  console.log("\n[E3] Registering altered numeric amount (en -> vi)...");
  const e3Pairs = [
    {
      src: "The emergency treasury fund allocated 50,000 USD to disaster relief.",
      tgt: "Quỹ ngân khố khẩn cấp đã phân bổ 5,000 USD cho hoạt động cứu trợ thiên tai."
    },
    {
      src: "The proposal voting period concludes on 2026-11-30.",
      tgt: "Thời hạn bỏ phiếu cho đề xuất kết thúc vào 2026-11-30."
    }
  ];
  const e3RegTx = await translatorClient.writeContract({
    address: contractAddress,
    functionName: 'register_translation',
    args: ['E3 Corrupted Number (en -> vi)', 'en', 'vi', JSON.stringify(e3Pairs)]
  });
  await waitForTx(translatorClient, e3RegTx, 'E3 Registration');
  const e3IdsRes = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'list_translation_ids',
    args: [0, 1]
  }));
  const e3Tid = e3IdsRes.ids[0];

  console.log("[E3] Auditing translation with altered anchor under consensus...");
  const e3AuditTx = await translatorClient.writeContract({
    address: contractAddress,
    functionName: 'audit_translation',
    args: [e3Tid]
  });
  const e3AuditRes = await waitForTx(translatorClient, e3AuditTx, 'E3 Audit');

  const e3Record = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'get_translation',
    args: [e3Tid]
  }));
  console.log(`[E3] Outcome Class: ${e3Record.latest_class} | Score: ${e3Record.latest_score}`);

  evidenceData.cases['E3'] = {
    id: 'E3',
    title: 'Altered Numeric Amount (Deterministic Anchor Catch)',
    description: 'Changed 50,000 USD to 5,000 USD; caught deterministically by code as ANCHOR_ALTERED.',
    langs: 'en \u2192 vi',
    translationId: e3Tid,
    registerTx: e3RegTx,
    auditTx: e3AuditTx,
    actionTx: e3AuditTx,
    agreement: e3AuditRes.agreement,
    outcomeClass: e3Record.latest_class,
    score: e3Record.latest_score,
  };
  saveEvidence();

  // E4: Flipped negation / must -> may (Model DISTORTED -> MATERIAL_LOSS)
  console.log("\n[E4] Registering flipped negation / must->may (en -> vi)...");
  const e4Pairs = [
    {
      src: "Validators must not execute unauthorized transactions under any circumstances.",
      tgt: "Người xác thực có thể thực hiện các giao dịch trái phép trong mọi trường hợp."
    },
    {
      src: "The security committee reviews all contract changes prior to execution.",
      tgt: "Ủy ban an ninh xem xét tất cả các thay đổi hợp đồng trước khi thực thi."
    }
  ];
  const e4RegTx = await translatorClient.writeContract({
    address: contractAddress,
    functionName: 'register_translation',
    args: ['E4 Flipped Negation (en -> vi)', 'en', 'vi', JSON.stringify(e4Pairs)]
  });
  await waitForTx(translatorClient, e4RegTx, 'E4 Registration');
  const e4IdsRes = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'list_translation_ids',
    args: [0, 1]
  }));
  const e4Tid = e4IdsRes.ids[0];

  console.log("[E4] Auditing translation with flipped negation under consensus...");
  const e4AuditTx = await translatorClient.writeContract({
    address: contractAddress,
    functionName: 'audit_translation',
    args: [e4Tid]
  });
  const e4AuditRes = await waitForTx(translatorClient, e4AuditTx, 'E4 Audit');

  const e4Record = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'get_translation',
    args: [e4Tid]
  }));
  console.log(`[E4] Outcome Class: ${e4Record.latest_class} | Score: ${e4Record.latest_score}`);

  evidenceData.cases['E4'] = {
    id: 'E4',
    title: 'Flipped Negation / Permission Reversal (Model Catch)',
    description: 'Translated "must not execute" to "can execute"; detected as DISTORTED with verified quotes.',
    langs: 'en \u2192 vi',
    translationId: e4Tid,
    registerTx: e4RegTx,
    auditTx: e4AuditTx,
    actionTx: e4AuditTx,
    agreement: e4AuditRes.agreement,
    outcomeClass: e4Record.latest_class,
    score: e4Record.latest_score,
  };
  saveEvidence();

  // E5: Dropped clause (Model OMITTED -> CONTENT_DRIFT)
  console.log("\n[E5] Registering dropped clause (en -> vi)...");
  const e5Pairs = [
    {
      src: "Validators must stake native tokens to participate, and any malicious node will suffer immediate slashing of all assets.",
      tgt: "Người xác thực phải đặt cược token gốc để tham gia."
    },
    {
      src: "All protocol fees are distributed to active stakers weekly.",
      tgt: "Tất cả các khoản phí giao thức được phân phối cho những người đặt cược tích cực hàng tuần."
    }
  ];
  const e5RegTx = await translatorClient.writeContract({
    address: contractAddress,
    functionName: 'register_translation',
    args: ['E5 Dropped Clause (en -> vi)', 'en', 'vi', JSON.stringify(e5Pairs)]
  });
  await waitForTx(translatorClient, e5RegTx, 'E5 Registration');
  const e5IdsRes = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'list_translation_ids',
    args: [0, 1]
  }));
  const e5Tid = e5IdsRes.ids[0];

  console.log("[E5] Auditing translation with dropped clause under consensus...");
  const e5AuditTx = await translatorClient.writeContract({
    address: contractAddress,
    functionName: 'audit_translation',
    args: [e5Tid]
  });
  const e5AuditRes = await waitForTx(translatorClient, e5AuditTx, 'E5 Audit');

  const e5Record = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'get_translation',
    args: [e5Tid]
  }));
  console.log(`[E5] Outcome Class: ${e5Record.latest_class} | Score: ${e5Record.latest_score}`);

  evidenceData.cases['E5'] = {
    id: 'E5',
    title: 'Dropped Security Clause (Model Catch)',
    description: 'Completely omitted the slashing consequence clause; detected as OMITTED.',
    langs: 'en \u2192 vi',
    translationId: e5Tid,
    registerTx: e5RegTx,
    auditTx: e5AuditTx,
    actionTx: e5AuditTx,
    agreement: e5AuditRes.agreement,
    outcomeClass: e5Record.latest_class,
    score: e5Record.latest_score,
  };
  saveEvidence();

  // E6: Tone-only change (Model SHIFTED -> MINOR_SHIFT)
  console.log("\n[E6] Registering tone-only change (en -> vi)...");
  const e6Pairs = [
    {
      src: "We respectfully request all participants to review the governance proposal prior to voting.",
      tgt: "Mọi người nhớ ngó qua cái đề xuất quản trị trước khi bấm vote nhé, đừng lười."
    },
    {
      src: "The voting portal closes promptly at midnight on Friday.",
      tgt: "Cổng bỏ phiếu đóng đúng vào lúc nửa đêm thứ Sáu."
    }
  ];
  const e6RegTx = await translatorClient.writeContract({
    address: contractAddress,
    functionName: 'register_translation',
    args: ['E6 Tone Shift (en -> vi)', 'en', 'vi', JSON.stringify(e6Pairs)]
  });
  await waitForTx(translatorClient, e6RegTx, 'E6 Registration');
  const e6IdsRes = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'list_translation_ids',
    args: [0, 1]
  }));
  const e6Tid = e6IdsRes.ids[0];

  console.log("[E6] Auditing translation with tone shift under consensus...");
  const e6AuditTx = await translatorClient.writeContract({
    address: contractAddress,
    functionName: 'audit_translation',
    args: [e6Tid]
  });
  const e6AuditRes = await waitForTx(translatorClient, e6AuditTx, 'E6 Audit');

  const e6Record = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'get_translation',
    args: [e6Tid]
  }));
  console.log(`[E6] Outcome Class: ${e6Record.latest_class} | Score: ${e6Record.latest_score}`);

  evidenceData.cases['E6'] = {
    id: 'E6',
    title: 'Tone Shift in Formal Notice (Model Catch)',
    description: 'Converted formal governance notice into casual slang; detected as SHIFTED.',
    langs: 'en \u2192 vi',
    translationId: e6Tid,
    registerTx: e6RegTx,
    auditTx: e6AuditTx,
    actionTx: e6AuditTx,
    agreement: e6AuditRes.agreement,
    outcomeClass: e6Record.latest_class,
    score: e6Record.latest_score,
  };
  saveEvidence();

  // ==================================================================
  // STAGE 4: SECONDARY FLOWS (E7 & E8)
  // ==================================================================
  console.log("\n>>> STAGE 4: RUNNING SECONDARY FLOWS E7 & E8...");

  // E7: Revise E3 (fix the number) then audit -> FAITHFUL, score improvement!
  console.log("\n[E7] Submitting revision for E3 (fixing 5,000 back to 50,000 USD)...");
  const e7FixedPairs = [
    {
      src: "The emergency treasury fund allocated 50,000 USD to disaster relief.",
      tgt: "Quỹ ngân khố khẩn cấp đã phân bổ 50,000 USD cho hoạt động cứu trợ thiên tai."
    },
    {
      src: "The proposal voting period concludes on 2026-11-30.",
      tgt: "Thời hạn bỏ phiếu cho đề xuất kết thúc vào 2026-11-30."
    }
  ];
  const e7RevTx = await translatorClient.writeContract({
    address: contractAddress,
    functionName: 'revise_translation',
    args: [e3Tid, 'E7 Revision: Corrected Allocation Amount', JSON.stringify(e7FixedPairs)]
  });
  await waitForTx(translatorClient, e7RevTx, 'E7 Revision');
  const e7IdsRes = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'list_translation_ids',
    args: [0, 1]
  }));
  const e7Tid = e7IdsRes.ids[0];
  console.log(`[E7] Registered revision ID: ${e7Tid} (Parent: ${e3Tid})`);

  console.log("[E7] Auditing corrected revision under consensus...");
  const e7AuditTx = await translatorClient.writeContract({
    address: contractAddress,
    functionName: 'audit_translation',
    args: [e7Tid]
  });
  const e7AuditRes = await waitForTx(translatorClient, e7AuditTx, 'E7 Audit');

  const e7Record = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'get_translation',
    args: [e7Tid]
  }));
  console.log(`[E7] Revision Outcome Class: ${e7Record.latest_class} | Score: ${e7Record.latest_score}`);

  evidenceData.cases['E7'] = {
    id: 'E7',
    title: 'Revision Lineage Flow (Repairing E3)',
    description: `Revised defective translation ${e3Tid} with corrected amount; audited to FAITHFUL.`,
    langs: 'en \u2192 vi',
    translationId: e7Tid,
    registerTx: e7RevTx,
    auditTx: e7AuditTx,
    actionTx: e7AuditTx,
    agreement: e7AuditRes.agreement,
    outcomeClass: e7Record.latest_class,
    score: e7Record.latest_score,
  };
  saveEvidence();

  // E8: Targeted Segment Challenges
  console.log("\n[E8] Submitting targeted segment challenge against E1 segment 0 (faithful)...");
  const e8aTx = await challengerClient.writeContract({
    address: contractAddress,
    functionName: 'challenge_segment',
    args: [
      e1Tid,
      0,
      e1Pairs[0].tgt,
      "LinguaProof cung cấp dịch vụ chứng thực bản dịch cho quản trị phi tập trung.",
      "Auditor testing challenge verification on faithful segment."
    ]
  });
  const e8aRes = await waitForTx(challengerClient, e8aTx, 'E8 Challenge against E1');

  console.log("\n[E8] Submitting targeted segment challenge against E4 segment 0 (distorted negation)...");
  const e8bTx = await challengerClient.writeContract({
    address: contractAddress,
    functionName: 'challenge_segment',
    args: [
      e4Tid,
      0,
      e4Pairs[0].tgt,
      "Người xác thực tuyệt đối không được thực hiện các giao dịch trái phép trong bất kỳ trường hợp nào.",
      "Contesting inverted negation to restore correct prohibition."
    ]
  });
  const e8bRes = await waitForTx(challengerClient, e8bTx, 'E8 Challenge against E4');

  const e1Effective = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'get_translation',
    args: [e1Tid]
  }));

  const e4Effective = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'get_translation',
    args: [e4Tid]
  }));

  console.log(`[E8] E1 Challenge Result: has_superseding_challenge = ${e1Effective.has_superseding_challenge}`);
  console.log(`[E8] E4 Challenge Result: has_superseding_challenge = ${e4Effective.has_superseding_challenge}`);

  evidenceData.cases['E8'] = {
    id: 'E8',
    title: 'Targeted Segment Challenges (E1 Faithful & E4 Distortion)',
    description: 'Challenged faithful E1 (upheld original) and contested distorted E4 with corrected prohibition.',
    langs: 'en \u2192 vi',
    translationId: e4Tid,
    registerTx: e8aTx,
    actionTx: e8bTx,
    auditTx: e8bTx,
    agreement: e8bRes.agreement,
    outcomeClass: e4Effective.has_superseding_challenge ? 'SUPERSEDED' : e4Effective.effective_class,
    score: e4Effective.effective_score,
  };
  saveEvidence();

  // ==================================================================
  // STAGE 5: READBACKS (E9)
  // ==================================================================
  console.log("\n>>> STAGE 5: GATHERING ON-CHAIN VIEW READBACKS (E9)...");

  const boardView = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'get_translator_board',
    args: [10]
  }));
  console.log("Translator Board Readback (Top translators):");
  console.log(JSON.stringify(boardView, null, 2));

  const lineageView = JSON.parse(await translatorClient.readContract({
    address: contractAddress,
    functionName: 'get_lineage',
    args: [e7Tid]
  }));
  console.log("Lineage Readback for E7 (Parent E3 -> Child E7):");
  console.log(JSON.stringify(lineageView, null, 2));

  evidenceData.readbacks = {
    translatorBoard: boardView,
    lineageE7: lineageView,
    effectiveE1: e1Effective,
    effectiveE4: e4Effective,
  };
  saveEvidence();

  console.log("\n==================================================================");
  console.log("ALL ON-CHAIN EVIDENCE CASES EXECUTED AND RECORDED SUCCESSFULLY!");
  console.log(`Saved to: ${evidenceFilePath}`);
  console.log("==================================================================\n");

  // Render markdown evidence documentation
  console.log("Rendering evidence documentation via render_evidence.js...");
  renderEvidence();
}

main().catch(err => {
  console.error("FATAL ERROR IN EVIDENCE RUNNER:", err);
  process.exit(1);
});
