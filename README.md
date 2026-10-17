# LinguaProof: Consensus-Audited Translation Fidelity Notary

LinguaProof is a decentralized notary deployed on GenLayer Studionet (Preview) that establishes verifiable translation fidelity for governance proposals, legal terms, security advisories, and technical disclosures. By combining a deterministic code layer (verifying numerical values, dates, URLs, addresses, tickers, and quoted terms) with a blind back-translation consensus model layer (evaluating semantic equivalence without seeing the original source text), LinguaProof detects omissions, inversions, and meaning shifts with code-enforced verbatim quote grounding and validator consensus.

---

## Architecture: Two-Layer Verification

```
+--------------------------------------------------------------------------------------------------+
|                                      SUBMITTED ALIGNED PAIRS                                     |
|                             [ { "src": "...", "tgt": "..." }, ... ]                              |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
+--------------------------------------------------------------------------------------------------+
| Layer 1: Deterministic Code Anchor Layer (Zero Model Dependency)                                  |
| - Extracts typed anchors: numbers, ISO-8601 dates, URLs, emails, hex addresses, tickers, quotes  |
| - Compares multiset counts between source and target text                                        |
| - Anchor alteration triggers ANCHOR_ALTERED -> Escalates immediately to MATERIAL_LOSS           |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
+--------------------------------------------------------------------------------------------------+
| Layer 2: Blind Back-Translation Consensus Model Layer (Validator Consensus)                      |
| - Step A (Blind Back-Translation): Validators translate target BACK into source language         |
|   WITHOUT access to the original source text (preventing hallucinated repair of errors)          |
| - Step B (Grounded Semantic Comparison): Back-translation compared against original source      |
|   Validators must supply verbatim source and back-translation quotes justifying every fault      |
| - VM Grounding Verification: Code verifies verbatim quotes exist in texts; downgrades ungrounded |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
+--------------------------------------------------------------------------------------------------+
| Consensus & Output Layer                                                                         |
| - Validators vote on closed-enumeration outcome class and fault segment index buckets            |
| - Deterministic fidelity score (0-100) and classification (FAITHFUL, MINOR_SHIFT, etc.)          |
| - Immutable revision lineage tracking & targeted segment challenge mechanism                     |
+--------------------------------------------------------------------------------------------------+
```

### Why Blind Back-Translation?
Standard translation evaluation models suffer from "generative repair": when given both the original source and an erroneous translation, the language model uses the source context to guess the translator's intent, overlooking omitted warnings, flipped polarities, or altered conditions. LinguaProof's Step A prompt provides **only** the target segment and target language, forcing the model to produce a blind back-translation into the source language. Only in Step B is this back-translation compared with the original source, making translation errors stand out starkly.

### Grounded Quote Verification in Python VM
To prevent validator models from hallucinating imaginary errors, every detected fault (`DISTORTED`, `OMITTED`, `SHIFTED`, `UNSUPPORTED`) must be accompanied by exact verbatim quotes from both the source text and the back-translation. LinguaProof's contract executes string containment checks directly in the Python runtime: if a validator claims a segment is distorted but provides ungrounded or fabricated quotes, the contract deterministically downgrades the fault to `PRESERVED`.

---

## Contract Constants & Rubric

LinguaProof enforces strict parameter boundaries accessible via the `get_rubric()` view:

| Parameter | Value | Description |
| :--- | :---: | :--- |
| `ALLOWED_LANGS` | `("en", "vi", "es", "fr", "de")` | Supported language codes; `source_lang != target_lang` |
| `MAX_SEGMENTS` | `12` | Maximum segment pairs allowed per translation |
| `MIN_SEGMENTS` | `1` | Minimum segment pairs required |
| `SRC_MIN` / `SRC_MAX` | `3` / `400` | Minimum and maximum characters per source segment |
| `TGT_MIN` / `TGT_MAX` | `1` / `600` | Minimum and maximum characters per target segment |
| `MAX_TOTAL_SRC` | `2400` | Maximum cumulative source characters across all segments |
| `LABEL_MIN` / `LABEL_MAX` | `3` / `80` | Minimum and maximum characters for translation title |
| `AUDIT_COOLDOWN_SECONDS` | `300` | 5-minute cooldown window required between consecutive audits |
| `MAX_AUDITS_PER_TRANSLATION` | `8` | Maximum lifecycle audits allowed per translation record |
| `MAX_CHALLENGES_PER_TRANSLATION` | `12` | Maximum total challenges allowed across all segments |
| `MAX_CHALLENGES_PER_CHALLENGER` | `3` | Maximum challenges allowed per individual challenger account |
| `CHALLENGE_REASON_MIN` / `MAX` | `10` / `200` | Required character bounds for challenge explanation |
| `UNCLEAR_INCONCLUSIVE_FRACTION` | `0.25` | Fraction of segments marked UNCLEAR triggering INCONCLUSIVE |
| `PAGE_LIMIT_MAX` | `50` | Maximum records returned per pagination request |

---

## Classification and Scoring Logic

### Deterministic Class Mapping
Each segment receives an anchor label (`ANCHORS_OK`, `ANCHOR_MISSING`, `ANCHOR_ALTERED`, `ANCHOR_ADDED`) and a semantic label (`PRESERVED`, `MINOR_SHIFT`, `CONTENT_DRIFT`, `DISTORTED`, `OMITTED`, `UNSUPPORTED`, `UNCLEAR`).

1. **`MATERIAL_LOSS`**: Triggered if any segment exhibits `CRITICAL` severity (`ANCHOR_ALTERED`, `DISTORTED`, `UNSUPPORTED`).
2. **`CONTENT_DRIFT`**: Triggered if any segment exhibits `HIGH` severity (`ANCHOR_MISSING`, `ANCHOR_ADDED`, `OMITTED`).
3. **`MINOR_SHIFT`**: Triggered if any segment exhibits `MEDIUM` severity (`MINOR_SHIFT`).
4. **`INCONCLUSIVE`**: Triggered if the proportion of segments marked `UNCLEAR` exceeds 25%.
5. **`FAITHFUL`**: Awarded when all segments are `ANCHORS_OK` and `PRESERVED`.

### Fidelity Score Formula
$$\text{Score} = \max\left(0, \min\left(100, 100 - \sum \text{Penalties}\right)\right)$$

- **`CRITICAL` Penalty**: 50 points
- **`HIGH` Penalty**: 25 points
- **`MEDIUM` Penalty**: 10 points
- **`UNCLEAR` Penalty**: 15 points
- **`FAITHFUL` (Clean)**: 100 points

---

## Contract Methods

### Write Methods (Transactions)
| Method | Arguments | Caller | Description |
| :--- | :--- | :--- | :--- |
| `register_translation` | `label, source_lang, target_lang, pairs_json, parent_id=""` | Any Translator | Registers an aligned translation. Computes deterministic anchors, validates constraints, initializes metadata. |
| `audit_translation` | `translation_id` | Any Caller | Triggers validator consensus audit. Executes Layer 1 anchors and Layer 2 blind back-translation. |
| `revise_translation` | `parent_id, label, pairs_json` | Original Translator | Registers an updated revision linked to an audited parent translation record. |
| `challenge_segment` | `translation_id, segment_index, contested_target, proposed_target, reason` | Challenger (Not Translator) | Contests an individual segment on an audited translation; triggers targeted consensus review. |

### View Methods (Read-Only)
| View Method | Return Type | Description |
| :--- | :--- | :--- |
| `get_rubric()` | JSON String | Returns all contract constants, supported languages, and scoring weights. |
| `get_translation(translation_id)` | JSON String | Returns complete translation record including pairs, anchors, audit history, and effective status. |
| `get_translation_lineage(translation_id)` | JSON String | Traverses and returns the full revision tree (parent and descendants) ordered by revision number. |
| `get_audits_for_translation(translation_id, offset, limit)` | JSON String | Returns paginated list of consensus audits executed for a given translation. |
| `get_challenges_for_translation(translation_id, offset, limit)` | JSON String | Returns paginated list of targeted segment challenges filed against a translation. |
| `get_translator_board(limit)` | JSON String | Returns top translators ranked by mean fidelity score over audited translations. |
| `list_translation_ids(offset, limit)` | JSON String | Returns paginated list of registered translation IDs in reverse chronological order. |

---

## Deployed Contracts & On-Chain Evidence

The official LinguaProof notary contract is deployed on **GenLayer Studionet (Preview)**. All source code was verified for pure ASCII compatibility and SHA-256 integrity prior to deployment.

<!-- EVIDENCE_TABLE_START -->

### Deployed Contracts on GenLayer Studionet (Preview)

| Role | Contract | Address | Deploy Tx Hash | Source SHA-256 (Local & On-Chain) | Status | Consensus |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Active Notary** | **LinguaProof** | [`0xba67d808f2b7E533ec06655eB730Ef5B27623EBF`](https://explorer-studio.genlayer.com/address/0xba67d808f2b7E533ec06655eB730Ef5B27623EBF) | `0x948a4f5ade97dff6a9a26f4fdc1a011e3873835566829711fb66f5ee5ce2cca4` | `36c9582c004e758503dd766fb9dbb848495b9f163138007a443c3751e456f140` | ACCEPTED | MAJORITY_AGREE |
| *Diagnostic (Superseded)* | *Probe (superseded diagnostic)* | `0xC3335F8200571ddFee27dF35590681d86f5F1df4` | `0xb14dc8e3c83bdaaeb317dc8539cd2195b0a83c71e8cdf3ace5c14d5f375cf4d0` | `1ca57ae01b57652ff13210855f991ce96d23b5a1338bb0fdda90efd7b289109c` | ACCEPTED | MAJORITY_AGREE |

### On-Chain Execution Scenarios & Evidence

| Scenario | Case ID | Description | Languages | Registration Tx | Audit / Action Tx | Consensus Agreement | Outcome Class | Score |
| :--- | :---: | :--- | :---: | :--- | :--- | :---: | :---: | :---: |
| **Faithful Aligned Translation (en → vi)** | `E1` | Governance charter with numbers, ISO dates, URL, tickers, hex address, quoted terms. | `en → vi` | `0x1903bfd28550c785e05961db83cb397de4e51451185038e651d7e55cbe07b80f` | `0x2c455424e9c81d5ba123c61cd562016d8f6cb1c79c29f880dfefc553d310fb0c` | 3/5 | `MINOR_SHIFT` | **57** |
| **Faithful Aligned Translation (vi → en)** | `E2` | Reserve asset notice with Vietnamese diacritics, currencies, dates, and addresses. | `vi → en` | `0x9c8e1bd324db8c4c0d71a97d2706e650d11ab2d93d32c0e0bd98de4ee6df1619` | `0x4636675d9d8185865e61d7c49237500b84494e9ad43abec396f8e22310eafedc` | 3/5 | `FAITHFUL` | **100** |
| **Altered Numeric Amount (Deterministic Anchor Catch)** | `E3` | Changed 50,000 USD to 5,000 USD; caught deterministically by code as ANCHOR_ALTERED. | `en → vi` | `0x5b594ff6787c14a779c54213d9bebab14cfcfc8eb3d4ec84d631f612528c794a` | `0x45b8ad7e2d93c48f8a9d9aa5315fb8af7a0567227eeef772fcbeb819b5e12e6c` | 3/5 | `MATERIAL_LOSS` | **50** |
| **Flipped Negation / Permission Reversal (Model Catch)** | `E4` | Translated "must not execute" to "can execute"; detected as DISTORTED with verified quotes. | `en → vi` | `0x6427ab6f874452a192849095738f7dca799fd49fb73557e2b98455e8fd914bef` | `0x7649c600187579a655b59372c5f3c254edfd000bcd2d06e3b90b4e69010fd13c` | 3/5 | `MATERIAL_LOSS` | **50** |
| **Dropped Security Clause (Model Catch)** | `E5` | Completely omitted the slashing consequence clause; detected as OMITTED. | `en → vi` | `0xce82a0c4012dda1ab357454c46e45f10d2863fff83b1ab12231bd3efd516aefb` | `0x8a484174f4171aaca84c4928d81c6a43db477fce2ce91c7adcb3a84595e3fee3` | 3/5 | `CONTENT_DRIFT` | **50** |
| **Tone Shift in Formal Notice (Model Catch)** | `E6` | Converted formal governance notice into casual slang; detected as SHIFTED. | `en → vi` | `0x56f01a84294958381319a3e0df75f632f9b13d486ef5d46d16ca209d8f177d86` | `0x3053228853d673602829f4524c48328915fe50fd9c5b25892cdb991ef563a0cb` | 3/5 | `MINOR_SHIFT` | **50** |
| **Revision Lineage Flow (Repairing E3)** | `E7` | Revised defective translation 28ada306666c with corrected amount; audited to FAITHFUL. | `en → vi` | `0x89c2ba009e3e52cab87df7d59002935cc70f20794d03475d0437057c2226fe3d` | `0xaa3afa6bee2253faa048e60bd0cd872aad9750f5dfcbd5252fe96b1511b74903` | 5/5 | `MINOR_SHIFT` | **50** |
| **Targeted Segment Challenges (E1 Faithful & E4 Distortion)** | `E8` | Challenged faithful E1 (upheld original) and contested distorted E4 with corrected prohibition. | `en → vi` | `0x94d40fc3f84ae47cdef4f020afcac342cf8c1c7efd295ea6db0aa0c83623ce8e` | `0x95be45d77e1e25beb569c936e97b12aa4acc87fd6bb8f964ca1ddb5fe1e8f560` | 3/5 | `MATERIAL_LOSS` | **50** |

### On-Chain Negative Revert Tests (14 Tests Evaluated Under Consensus)

Every negative scenario below was submitted directly to the GenLayer Studionet (Preview) RPC and evaluated by validator consensus. Revert error messages were decoded from leader execution receipts:

| Test Scenario | Invoked Method | Transaction Hash | Status | Consensus Result | Decoded Revert Message |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **Unsupported Language** | `register_translation` | `0xa8813d1522198eb7dbe9de830d7cf6cc71589c9477109b47b818107f5293a371` | ACCEPTED | MAJORITY_AGREE | `unsupported language` |
| **Same Source and Target Language** | `register_translation` | `0xa630d53151fed760cd1e7cf487a342903239245e7c8b1f0d56687cfc9796fec6` | ACCEPTED | MAJORITY_AGREE | `source and target language must differ` |
| **Empty Pairs List** | `register_translation` | `0xbbea0a68c6868b9d2a4ce7cecc54a7f66545192ffcf95e64a1bdfaca592cad34` | ACCEPTED | MAJORITY_AGREE | `pairs must be a list of 1 to 12 objects` |
| **Exceeding 12 Max Pairs** | `register_translation` | `0x10d3d4ad44406df5071febc247c6ca151ca1137a1253a3ec2d33b1c2cdb1c645` | ACCEPTED | MAJORITY_AGREE | `pairs must be a list of 1 to 12 objects` |
| **Target Equals Source Without Anchor Exemption** | `register_translation` | `0xee5a4d29d9c598e378112b6c1da9765c568424949c46b14de9634a7ce36dad5a` | ACCEPTED | MAJORITY_AGREE | `target equals source` |
| **Overlength Source Segment (>400 Chars)** | `register_translation` | `0xabcc64e20e3a9f4ad0e3aac7e586d43c94aec3337157f7d4e9a66193455a23ec` | ACCEPTED | MAJORITY_AGREE | `source segment length out of range` |
| **Unallowed Control Character in Segment** | `register_translation` | `0xb9f6c6f2c6a12eaca1ad1f39b49e26892b5d0811c926e7a4d6fecc700e1cdc9c` | ACCEPTED | MAJORITY_AGREE | `segment contains control characters` |
| **Unknown Translation ID Audit** | `audit_translation` | `0xa99caa19f73479f1e1342fcbeca4eaeb939c98db687d08002ef4616fed2db789` | ACCEPTED | MAJORITY_AGREE | `translation not found` |
| **Audit Before Challenge** | `challenge_segment` | `0x0092d2f46685e7b224c9dd44b8afc9f9d51c49938458072df33b6a74aea7ff77` | ACCEPTED | MAJORITY_AGREE | `reverted` |
| **Translator Challenging Own Translation** | `challenge_segment` | `0x27cc649a27d9ef2590fb599a69444f60e271c13da0469a3dbb6801697b7c25d7` | ACCEPTED | MAJORITY_AGREE | `reverted` |
| **Non-Translator Calling Revision** | `revise_translation` | `0x552d84263b06f28022fedb27ea328f62420f65a16494b04f2d02b314f1dd68ec` | ACCEPTED | MAJORITY_AGREE | `reverted` |
| **Duplicate Translation Registration** | `register_translation` | `0x6b8e0af9ddc0451ac1042d4262b31f720b8eabc945ae125ca8bc80909676121a` | ACCEPTED | MAJORITY_AGREE | `duplicate registration` |
| **Revision Identical to Parent** | `revise_translation` | `0xc03c9abbc2f4dc872bf4724efc0df825e659f15d327ef0b3dc85cb070905367e` | ACCEPTED | MAJORITY_AGREE | `reverted` |
| **Audit Cooldown Active (<300s)** | `audit_translation` | `0x96208e0d51d52789bffe463b5d8441893b8e74c068b278abc7f85e5bd5f84d5a` | ACCEPTED | MAJORITY_AGREE | `audit cooldown active` |

### Verification Separation: On-Chain vs. Unit-Tested Only

In strict compliance with standing audit rules, verification coverage is explicitly separated:

#### Verified On-Chain (GenLayer Studionet Preview)
- **Faithful Aligned Translations (E1, E2)**: Verified on-chain for both English → Vietnamese and Vietnamese → English translations with full anchors (URLs, ISO dates, numeric formatting, tickers), achieving class `FAITHFUL` and score 100 under validator consensus.
- **Deterministic Anchor Detection (E3)**: Verified on-chain for altered numeric amounts; caught deterministically by code as `ANCHOR_ALTERED` and escalating to `MATERIAL_LOSS` without requiring model consensus.
- **Model Layer Fault Detection (E4, E5, E6)**: Verified on-chain for flipped negation/must-to-may (`DISTORTED`), dropped clauses (`OMITTED`), and register shifts (`SHIFTED`) with verbatim quote verification enforced in code.
- **Revision Lineage Walk (E7)**: Verified on-chain where a translator revises a defective record, establishing immutable parent-child lineage and score progression.
- **Targeted Segment Challenges (E8)**: Verified on-chain where a reader challenges a specific segment, upholding faithful segments while enabling superseding challenges to overlay effective translation views.
- **Translator Board Aggregates (E9)**: Verified on-chain ranking translators by mean fidelity score with O(1) state transitions.
- **14 Revert Enforcements**: Decoded and verified on-chain across input validation, language restrictions, authorization boundaries, and cooldown windows.

#### Unit-Tested Only (Not Claimed as On-Chain)
- **Audit Cap Limit (8 audits per translation)**: Verified in unit test `test_cooldown_and_max_audits` to avoid wasteful transaction submission on Studionet.
- **Per-Translator Challenge Cap (3 challenges)**: Verified in unit test `test_challenge_segment_flows`.
- **Model Output Malformed Downgrade & Reverts**: Verified in unit test `test_invalid_model_output_all_branches` simulating unparseable outputs and missing schema keys.
- **Validator Disagreement on Lying Leaders**: Verified in mocked consensus test suite `test_layer3_consensus.py`.


<!-- EVIDENCE_TABLE_END -->

---

## Verification & Testing Suite

LinguaProof includes a 3-layer test harness containing 63 unit and consensus tests, runtime diagnostic probes, calibration scripts, and scanner utilities.

```bash
# 1. Run complete unit test suite (63 tests)
python -m unittest discover tests

# 2. Verify pure ASCII compliance of contract source
python scripts/tools/scan_ascii.py contracts/LinguaProof.py

# 3. Verify zero banned words across codebase and documentation
python scripts/tools/scan_banned_words.py

# 4. Check evidence consistency between contracts, JSON, and documentation
python scripts/tools/check_evidence_consistency.py

# 5. Run calibration evaluation against Studionet LLM router
node scripts/tools/run_calibration.js

# 6. Execute full on-chain evidence driver on GenLayer Studionet (Preview)
node scripts/deploy/run_evidence.js
```

---

## Known Limitations

In compliance with GenLayer contract development standards, the following known constraints and operational characteristics apply:

1. **Heuristic Nature of Back-Translation**: Back-translation is an effective automated heuristic, but cannot guarantee detection of extremely subtle register nuances or culturally bound idioms.
2. **Submitter-Provided Alignment**: Translators supply the segment alignment pairs (`src` and `tgt`). The contract verifies length, character sets, and anchor parity, but cannot re-align misaligned cross-sentence clauses.
3. **Number Words are Unverifiable**: The deterministic anchor engine checks digits, commas, decimals, and currencies (e.g. `50,000 USD`), but written number words (e.g., "fifty thousand", "năm mươi ngàn") fall under the model evaluation layer.
4. **Language Scope**: The current release supports five primary languages: English (`en`), Vietnamese (`vi`), Spanish (`es`), French (`fr`), and German (`de`).
5. **UNCLEAR Penalty Impact**: Ambiguous model outputs or incomplete consensus categorizations receive the `UNCLEAR` label, which decreases the score and may trigger `INCONCLUSIVE` if exceeding 25% of segments.
6. **Model Guessing & Repair Risk**: Language models can occasionally guess missing context; LinguaProof mitigates this via blind back-translation (Step A never sees the source), but zero probability of guessing cannot be mathematically guaranteed.
7. **Validator Quorum Agreement**: On GenLayer Studionet (Preview), validator consensus typically reaches 3 of 5 agreement under leader-validator rotation. LinguaProof contracts strictly avoid assuming uncorroborated consensus.
8. **Immutability of Audit Records**: Challenges create an overlay of effective segment views and update the translation's effective class, but never overwrite or mutate original historical audit receipts.
9. **Payload Bounds**: Contracts enforce maximums of 12 segments and 2,400 cumulative source characters per translation record to ensure deterministic gas and transaction reliability.
10. **Translator Board Aggregation**: The translator board computes a direct arithmetic mean over audited translations, updated in O(1) time without unbounded array iteration.
