import os
import json
import re
import sys

def check_consistency():
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    deployments_path = os.path.join(root, "scripts", "deploy", "deployments.json")
    live_evidence_path = os.path.join(root, "scripts", "deploy", "live_evidence.json")
    readme_path = os.path.join(root, "README.md")
    docs_dir = os.path.join(root, "docs")

    if not os.path.exists(deployments_path):
        print("deployments.json missing, skipping check.")
        return

    with open(deployments_path, "r", encoding="utf-8") as f:
        deployments = json.load(f)

    if not os.path.exists(live_evidence_path):
        print("live_evidence.json not created yet, skipping check.")
        return

    with open(live_evidence_path, "r", encoding="utf-8") as f:
        live_evidence = json.load(f)

    # 1. Main contract address match
    expected_main = deployments["mainContract"]["contractAddress"].lower()
    actual_main = live_evidence["contractAddress"].lower()
    assert actual_main == expected_main, f"Main contract address mismatch: {actual_main} vs {expected_main}"

    # 2. Collect all active identifiers (hashes and addresses)
    active_hashes = set()
    def collect_hashes(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if isinstance(v, str):
                    if v.startswith("0x") and (len(v) == 66 or len(v) == 42):
                        active_hashes.add(v.lower())
                collect_hashes(v)
        elif isinstance(obj, list):
            for it in obj:
                collect_hashes(it)

    collect_hashes(deployments)
    collect_hashes(live_evidence)

    # 3. Collect superseded addresses
    superseded_addrs = [
        s["contractAddress"].lower()
        for s in deployments.get("supersededDeployments", [])
        if "contractAddress" in s
    ]

    # 4. Check markdown docs
    files_to_check = []
    if os.path.exists(readme_path):
        files_to_check.append(readme_path)
    for fname in os.listdir(docs_dir):
        if fname.endswith(".md"):
            files_to_check.append(os.path.join(docs_dir, fname))

    truncated_pattern = re.compile(r"0x[a-fA-F0-9]{4,16}\.\.\.[a-fA-F0-9]{4,16}")

    for fpath in files_to_check:
        fname = os.path.basename(fpath)
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()

        # No truncated hashes
        trunc_matches = truncated_pattern.findall(content)
        assert not trunc_matches, f"Truncated hash found in {fname}: {trunc_matches}"

        # Superseded address must only appear in README.md and deployments.json (and PROBES.md where it was measured)
        if fname not in ("README.md", "PROBES.md", "CALIBRATION.md"):
            for s_addr in superseded_addrs:
                assert s_addr not in content.lower(), (
                    f"Superseded address {s_addr} found in {fname}! It may only appear in README.md and diagnostic probe docs."
                )

        # Check for undefined in tables
        for line_no, line in enumerate(content.split("\n"), 1):
            if "|" in line:
                assert "undefined" not in line.lower(), f"'undefined' found in markdown table in {fname}:{line_no}"

    # 5. Check that every case described as on-chain in live_evidence has valid tx hash
    for case_id, case_data in live_evidence.get("cases", {}).items():
        assert "registerTx" in case_data and case_data["registerTx"].startswith("0x") and len(case_data["registerTx"]) == 66, (
            f"Case {case_id} missing valid registerTx"
        )
        act_tx = case_data.get("actionTx") or case_data.get("auditTx")
        assert act_tx and act_tx.startswith("0x") and len(act_tx) == 66, (
            f"Case {case_id} missing valid auditTx/actionTx"
        )

    print("PASSED: Evidence consistency verified across deployments.json, live_evidence.json, README.md, and docs.")

if __name__ == "__main__":
    check_consistency()
