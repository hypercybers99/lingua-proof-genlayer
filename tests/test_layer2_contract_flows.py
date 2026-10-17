import unittest
import json
import os
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import contracts.LinguaProof as lp
gl = lp.gl
Address = lp.Address


class TestLayer2ContractFlows(unittest.TestCase):
    """Group 2: Registration, Validation, Lineage, Revision, Board, and View Flows."""

    def setUp(self):
        # Reset contract and mock state
        self.contract = lp.LinguaProof()
        self.contract._ensure_meta_init()
        self.alice = "0x1111111111111111111111111111111111111111"
        self.bob = "0x2222222222222222222222222222222222222222"
        self.charlie = "0x3333333333333333333333333333333333333333"
        gl.message.sender_address.as_hex = self.alice
        gl.message_raw["datetime"] = "2026-10-17T10:00:00Z"

    def _sample_pairs(self, n=2):
        pairs = []
        for i in range(n):
            pairs.append({
                "src": f"Clause {i}: Party A shall deliver goods.",
                "tgt": f"Dieu khoan {i}: Ben A phai giao hang hoa."
            })
        return json.dumps(pairs)

    def test_validation_label_length(self):
        # Too short (< 3)
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("AB", "en", "vi", self._sample_pairs(1))
        self.assertEqual(str(cm.exception), "invalid label length")

        # Too long (> 80)
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("A" * 81, "en", "vi", self._sample_pairs(1))
        self.assertEqual(str(cm.exception), "invalid label length")

    def test_validation_unsupported_language(self):
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "xx", "vi", self._sample_pairs(1))
        self.assertEqual(str(cm.exception), "unsupported language")

        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "zz", self._sample_pairs(1))
        self.assertEqual(str(cm.exception), "unsupported language")

    def test_validation_same_languages(self):
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "en", self._sample_pairs(1))
        self.assertEqual(str(cm.exception), "source and target language must differ")

    def test_validation_pairs_json_syntax(self):
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "vi", "not valid json {")
        self.assertEqual(str(cm.exception), "pairs_json is not valid JSON")

    def test_validation_pairs_count_bounds(self):
        # 0 pairs
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "vi", "[]")
        self.assertEqual(str(cm.exception), "pairs must be a list of 1 to 12 objects")

        # 13 pairs (> 12)
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "vi", self._sample_pairs(13))
        self.assertEqual(str(cm.exception), "pairs must be a list of 1 to 12 objects")

    def test_validation_pair_keys_and_types(self):
        bad_pair = json.dumps([{"source": "Hello", "target": "Xin chao"}])
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "vi", bad_pair)
        self.assertEqual(str(cm.exception), "each pair needs exactly src and tgt strings")

        bad_type = json.dumps([{"src": 123, "tgt": "Xin chao"}])
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "vi", bad_type)
        self.assertEqual(str(cm.exception), "each pair needs exactly src and tgt strings")

    def test_validation_control_characters(self):
        ctrl_pair = json.dumps([{"src": "Valid source\x00bad", "tgt": "Valid target"}])
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "vi", ctrl_pair)
        self.assertEqual(str(cm.exception), "segment contains control characters")

    def test_validation_src_and_tgt_length(self):
        # Short src (< 3 chars)
        short_src = json.dumps([{"src": "Hi", "tgt": "Xin chao"}])
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "vi", short_src)
        self.assertEqual(str(cm.exception), "source segment length out of range")

        # Long src (> 400 chars)
        long_src = json.dumps([{"src": "A" * 401, "tgt": "Xin chao"}])
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "vi", long_src)
        self.assertEqual(str(cm.exception), "source segment length out of range")

        # Empty tgt (< 1 char)
        empty_tgt = json.dumps([{"src": "Valid source", "tgt": "   "}])
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "vi", empty_tgt)
        self.assertEqual(str(cm.exception), "target segment length out of range")

        # Long tgt (> 600 chars)
        long_tgt = json.dumps([{"src": "Valid source", "tgt": "B" * 601}])
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "vi", long_tgt)
        self.assertEqual(str(cm.exception), "target segment length out of range")

    def test_validation_total_source_length(self):
        # Total src > 2400 (7 segments * 380 chars = 2660 > 2400)
        big_pairs = json.dumps([{"src": f"Clause {i}: " + "A" * 370, "tgt": "B" * 50} for i in range(7)])
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "vi", big_pairs)
        self.assertEqual(str(cm.exception), "total source text too long")

    def test_validation_duplicate_source_segment(self):
        dup_src = json.dumps([
            {"src": "Clause 1: Identical sentence.", "tgt": "Dieu 1: Cau giong nhau."},
            {"src": "Clause 1: Identical sentence.", "tgt": "Dieu 2: Cau khac."}
        ])
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "vi", dup_src)
        self.assertEqual(str(cm.exception), "duplicate source segment")

    def test_validation_target_equals_source(self):
        # Copy of natural text -> rejected
        copy_pair = json.dumps([{"src": "This is purely English text.", "tgt": "This is purely English text."}])
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Valid Label", "en", "vi", copy_pair)
        self.assertEqual(str(cm.exception), "target equals source")

        # Anchors only segment (numbers, URLs, addresses) -> allowed to be identical
        anchor_copy = json.dumps([
            {"src": "https://example.com/terms/ 0x1234567890abcdef1234567890abcdef12345678",
             "tgt": "https://example.com/terms/ 0x1234567890abcdef1234567890abcdef12345678"}
        ])
        # Should not raise "target equals source"
        self.contract.register_translation("Anchor Translation", "en", "vi", anchor_copy)

    def test_duplicate_registration_rejection(self):
        pairs = self._sample_pairs(2)
        self.contract.register_translation("First Reg", "en", "vi", pairs)
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.register_translation("Duplicate Reg", "en", "vi", pairs)
        self.assertEqual(str(cm.exception), "duplicate registration")

    def test_unicode_nfc_vs_nfd_normalization_consistency(self):
        # Vietnamese text with combined vs decomposed characters
        text_nfc = "Đăng ký tài khoản"
        text_nfd = unicodedata.normalize("NFD", text_nfc)
        self.assertNotEqual(text_nfc, text_nfd)

        pair_nfd = json.dumps([{"src": "Register account here.", "tgt": text_nfd}])
        self.contract.register_translation("NFD Test", "en", "vi", pair_nfd)

        # Retrieve stored translation
        t_ids_json = json.loads(self.contract.list_translation_ids(0, 10))
        tid = t_ids_json["ids"][0]
        stored_raw = json.loads(self.contract.get_translation(tid))
        stored_tgt = stored_raw["pairs"][0]["tgt"]

        # Assert stored target is normalized to NFC
        self.assertEqual(stored_tgt, unicodedata.normalize("NFC", text_nfd))

    def test_cooldown_and_max_audits(self):
        # Set up a registered translation
        self.contract.register_translation("Audit Flow", "en", "vi", self._sample_pairs(2))
        tid = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]

        # Mock model response for audit
        gl.nondet.prompt_handler = lambda p, fmt: (
            {"back": ["Clause 0: Party A must deliver.", "Clause 1: Party A must deliver."]}
            if "literal translation engine" in p else
            {"labels": [
                {"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""},
                {"i": 1, "label": "PRESERVED", "src_quote": "", "back_quote": ""}
            ]}
        )

        # Audit 1 at T=0
        gl.message_raw["datetime"] = "2026-10-17T10:00:00Z"
        self.contract.audit_translation(tid)

        # Attempt immediate audit at T=10s (< 300s) -> rejected
        gl.message_raw["datetime"] = "2026-10-17T10:00:10Z"
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.audit_translation(tid)
        self.assertEqual(str(cm.exception), "audit cooldown active")

        # Audit 2 at T=305s (> 300s) -> allowed
        gl.message_raw["datetime"] = "2026-10-17T10:05:05Z"
        self.contract.audit_translation(tid)

        # Run up to max audits (8 total)
        for i in range(3, 9):
            min_offset = 5 * i
            gl.message_raw["datetime"] = f"2026-10-17T10:{min_offset:02d}:00Z"
            self.contract.audit_translation(tid)

        # 9th audit -> maximum audits reached
        gl.message_raw["datetime"] = "2026-10-17T11:00:00Z"
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.audit_translation(tid)
        self.assertEqual(str(cm.exception), "maximum audits reached")

    def test_revise_translation_flow(self):
        self.contract.register_translation("Base Rev", "en", "vi", self._sample_pairs(2))
        tid = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]

        # Non-translator cannot revise
        gl.message.sender_address.as_hex = self.bob
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.revise_translation(tid, self._sample_pairs(3))
        self.assertEqual(str(cm.exception), "only the translator can revise")

        # Translator revises with identical pairs -> rejected
        gl.message.sender_address.as_hex = self.alice
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.revise_translation(tid, self._sample_pairs(2))
        self.assertEqual(str(cm.exception), "revision is identical to parent")

        # Valid revision with modified pairs
        rev_pairs = json.dumps([
            {"src": "Clause 0: Party A shall deliver goods.", "tgt": "Dieu 0: Ben A se giao hang hoa."},
            {"src": "Clause 1: Party A shall deliver goods.", "tgt": "Dieu 1: Ben A giao hang hoa."}
        ])
        self.contract.revise_translation(tid, rev_pairs)

        # Attempt to revise parent again -> rejected (already has a newer revision)
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.revise_translation(tid, self._sample_pairs(3))
        self.assertEqual(str(cm.exception), "translation already has a newer revision")

        # Verify lineage
        lineage = json.loads(self.contract.get_lineage(tid))
        self.assertEqual(len(lineage), 2)
        self.assertEqual(lineage[0]["revision"], 1)
        self.assertEqual(lineage[1]["revision"], 2)
        self.assertEqual(lineage[1]["parent_id"], tid)

    def test_challenge_segment_flows(self):
        # Register translation
        self.contract.register_translation("Challenge Target", "en", "vi", self._sample_pairs(2))
        tid = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]

        # Challenge before audit -> rejected ("audit first")
        gl.message.sender_address.as_hex = self.bob
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.challenge_segment(tid, 0, "Mistranslation in clause 0 obligation.")
        self.assertEqual(str(cm.exception), "audit first")

        # Perform audit
        gl.message.sender_address.as_hex = self.alice
        gl.nondet.prompt_handler = lambda p, fmt: (
            {"back": ["Party A shall deliver goods.", "Party A shall deliver goods."]}
            if "literal translation engine" in p else
            {"labels": [
                {"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""},
                {"i": 1, "label": "PRESERVED", "src_quote": "", "back_quote": ""}
            ]}
        )
        self.contract.audit_translation(tid)

        # Translator cannot challenge own translation
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.challenge_segment(tid, 0, "Self challenge reason long enough.")
        self.assertEqual(str(cm.exception), "translator cannot challenge own translation")

        # Challenger Bob tests bounds
        gl.message.sender_address.as_hex = self.bob

        # Segment index out of range
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.challenge_segment(tid, 5, "Reason long enough for testing.")
        self.assertEqual(str(cm.exception), "segment index out of range")

        # Reason too short (< 10)
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.challenge_segment(tid, 0, "Short")
        self.assertEqual(str(cm.exception), "challenge reason length out of range")

        # Mock targeted challenge finding DISTORTED (severity 4)
        gl.nondet.prompt_handler = lambda p, fmt: (
            {"back": ["Party A may deliver goods."]}
            if "literal translation engine" in p else
            {"labels": [
                {"i": 0, "label": "DISTORTED", "src_quote": "shall", "back_quote": "may"}
            ]}
        )

        # Bob challenges segment 0 -> succeeds and supersedes (targeted sev 4 > stored 0)
        self.contract.challenge_segment(tid, 0, "The obligation was weakened from shall to may.")
        challenges = json.loads(self.contract.get_challenges(tid, 0, 10))["items"]
        self.assertEqual(len(challenges), 1)
        self.assertTrue(challenges[0]["supersedes_latest"])
        self.assertEqual(challenges[0]["targeted_severity"], 4)

        # Check effective view on get_translation: class recomputed to MATERIAL_LOSS
        trans_view = json.loads(self.contract.get_translation(tid))
        self.assertTrue(trans_view["has_superseding_challenge"])
        self.assertEqual(trans_view["effective_class"], "MATERIAL_LOSS")
        self.assertEqual(trans_view["effective_segments"][0]["effective_severity"], 4)
        self.assertTrue(trans_view["effective_segments"][0]["has_superseding_challenge"])

        # Bob tests per-user cap (max 3 challenges)
        self.contract.challenge_segment(tid, 1, "Second challenge by Bob for segment 1.")
        self.contract.challenge_segment(tid, 1, "Third challenge by Bob for segment 1.")
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.challenge_segment(tid, 1, "Fourth challenge by Bob should fail.")
        self.assertEqual(str(cm.exception), "challenge limit reached for you")

    def test_translator_board_ranking_and_score_update(self):
        # Register translations for Alice and Charlie
        gl.message.sender_address.as_hex = self.alice
        self.contract.register_translation("Alice T1", "en", "vi", self._sample_pairs(2))
        alice_t1 = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]

        gl.message.sender_address.as_hex = self.charlie
        self.contract.register_translation("Charlie T1", "en", "vi", self._sample_pairs(2))
        charlie_t1 = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]

        # Board before audits is empty (audited translations >= 1 required)
        board_0 = json.loads(self.contract.get_translator_board(10))
        self.assertEqual(len(board_0), 0)

        # Audit Alice T1 with 100 score
        gl.message.sender_address.as_hex = self.alice
        gl.nondet.prompt_handler = lambda p, fmt: (
            {"back": ["Party A shall deliver goods.", "Party A shall deliver goods."]}
            if "literal translation engine" in p else
            {"labels": [
                {"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""},
                {"i": 1, "label": "PRESERVED", "src_quote": "", "back_quote": ""}
            ]}
        )
        self.contract.audit_translation(alice_t1)

        # Audit Charlie T1 with 50 score (1 preserved, 1 shifted)
        gl.nondet.prompt_handler = lambda p, fmt: (
            {"back": ["Party A shall deliver goods.", "Party A delivers goods quickly."]}
            if "literal translation engine" in p else
            {"labels": [
                {"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""},
                {"i": 1, "label": "SHIFTED", "src_quote": "goods", "back_quote": "goods"}
            ]}
        )
        self.contract.audit_translation(charlie_t1)

        board_1 = json.loads(self.contract.get_translator_board(10))
        self.assertEqual(len(board_1), 2)
        # Alice ranked #1 with 100, Charlie ranked #2 with 50
        self.assertEqual(board_1[0]["translator"], self.alice)
        self.assertEqual(board_1[0]["mean_score"], 100.0)
        self.assertEqual(board_1[1]["translator"], self.charlie)
        self.assertEqual(board_1[1]["mean_score"], 50.0)

        # Re-audit Charlie T1 after cooldown with improved score 100 -> score update verified
        gl.message_raw["datetime"] = "2026-10-17T11:00:00Z"
        gl.nondet.prompt_handler = lambda p, fmt: (
            {"back": ["Party A shall deliver goods.", "Party A shall deliver goods."]}
            if "literal translation engine" in p else
            {"labels": [
                {"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""},
                {"i": 1, "label": "PRESERVED", "src_quote": "", "back_quote": ""}
            ]}
        )
        self.contract.audit_translation(charlie_t1)

        board_2 = json.loads(self.contract.get_translator_board(10))
        charlie_entry = [b for b in board_2 if b["translator"] == self.charlie][0]
        self.assertEqual(charlie_entry["mean_score"], 100.0)

    def test_pagination_bounds_and_views(self):
        # Invalid pagination on views
        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.list_translation_ids(-1, 10)
        self.assertEqual(str(cm.exception), "invalid pagination")

        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.list_translation_ids(0, 0)
        self.assertEqual(str(cm.exception), "invalid pagination")

        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.list_translation_ids(0, 51)  # > 50
        self.assertEqual(str(cm.exception), "invalid pagination")

        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.get_translator_board(0)
        self.assertEqual(str(cm.exception), "invalid pagination")

        with self.assertRaises(lp.gl.vm.UserError) as cm:
            self.contract.get_translation("nonexistent")
        self.assertEqual(str(cm.exception), "translation not found")

        # Rubric view
        rubric = json.loads(self.contract.get_rubric())
        self.assertEqual(rubric["constants"]["MAX_SEGMENTS"], 12)
        self.assertIn("PRESERVED", rubric["rubric"])


    def test_deterministic_id_derivation(self):
        # Determinism check: same inputs with same nonce produce exact same ID
        pairs = json.dumps([{"src": "Deterministic test line.", "tgt": "Dong kiem tra xac dinh."}])
        self.contract.register_translation("Det 1", "en", "vi", pairs)
        tid1 = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]
        self.assertEqual(len(tid1), 12)

    def test_get_audits_pagination_and_ordering(self):
        self.contract.register_translation("Multi-Audit", "en", "vi", self._sample_pairs(2))
        tid = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]

        gl.nondet.prompt_handler = lambda p, fmt: (
            {"back": ["Party A shall deliver goods.", "Party A shall deliver goods."]}
            if "literal translation engine" in p else
            {"labels": [
                {"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""},
                {"i": 1, "label": "PRESERVED", "src_quote": "", "back_quote": ""}
            ]}
        )

        for i in range(1, 4):
            gl.message_raw["datetime"] = f"2026-10-17T1{i}:00:00Z"
            self.contract.audit_translation(tid)

        # Page 1: newest first (Audit 3 and 2)
        p1 = json.loads(self.contract.get_audits(tid, 0, 2))
        self.assertEqual(p1["total"], 3)
        self.assertEqual(len(p1["items"]), 2)
        self.assertEqual(p1["items"][0]["n"], 3)
        self.assertEqual(p1["items"][1]["n"], 2)

        # Page 2: Audit 1
        p2 = json.loads(self.contract.get_audits(tid, 2, 2))
        self.assertEqual(len(p2["items"]), 1)
        self.assertEqual(p2["items"][0]["n"], 1)

    def test_get_challenges_pagination_and_ordering(self):
        self.contract.register_translation("Multi-Ch", "en", "vi", self._sample_pairs(2))
        tid = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]

        # Audit first
        gl.nondet.prompt_handler = lambda p, fmt: (
            {"back": ["Party A shall deliver goods.", "Party A shall deliver goods."]}
            if "literal translation engine" in p else
            {"labels": [
                {"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""},
                {"i": 1, "label": "PRESERVED", "src_quote": "", "back_quote": ""}
            ]}
        )
        self.contract.audit_translation(tid)

        # Bob files 2 challenges
        gl.message.sender_address.as_hex = self.bob
        gl.nondet.prompt_handler = lambda p, fmt: (
            {"back": ["Party A may deliver goods."]}
            if "literal translation engine" in p else
            {"labels": [{"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""}]}
        )
        self.contract.challenge_segment(tid, 0, "Reason 1 for challenge index 0.")
        self.contract.challenge_segment(tid, 1, "Reason 2 for challenge index 1.")

        ch_view = json.loads(self.contract.get_challenges(tid, 0, 2))
        self.assertEqual(ch_view["total"], 2)
        self.assertEqual(ch_view["items"][0]["n"], 2)
        self.assertEqual(ch_view["items"][1]["n"], 1)

    def test_multi_level_lineage_chain(self):
        # Rev 1 -> Rev 2 -> Rev 3
        p1 = json.dumps([{"src": "Initial text v1.", "tgt": "Ban dau v1."}])
        self.contract.register_translation("Lineage Test", "en", "vi", p1)
        t1 = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]

        p2 = json.dumps([{"src": "Revised text v2.", "tgt": "Sua doi v2."}])
        self.contract.revise_translation(t1, p2)
        t2 = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]

        p3 = json.dumps([{"src": "Final text v3.", "tgt": "Cuoi cung v3."}])
        self.contract.revise_translation(t2, p3)
        t3 = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]

        # Walking lineage from any node returns full chain in revision order
        lin = json.loads(self.contract.get_lineage(t3))
        self.assertEqual(len(lin), 3)
        self.assertEqual([x["revision"] for x in lin], [1, 2, 3])
        self.assertEqual(lin[0]["id"], t1)
        self.assertEqual(lin[1]["id"], t2)
        self.assertEqual(lin[2]["id"], t3)

    def test_translator_board_tie_breaking_rules(self):
        # Tie break 1: same mean_score -> break by audited_count descending
        # Tie break 2: same mean_score and same audited_count -> break by earliest registration
        p_a1 = json.dumps([{"src": "Alice job 1.", "tgt": "Alice viec 1."}])
        p_a2 = json.dumps([{"src": "Alice job 2.", "tgt": "Alice viec 2."}])
        p_b1 = json.dumps([{"src": "Bob job 1.", "tgt": "Bob viec 1."}])

        gl.nondet.prompt_handler = lambda p, fmt: (
            {"back": ["Faithful translation."]}
            if "literal translation engine" in p else
            {"labels": [{"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""}]}
        )

        # Alice registers and audits 2 translations (score 100 each)
        gl.message.sender_address.as_hex = self.alice
        gl.message_raw["datetime"] = "2026-10-17T08:00:00Z"
        self.contract.register_translation("Job A1", "en", "vi", p_a1)
        t_a1 = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]
        self.contract.audit_translation(t_a1)

        gl.message_raw["datetime"] = "2026-10-17T08:30:00Z"
        self.contract.register_translation("Job A2", "en", "vi", p_a2)
        t_a2 = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]
        self.contract.audit_translation(t_a2)

        # Bob registers and audits 1 translation (score 100)
        gl.message.sender_address.as_hex = self.bob
        gl.message_raw["datetime"] = "2026-10-17T09:00:00Z"
        self.contract.register_translation("Job B1", "en", "vi", p_b1)
        t_b1 = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]
        self.contract.audit_translation(t_b1)

        # Both have mean_score 100.0, but Alice has audited_count 2 vs Bob's 1 -> Alice is #1
        board = json.loads(self.contract.get_translator_board(10))
        self.assertEqual(board[0]["translator"], self.alice)
        self.assertEqual(board[0]["audited_count"], 2)
        self.assertEqual(board[1]["translator"], self.bob)
        self.assertEqual(board[1]["audited_count"], 1)

    def test_unaudited_translation_view_fields(self):
        self.contract.register_translation("Unaudited", "en", "vi", self._sample_pairs(2))
        tid = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]
        view = json.loads(self.contract.get_translation(tid))
        self.assertEqual(view["status"], "UNAUDITED")
        self.assertEqual(view["latest_score"], -1)
        self.assertEqual(view["latest_class"], "")
        self.assertFalse(view["has_superseding_challenge"])
        self.assertEqual(view["effective_segments"][0]["effective_label"], "UNAUDITED")

    def test_challenge_upheld_when_severity_not_worse(self):
        # If targeted challenge severity <= stored severity, challenge is recorded as upheld (supersedes_latest=False)
        self.contract.register_translation("Upheld Ch", "en", "vi", self._sample_pairs(2))
        tid = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]

        # Audit with PRESERVED (sev 0)
        gl.nondet.prompt_handler = lambda p, fmt: (
            {"back": ["Party A shall deliver goods.", "Party A shall deliver goods."]}
            if "literal translation engine" in p else
            {"labels": [
                {"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""},
                {"i": 1, "label": "PRESERVED", "src_quote": "", "back_quote": ""}
            ]}
        )
        self.contract.audit_translation(tid)

        # Bob challenges segment 0, but consensus finds PRESERVED (sev 0 <= stored 0)
        gl.message.sender_address.as_hex = self.bob
        gl.nondet.prompt_handler = lambda p, fmt: (
            {"back": ["Party A shall deliver goods."]}
            if "literal translation engine" in p else
            {"labels": [{"i": 0, "label": "PRESERVED", "src_quote": "", "back_quote": ""}]}
        )
        self.contract.challenge_segment(tid, 0, "Questioning clause 0 interpretation.")
        ch = json.loads(self.contract.get_challenges(tid, 0, 1))["items"][0]
        self.assertFalse(ch["supersedes_latest"])
        self.assertEqual(ch["targeted_severity"], 0)

        # get_translation still shows base labels and FAITHFUL
        view = json.loads(self.contract.get_translation(tid))
        self.assertFalse(view["has_superseding_challenge"])
        self.assertEqual(view["effective_class"], "FAITHFUL")

    def test_whitespace_and_punctuation_collapsing(self):
        # Whitespace normalization in segments
        messy_pairs = json.dumps([
            {"src": "Clause   with \t \n  extra   spaces.", "tgt": "Dieu   khoan \t voi  dau cach."}
        ])
        self.contract.register_translation("Whitespace Test", "en", "vi", messy_pairs)
        tid = json.loads(self.contract.list_translation_ids(0, 1))["ids"][0]
        view = json.loads(self.contract.get_translation(tid))
        stored_src = view["pairs"][0]["src"]
        self.assertEqual(stored_src, "Clause with extra spaces.")


if __name__ == '__main__':
    unittest.main()
