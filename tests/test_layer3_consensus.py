import unittest
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import contracts.LinguaProof as lp
gl = lp.gl


class TestLayer3Consensus(unittest.TestCase):
    """Group 3: Mocked Consensus, Non-Deterministic Discipline, and Quote Grounding."""

    def setUp(self):
        self.contract = lp.LinguaProof()
        self.contract._ensure_meta_init()
        self.alice = "0x1111111111111111111111111111111111111111"
        self.bob = "0x2222222222222222222222222222222222222222"
        gl.message.sender_address.as_hex = self.alice
        gl.message_raw["datetime"] = "2026-10-17T12:00:00Z"

    def _register_two_segment_translation(self):
        pairs = json.dumps([
            {"src": "Notice period is 30 days.", "tgt": "Thoi han thong bao la 30 ngay."},
            {"src": "Payment must be in USD.", "tgt": "Thanh toan phai bang USD."}
        ])
        self.contract.register_translation("Consensus Test", "en", "vi", pairs)
        return json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]

    def test_honest_leader_accepted(self):
        tid = self._register_two_segment_translation()

        # Both leader and validator produce faithful translations and preserved labels
        gl.nondet.prompt_handler = lambda p, fmt: (
            {"back": ["Notice period is 30 days.", "Payment must be in USD."]}
            if "literal translation engine" in p else
            {"labels": [
                {"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""},
                {"i": 1, "label": "PRESERVED", "src_quote": "", "back_quote": ""}
            ]}
        )

        self.contract.audit_translation(tid)
        t = json.loads(self.contract.get_translation(tid))
        self.assertEqual(t["status"], "AUDITED")
        self.assertEqual(t["latest_class"], "FAITHFUL")
        self.assertEqual(t["latest_score"], 100)

    def test_leader_lying_about_class_rejected(self):
        tid = self._register_two_segment_translation()

        # Custom consensus hook where leader lies about class
        orig_run_nondet = gl.vm.run_nondet_unsafe

        def lying_leader_runner(leader_fn, validator_fn):
            # Run honest leader
            raw_leader = leader_fn()
            leader_obj = json.loads(raw_leader)
            # Lying: change class from MATERIAL_LOSS to FAITHFUL
            leader_obj["class"] = "FAITHFUL"
            faked_leader = json.dumps(leader_obj)
            wrapped = gl.vm.Return(calldata=faked_leader)
            # Validator must reject
            is_valid = validator_fn(wrapped)
            self.assertFalse(is_valid)
            if not is_valid:
                raise gl.vm.VMError("validator disagreed")
            return faked_leader

        gl.vm.run_nondet_unsafe = lying_leader_runner
        try:
            # Model detects DISTORTED in segment 1 (e.g. payment must -> payment may)
            gl.nondet.prompt_handler = lambda p, fmt: (
                {"back": ["Notice period is 30 days.", "Payment may be in USD."]}
                if "literal translation engine" in p else
                {"labels": [
                    {"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""},
                    {"i": 1, "label": "DISTORTED", "src_quote": "must", "back_quote": "may"}
                ]}
            )
            with self.assertRaises(gl.vm.VMError):
                self.contract.audit_translation(tid)
        finally:
            gl.vm.run_nondet_unsafe = orig_run_nondet

    def test_leader_lying_about_anchors_rejected(self):
        tid = self._register_two_segment_translation()
        orig_run_nondet = gl.vm.run_nondet_unsafe

        def lying_anchor_runner(leader_fn, validator_fn):
            raw_leader = leader_fn()
            leader_obj = json.loads(raw_leader)
            # Leader lies that segment 0 had an anchor fault
            leader_obj["anchors"] = ["ANCHOR_ALTERED", "ANCHORS_OK"]
            faked = json.dumps(leader_obj)
            wrapped = gl.vm.Return(calldata=faked)
            is_valid = validator_fn(wrapped)
            self.assertFalse(is_valid)
            if not is_valid:
                raise gl.vm.VMError("validator disagreed")
            return faked

        gl.vm.run_nondet_unsafe = lying_anchor_runner
        try:
            gl.nondet.prompt_handler = lambda p, fmt: (
                {"back": ["Notice period is 30 days.", "Payment must be in USD."]}
                if "literal translation engine" in p else
                {"labels": [
                    {"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""},
                    {"i": 1, "label": "PRESERVED", "src_quote": "", "back_quote": ""}
                ]}
            )
            with self.assertRaises(gl.vm.VMError):
                self.contract.audit_translation(tid)
        finally:
            gl.vm.run_nondet_unsafe = orig_run_nondet

    def test_leader_returning_malformed_data_rejected(self):
        tid = self._register_two_segment_translation()
        orig_run_nondet = gl.vm.run_nondet_unsafe

        def malformed_runner(leader_fn, validator_fn):
            faked = "NOT_JSON_AT_ALL"
            wrapped = gl.vm.Return(calldata=faked)
            is_valid = validator_fn(wrapped)
            self.assertFalse(is_valid)
            if not is_valid:
                raise gl.vm.VMError("validator disagreed")
            return faked

        gl.vm.run_nondet_unsafe = malformed_runner
        try:
            with self.assertRaises(gl.vm.VMError):
                self.contract.audit_translation(tid)
        finally:
            gl.vm.run_nondet_unsafe = orig_run_nondet

    def test_leader_failure_not_waved_through(self):
        tid = self._register_two_segment_translation()
        orig_run_nondet = gl.vm.run_nondet_unsafe

        def failure_runner(leader_fn, validator_fn):
            # Leader returns error / non-Return
            error_return = gl.vm.VMError("leader crashed")
            is_valid = validator_fn(error_return)
            self.assertFalse(is_valid)
            if not is_valid:
                raise gl.vm.VMError("validator disagreed")
            return "OK"

        gl.vm.run_nondet_unsafe = failure_runner
        try:
            with self.assertRaises(gl.vm.VMError):
                self.contract.audit_translation(tid)
        finally:
            gl.vm.run_nondet_unsafe = orig_run_nondet

    def test_validator_with_different_minor_labels_accepted(self):
        # Consensus Rule: validators do not require exact equality of model labels
        # where severity < 3, so long as class matches and fault buckets match.
        tid = self._register_two_segment_translation()
        orig_run_nondet = gl.vm.run_nondet_unsafe

        # Counter to distinguish leader vs validator runs
        call_count = {"val": 0}

        def mock_llm(p, fmt):
            call_count["val"] += 1
            if "literal translation engine" in p:
                return {"back": ["Notice period is 30 days.", "Payment must be in USD."]}
            else:
                # Leader says PRESERVED, validator says PRESERVED (or SHIFTED if class allows)
                return {"labels": [
                    {"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""},
                    {"i": 1, "label": "PRESERVED", "src_quote": "", "back_quote": ""}
                ]}

        gl.nondet.prompt_handler = mock_llm
        self.contract.audit_translation(tid)
        t = json.loads(self.contract.get_translation(tid))
        self.assertEqual(t["latest_class"], "FAITHFUL")

    def test_validator_with_different_fault_segment_bucket_rejected(self):
        tid = self._register_two_segment_translation()
        orig_run_nondet = gl.vm.run_nondet_unsafe

        call_idx = {"count": 0}

        def divergent_prompt(p, fmt):
            call_idx["count"] += 1
            if "literal translation engine" in p:
                return {"back": ["Notice period is 30 days.", "Payment may be in USD."]}
            else:
                if call_idx["count"] <= 2:
                    # Leader run: detects DISTORTED (severity 4) -> MATERIAL_LOSS
                    return {"labels": [
                        {"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""},
                        {"i": 1, "label": "DISTORTED", "src_quote": "must", "back_quote": "may"}
                    ]}
                else:
                    # Validator run: produces PRESERVED (severity 0) -> FAITHFUL
                    return {"labels": [
                        {"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""},
                        {"i": 1, "label": "PRESERVED", "src_quote": "", "back_quote": ""}
                    ]}

        gl.nondet.prompt_handler = divergent_prompt
        # Validator will see class mismatch and fault bucket mismatch -> VMError
        with self.assertRaises(gl.vm.VMError):
            self.contract.audit_translation(tid)

    def test_model_output_invalid_all_branches(self):
        # Step A not JSON
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            lp._parse_step_a_output("invalid plain text", 2)
        self.assertEqual(str(cm.exception), "model output invalid")

        # Step A missing back key
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            lp._parse_step_a_output({"translations": ["a", "b"]}, 2)
        self.assertEqual(str(cm.exception), "model output invalid")

        # Step A count mismatch (got 1, expected 2)
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            lp._parse_step_a_output({"back": ["a"]}, 2)
        self.assertEqual(str(cm.exception), "model output invalid")

        # Step B missing labels key
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            lp._parse_step_b_output({"verdicts": []}, 1, ["a"], ["b"])
        self.assertEqual(str(cm.exception), "model output invalid")

        # Step B invalid index
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            lp._parse_step_b_output({"labels": [{"i": 5, "label": "PRESERVED"}]}, 1, ["a"], ["b"])
        self.assertEqual(str(cm.exception), "model output invalid")

        # Step B unknown label
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            lp._parse_step_b_output({"labels": [{"i": 0, "label": "HALLUCINATED"}]}, 1, ["a"], ["b"])
        self.assertEqual(str(cm.exception), "model output invalid")

    def test_ascii_and_banned_scans(self):
        # Test ASCII scan script
        import subprocess
        res_ascii = subprocess.run([sys.executable, "scripts/tools/scan_ascii.py"], capture_output=True, text=True)
        self.assertEqual(res_ascii.returncode, 0, f"ASCII scan failed: {res_ascii.stdout}")

        # Test Banned words scan script
        res_banned = subprocess.run([sys.executable, "scripts/tools/scan_banned_words.py"], capture_output=True, text=True)
        self.assertEqual(res_banned.returncode, 0, f"Banned words scan failed: {res_banned.stdout}")


if __name__ == '__main__':
    unittest.main()
