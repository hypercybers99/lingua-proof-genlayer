const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { createClient, chains, createAccount } = require('genlayer-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RPC_URL = "https://studio.genlayer.com/api";

async function main() {
  console.log("==================================================================");
  console.log("LINGUAPROOF: DEPLOY MAIN CONTRACT");
  console.log("Network:  GenLayer Studionet (Preview) | Chain ID: 61999");
  console.log("RPC:      https://studio.genlayer.com/api");
  console.log("==================================================================\n");

  const account = createAccount();
  console.log("Deployer account:", account.address);

  const client = createClient({
    chain: chains.studionet,
    account: account,
  });

  const contractPath = path.join(__dirname, '../../contracts/LinguaProof.py');
  const code = fs.readFileSync(contractPath, 'utf8');
  const codeSha256 = crypto.createHash('sha256').update(code, 'utf8').digest('hex');
  console.log("Local contract source SHA-256:", codeSha256);

  console.log("\n1. Submitting deployContract to GenLayer Studionet (Preview)...");
  const t0 = Date.now();
  const deployTxHash = await client.deployContract({
    code: code,
    args: [],
  });
  console.log("Deploy transaction submitted:", deployTxHash);

  console.log("Waiting for receipt...");
  const receipt = await client.waitForTransactionReceipt({
    hash: deployTxHash,
    retries: 120,
    interval: 3000,
  });
  const latency = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`Deployed in ${latency}s.`);
  console.log("Status:   ", receipt.status_name);
  console.log("Consensus:", receipt.result_name);

  const contractAddress = receipt.recipient;
  console.log("Deployed Contract Address:", contractAddress);

  if (!contractAddress || receipt.status_name !== 'ACCEPTED') {
    throw new Error(`Deployment failed or not accepted: ${JSON.stringify(receipt)}`);
  }

  // Verify on-chain rubric view readback
  const rubricView = await client.readContract({
    address: contractAddress,
    functionName: 'get_rubric',
    args: [],
  });
  const parsedRubric = JSON.parse(rubricView);
  console.log("\nOn-chain get_rubric readback verified. Schema version:", parsedRubric.schema_version);
  console.log("Allowed languages:", parsedRubric.constants.ALLOWED_LANGS.join(", "));

  // Read existing deployments.json
  const depPath = path.join(__dirname, 'deployments.json');
  let deployments = {};
  if (fs.existsSync(depPath)) {
    deployments = JSON.parse(fs.readFileSync(depPath, 'utf8'));
  }

  deployments.network = "GenLayer Studionet (Preview)";
  deployments.chainId = 61999;
  deployments.rpc = RPC_URL;
  deployments.explorerUrl = "https://explorer-studio.genlayer.com";
  deployments.mainContract = {
    name: "LinguaProof",
    contractAddress: contractAddress,
    deployTxHash: deployTxHash,
    sourceSha256: codeSha256,
    deployedAt: new Date().toISOString(),
    deployLatencySec: latency,
    status: receipt.status_name,
    result: receipt.result_name,
    explorerUrl: `https://explorer-studio.genlayer.com/address/${contractAddress}`,
  };

  fs.writeFileSync(depPath, JSON.stringify(deployments, null, 2));
  console.log(`\nUpdated ${depPath} successfully.`);
}

main().catch(err => {
  console.error("DEPLOYMENT FAILED:", err);
  process.exit(1);
});
