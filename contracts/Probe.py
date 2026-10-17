# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
import hashlib
import re
import unicodedata
from decimal import Decimal
from genlayer import *


class Probe(gl.Contract):
    results: TreeMap[str, str]

    def __init__(self):
        pass

    def _ensure_meta_init(self) -> None:
        pass

    @gl.public.view
    def get_result(self, key: str) -> str:
        if key in self.results:
            return self.results[key]
        return ""

    @gl.public.view
    def get_sender(self) -> str:
        return gl.message.sender_address.as_hex.lower()

    @gl.public.write
    def probe_p1_utf8(self, text: str) -> None:
        char_len = len(text)
        utf8_bytes = text.encode("utf-8")
        byte_len = len(utf8_bytes)
        sha = hashlib.sha256(utf8_bytes).hexdigest()

        self.results["p1_raw"] = text
        self.results["p1_meta"] = json.dumps({
            "char_len": char_len,
            "byte_len": byte_len,
            "sha256": sha,
        }, sort_keys=True)

    @gl.public.write
    def probe_p2_runtime(self) -> None:
        # 1. Test re
        pattern = re.compile(r"(?<=foo)\w+")
        match = pattern.search("foobar foobaz")
        re_lookbehind_match = match.group(0) if match else ""
        finditer_count = len(list(re.finditer(r"\d+", "10, 20, 300")))

        # 2. Test unicodedata
        sample = "\u0110\u0103ng k\u00fd t\u00e0i kho\u1ea3n"
        nfc = unicodedata.normalize("NFC", sample)
        nfkc = unicodedata.normalize("NFKC", sample)
        nfkd = unicodedata.normalize("NFKD", sample)

        # 3. Test hashlib
        h = hashlib.sha256(b"linguaproof_probe").hexdigest()

        # 4. Test json
        j_str = json.dumps({"test": 123, "arr": [1, 2]}, sort_keys=True)
        j_loaded = json.loads(j_str)

        # 5. Test decimal
        d1 = Decimal("1000.50")
        d2 = Decimal("0.50")
        d_res = str(d1 - d2)

        out = {
            "re_lookbehind": re_lookbehind_match,
            "re_finditer_count": finditer_count,
            "unicodedata_nfc_len": len(nfc),
            "unicodedata_nfkc_len": len(nfkc),
            "unicodedata_nfkd_len": len(nfkd),
            "hashlib_sha256": h,
            "json_roundtrip": j_loaded.get("test") == 123,
            "decimal_calc": d_res,
        }
        self.results["p2_runtime"] = json.dumps(out, sort_keys=True)

    @gl.public.write
    def probe_p3_exec_batch(self, prompt: str) -> None:
        def leader_fn() -> str:
            res = gl.nondet.exec_prompt(prompt, response_format="json")
            if isinstance(res, dict):
                clean_json = json.dumps(res, sort_keys=True)
            elif isinstance(res, str):
                s = res.replace("```json", "").replace("```", "").strip()
                try:
                    loaded = json.loads(s)
                    clean_json = json.dumps(loaded, sort_keys=True)
                except Exception:
                    clean_json = json.dumps({"error": "invalid_json", "raw": s[:200]})
            else:
                clean_json = json.dumps({"error": "unknown_type"})
            return clean_json

        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            data = leader_res.calldata
            if not isinstance(data, str) or not data.strip():
                return False
            try:
                parsed = json.loads(data)
                return isinstance(parsed, dict)
            except Exception:
                return False

        res = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        self.results["p3_exec_batch"] = res

    @gl.public.write
    def probe_p4_calldata(self, payload: str, tag: str) -> None:
        raw_len = len(payload)
        utf8_bytes = payload.encode("utf-8")
        byte_len = len(utf8_bytes)
        sha = hashlib.sha256(utf8_bytes).hexdigest()
        self.results[f"p4_{tag}"] = json.dumps({
            "tag": tag,
            "char_len": raw_len,
            "byte_len": byte_len,
            "sha256": sha,
        }, sort_keys=True)

    @gl.public.write
    def probe_p5_sequential_exec(self, prompt_a: str, prompt_b: str) -> None:
        def leader_fn() -> str:
            res_a = gl.nondet.exec_prompt(prompt_a, response_format="json")
            res_b = gl.nondet.exec_prompt(prompt_b, response_format="json")
            out = {
                "res_a": res_a if isinstance(res_a, (dict, list)) else str(res_a)[:200],
                "res_b": res_b if isinstance(res_b, (dict, list)) else str(res_b)[:200],
            }
            return json.dumps(out, sort_keys=True)

        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            data = leader_res.calldata
            if not isinstance(data, str) or not data.strip():
                return False
            try:
                parsed = json.loads(data)
                return isinstance(parsed, dict) and "res_a" in parsed and "res_b" in parsed
            except Exception:
                return False

        res = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        self.results["p5_sequential"] = res
