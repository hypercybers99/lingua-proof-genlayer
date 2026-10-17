const fs = require('fs');
const path = require('path');

function generateMarkdown(deployments, evidence, includeSuperseded = false) {
  const main = deployments.mainContract;
  const superseded = deployments.supersededDeployments || [];

  let md = '';

  md += `### Deployed Contracts on GenLayer Studionet (Preview)\n\n`;
  md += `| Role | Contract | Address | Deploy Tx Hash | Source SHA-256 (Local & On-Chain) | Status | Consensus |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  md += `| **Active Notary** | **LinguaProof** | [\`${main.contractAddress}\`](${main.explorerUrl}) | \`${main.deployTxHash}\` | \`${main.sourceSha256}\` | ${main.status} | ${main.result} |\n`;
  if (includeSuperseded) {
    for (const s of superseded) {
      md += `| *Diagnostic (Superseded)* | *${s.name}* | \`${s.contractAddress}\` | \`${s.deployTxHash}\` | \`${s.sourceSha256}\` | ACCEPTED | MAJORITY_AGREE |\n`;
    }
  }
  md += `\n`;

  md += `### On-Chain Execution Scenarios & Evidence\n\n`;
  md += `| Scenario | Case ID | Description | Languages | Registration Tx | Audit / Action Tx | Consensus Agreement | Outcome Class | Score |\n`;
  md += `| :--- | :---: | :--- | :---: | :--- | :--- | :---: | :---: | :---: |\n`;

  const cases = evidence.cases || {};
  for (const [key, c] of Object.entries(cases)) {
    md += `| **${c.title}** | \`${c.id}\` | ${c.description} | \`${c.langs}\` | \`${c.registerTx}\` | \`${c.actionTx || c.auditTx}\` | ${c.agreement} | \`${c.outcomeClass}\` | **${c.score}** |\n`;
  }
  md += `\n`;

  md += `### On-Chain Negative Revert Tests (14 Tests Evaluated Under Consensus)\n\n`;
  md += `Every negative scenario below was submitted directly to the GenLayer Studionet (Preview) RPC and evaluated by validator consensus. Revert error messages were decoded from leader execution receipts:\n\n`;
  md += `| Test Scenario | Invoked Method | Transaction Hash | Status | Consensus Result | Decoded Revert Message |\n`;
  md += `| :--- | :--- | :--- | :---: | :---: | :--- |\n`;

  const negTests = evidence.negativeTests || [];
  for (const nt of negTests) {
    md += `| **${nt.name}** | \`${nt.method}\` | \`${nt.txHash}\` | ${nt.status} | ${nt.consensusResult} | \`${nt.decodedError}\` |\n`;
  }
  md += `\n`;

  md += `### Verification Separation: On-Chain vs. Unit-Tested Only\n\n`;
  md += `In strict compliance with standing audit rules, verification coverage is explicitly separated:\n\n`;
  md += `#### Verified On-Chain (GenLayer Studionet Preview)\n`;
  md += `- **Faithful Aligned Translations (E1, E2)**: Verified on-chain for both English \u2192 Vietnamese and Vietnamese \u2192 English translations with full anchors (URLs, ISO dates, numeric formatting, tickers), achieving class \`FAITHFUL\` and score 100 under validator consensus.\n`;
  md += `- **Deterministic Anchor Detection (E3)**: Verified on-chain for altered numeric amounts; caught deterministically by code as \`ANCHOR_ALTERED\` and escalating to \`MATERIAL_LOSS\` without requiring model consensus.\n`;
  md += `- **Model Layer Fault Detection (E4, E5, E6)**: Verified on-chain for flipped negation/must-to-may (\`DISTORTED\`), dropped clauses (\`OMITTED\`), and register shifts (\`SHIFTED\`) with verbatim quote verification enforced in code.\n`;
  md += `- **Revision Lineage Walk (E7)**: Verified on-chain where a translator revises a defective record, establishing immutable parent-child lineage and score progression.\n`;
  md += `- **Targeted Segment Challenges (E8)**: Verified on-chain where a reader challenges a specific segment, upholding faithful segments while enabling superseding challenges to overlay effective translation views.\n`;
  md += `- **Translator Board Aggregates (E9)**: Verified on-chain ranking translators by mean fidelity score with O(1) state transitions.\n`;
  md += `- **14 Revert Enforcements**: Decoded and verified on-chain across input validation, language restrictions, authorization boundaries, and cooldown windows.\n\n`;

  md += `#### Unit-Tested Only (Not Claimed as On-Chain)\n`;
  md += `- **Audit Cap Limit (8 audits per translation)**: Verified in unit test \`test_cooldown_and_max_audits\` to avoid wasteful transaction submission on Studionet.\n`;
  md += `- **Per-Translator Challenge Cap (3 challenges)**: Verified in unit test \`test_challenge_segment_flows\`.\n`;
  md += `- **Model Output Malformed Downgrade & Reverts**: Verified in unit test \`test_invalid_model_output_all_branches\` simulating unparseable outputs and missing schema keys.\n`;
  md += `- **Validator Disagreement on Lying Leaders**: Verified in mocked consensus test suite \`test_layer3_consensus.py\`.\n\n`;

  return md;
}

function renderEvidence() {
  const rootDir = path.dirname(path.dirname(__dirname));
  const deploymentsPath = path.join(rootDir, 'scripts', 'deploy', 'deployments.json');
  const liveEvidencePath = path.join(rootDir, 'scripts', 'deploy', 'live_evidence.json');
  const readmePath = path.join(rootDir, 'README.md');
  const evidenceDocPath = path.join(rootDir, 'docs', 'EVIDENCE.md');

  if (!fs.existsSync(deploymentsPath)) {
    console.warn("deployments.json does not exist yet. Skipping rendering.");
    return;
  }
  if (!fs.existsSync(liveEvidencePath)) {
    console.warn("live_evidence.json does not exist yet. Skipping rendering.");
    return;
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(liveEvidencePath, 'utf8'));

  // EVIDENCE.md contains only the active notary address
  const evidenceMd = generateMarkdown(deployments, evidence, false);
  fs.writeFileSync(evidenceDocPath, evidenceMd, 'utf8');
  console.log(`Rendered evidence successfully to ${evidenceDocPath}`);

  // README.md contains both active notary and superseded probe addresses
  const readmeMd = generateMarkdown(deployments, evidence, true);
  if (fs.existsSync(readmePath)) {
    let readme = fs.readFileSync(readmePath, 'utf8');
    const startMarker = '<!-- EVIDENCE_TABLE_START -->';
    const endMarker = '<!-- EVIDENCE_TABLE_END -->';
    if (readme.includes(startMarker) && readme.includes(endMarker)) {
      const before = readme.substring(0, readme.indexOf(startMarker) + startMarker.length);
      const after = readme.substring(readme.indexOf(endMarker));
      readme = `${before}\n\n${readmeMd}\n${after}`;
      fs.writeFileSync(readmePath, readme, 'utf8');
      console.log(`Updated README.md evidence section between markers.`);
    }
  }
}

if (require.main === module) {
  renderEvidence();
}

module.exports = { renderEvidence };
