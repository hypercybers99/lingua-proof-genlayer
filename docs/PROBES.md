# Phase 0 Runtime Probes on GenLayer Studionet (Preview)

**Date**: 2026-10-17  
**Network**: GenLayer Studionet (Preview)  
**Chain ID**: `61999`  
**RPC Endpoint**: `https://studio.genlayer.com/api`  
**Explorer**: `https://explorer-studio.genlayer.com`  

---

## 1. Superseded Diagnostic Probe Contract

A dedicated throwaway diagnostic contract (`Probe.py`) was deployed to GenLayer Studionet (Preview) to empirically test the runtime environment and validate core assumptions prior to building LinguaProof.

| Metric | Measured Value |
| :--- | :--- |
| **Contract Name** | `Probe` (superseded diagnostic) |
| **Deployed Address** | `0xC3335F8200571ddFee27dF35590681d86f5F1df4` |
| **Deploy Tx Hash** | `0xb14dc8e3c83bdaaeb317dc8539cd2195b0a83c71e8cdf3ace5c14d5f375cf4d0` |
| **Source SHA-256** | `1ca57ae01b57652ff13210855f991ce96d23b5a1338bb0fdda90efd7b289109c` |
| **Deploy Latency** | `6.21s` |
| **Deploy Consensus** | Status: `ACCEPTED`, Result: `MAJORITY_AGREE`, Leader: `SUCCESS` |

---

## 2. Probe P1: Vietnamese UTF-8 Calldata Round-Trip

The purpose of P1 was to confirm whether multi-byte UTF-8 strings with Vietnamese tone marks and vowel diacritics (`đ`, `ă`, `ý`, `à`, `ả`, `ộ`, `ế`, `ấ`, `ệ`, `ị`, `ợ`) pass through calldata into GenVM, store reliably in contract storage (`TreeMap`), and return uncorrupted through public views.

### Input Data
- **Sample Text**: `Đăng ký tài khoản và xác minh danh tính là bắt buộc đối với tất cả thành viên tham gia hệ thống quản trị phi tập trung này trước ngày 15/11/2026. Mọi giao dịch chuyển nhượng vượt quá 50,000 USD hoặc 1.500.000 VNĐ đều phải được thông báo công khai tại https://example.com/terms và địa chỉ ví 0x1234567890abcdef1234567890abcdef12345678.`
- **Character Count**: `334` characters
- **UTF-8 Byte Count**: `411` bytes
- **Local SHA-256**: `ec16fa6c886a2a4e1afcda37dbff2158191c7fe14507de2d6257b5ae5b7e32c8`

### On-Chain Transaction & Verification
- **Write Tx Hash**: `0x1dcf49feb1ea32f03e5d95125e3b4bcf467839ec912193543c9138d531aa3b59`
- **Latency**: `8.54s`
- **Votes**: 3 agree, 2 idle (3 of 5 agreement)
- **On-Chain Character Length**: `334` (Exact Match: `true`)
- **On-Chain Byte Length**: `411` (Exact Match: `true`)
- **On-Chain Computed SHA-256**: `ec16fa6c886a2a4e1afcda37dbff2158191c7fe14507de2d6257b5ae5b7e32c8` (Exact Match: `true`)
- **View Readback String Comparison**: 100% identical bit-for-bit match.

> **Decision**: UTF-8 round-trip passes completely. Vietnamese translation verification is fully supported on GenLayer Studionet (Preview).

---

## 3. Probe P2: Python Runtime Features

The contract relies on standard Python libraries for anchor extraction, quote grounding, text normalization, and state management.

- **Write Tx Hash**: `0x245dc45ca569ac68ded97f48aecd258a812b36fcf3a0c02b79cda76af6434d6f`
- **Latency**: `8.56s`
- **Votes**: 5 agree, 0 idle (5 of 5 agreement)

### Feature Availability Findings

| Library / Module | Tested Feature | Result | Notes |
| :--- | :--- | :--- | :--- |
| `re` | Lookbehind assertions `(?<=foo)\w+` | Available (`bar`) | Used in regex boundary matching |
| `re` | `finditer` regex tokenization | Available (3 matches) | Used in multiset anchor extraction |
| `unicodedata` | `normalize("NFC", s)` | Available (len: 17) | Used for canonical text comparison |
| `unicodedata` | `normalize("NFKC", s)` | Available (len: 17) | Used for compatibility normalization |
| `unicodedata` | `normalize("NFKD", s)` | Available (len: 21) | Available for decomposition checks |
| `hashlib` | `sha256().hexdigest()` | Available | Used for segment fingerprints and IDs |
| `json` | `dumps` / `loads` | Available (`true`) | Used for payload serialization |
| `decimal` | `Decimal` arithmetic | Available (`1000.00`) | Available for exact numeric parsing |

---

## 4. Probe P3: 12-Item JSON Batch Translation via `gl.nondet.exec_prompt`

We evaluated the feasibility of executing a 12-item translation batch in a single LLM prompt call over 5 independent on-chain runs.

- **Prompt Task**: Translate 12 numbered Vietnamese contract sentences into English and return strict JSON `{"back": ["...", ...]}`.
- **Validator Discipline**: Custom leader/validator pair via `gl.vm.run_nondet_unsafe`, verifying JSON validity and element structure.

### Measurement Results

| Run | Transaction Hash | Latency | JSON Valid | Key `back` Present | Items Count | Agreement |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **1** | `0x2a589b2f09eb0d780352e66586a994ff88aa74c0ad32643761837cb1ac55cea4` | 15.15s | Yes | Yes | 12 / 12 | 3 of 5 |
| **2** | `0xb3607fde6e44950a1c0705bb2896c942949d19e892f7d5d2e83a222220ad136a` | 11.80s | Yes | Yes | 12 / 12 | 3 of 5 |
| **3** | `0xe871b6f0dfdfd111d5f8dd1aad734c068520639174e162c6638f11ac14ababad` | 11.85s | Yes | Yes | 12 / 12 | 3 of 5 |
| **4** | `0x3526a7c662d4819c24c34cface06ae4d7d8306fd2d832aaa33e26f4ba61de85f` | 18.53s | Yes | Yes | 12 / 12 | 3 of 5 |
| **5** | `0x89839c907db692941153ef1969ef1f26ed96ce8c26f4d6a791bd5afd0d2d76dd` | 8.64s | Yes | Yes | 12 / 12 | 3 of 5 |

### Summary
- **Success Rate**: 5 of 5 runs (100%) produced valid JSON with exactly 12 items.
- **Mean Latency**: `13.19s` (range: 8.64s - 18.53s).
- **Consensus Behavior**: All 5 runs achieved `MAJORITY_AGREE` (3 of 5 active validator agreement).

---

## 5. Probe P4: Practical Calldata Payloads

We evaluated calldata capacity and gas/processing behavior across 2 KB, 4 KB, and 8 KB payload sizes.

| Payload Size | Transaction Hash | Latency | Status | Consensus | Byte Length Match | SHA-256 Verified |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **2,048 B (2 KB)** | `0xba6ebc277e1fd8fe7779e66bd36eb6041b81ca8aa9049d0650843057de3ac33b` | 9.01s | ACCEPTED | MAJORITY_AGREE | 2,048 B | Yes |
| **4,096 B (4 KB)** | `0x781ef3221d1da7cf9f6b7bf404d88f40808ef55ebba6b0f2c68ec0cf6b3056b2` | 5.42s | ACCEPTED | MAJORITY_AGREE | 4,096 B | Yes |
| **8,192 B (8 KB)** | `0x47e69adb66c8a540edfeea146420fac83b451ae8acadf850bf505d76dad9aed2` | 8.59s | ACCEPTED | MAJORITY_AGREE | 8,192 B | Yes |

All tested payload sizes were ingested, stored in `TreeMap`, and read back without truncation or distortion.

---

## 6. Probe P5: Two Sequential `exec_prompt` Calls in One Leader Execution

We tested running Step A (back-translation) and Step B (grounded comparison) sequentially inside a single leader function within `gl.vm.run_nondet_unsafe`.

- **Write Tx Hash**: `0xdbd79749dbb985e2c3b03d9eb87daf28de161cb6bad6cad4aaf3bed41b7913c9`
- **Latency**: `12.00s`
- **Status**: `ACCEPTED` (Consensus: `MAJORITY_AGREE`, 3 of 5 agreement)
- **Result**: Step A and Step B completed in sequence and produced valid structured JSON.

---

## 7. Derived Product Limits and Architecture Decisions

Based on empirical probe data:
1. **MAX_SEGMENTS = 12**: A 12-item batch prompt completes in ~13s on Studionet with 100% schema retention over 5 runs. The 12-segment limit is fully supported within the ~60s audit latency budget.
2. **MAX_TOTAL_SRC = 2400 chars**: Calldata of 8 KB confirmed zero truncation; 2400 source characters plus ~3600 target characters easily fits in < 8 KB calldata.
3. **SRC_MIN = 3, SRC_MAX = 400 chars**: Prevents trivial or excessively bloated segments while allowing rich legal clauses.
4. **TGT_MIN = 1, TGT_MAX = 600 chars**: Accommodates language expansion during translation (e.g. English to Spanish/Vietnamese).
5. **Two-Pass Pipeline in Leader**: Sequential Step A (blind back-translation) + Step B (grounded comparison) takes ~12s, comfortably meeting the performance target.
