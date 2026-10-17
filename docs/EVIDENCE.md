### Deployed Contracts on GenLayer Studionet (Preview)

| Role | Contract | Address | Deploy Tx Hash | Source SHA-256 (Local & On-Chain) | Status | Consensus |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Active Notary** | **LinguaProof** | [`0xba67d808f2b7E533ec06655eB730Ef5B27623EBF`](https://explorer-studio.genlayer.com/address/0xba67d808f2b7E533ec06655eB730Ef5B27623EBF) | `0x948a4f5ade97dff6a9a26f4fdc1a011e3873835566829711fb66f5ee5ce2cca4` | `36c9582c004e758503dd766fb9dbb848495b9f163138007a443c3751e456f140` | ACCEPTED | MAJORITY_AGREE |

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

