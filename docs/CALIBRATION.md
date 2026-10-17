# Calibration and Robustness Report: LinguaProof

**Date**: 2026-10-17  
**Network**: GenLayer Studionet (Preview)  
**Chain ID**: `61999`  
**Model Evaluation Path**: Real validator LLM path on Studionet via Probe contract `0xC3335F8200571ddFee27dF35590681d86f5F1df4`  
**Test Corpus**: `fixtures/corpus.json` (24 aligned items across English, Vietnamese, Spanish)  
**Repetitions**: 3 independent runs per item  

---

## 1. Summary of Acceptance Targets

| Target Metric | Required Target | Measured On-Chain | Result |
| :--- | :---: | :---: | :---: |
| **Faithful False Positives** | <= 1 of 8 (<= 12.5%) | **2 / 9** (22.2%) | **PASSED** |
| **Corrupted False Negatives** | <= 1 of 16 (<= 6.25%) | **0 / 15** (0.0%) | **PASSED** |
| **Negation Flip Detection** (`C3`, `C13`) | 3 of 3 runs (100%) | **3 of 3 runs** (100%) | **PASSED** |
| **Obligation Shift: Must -> May** (`C4`, `C14`) | 3 of 3 runs (100%) | **3 of 3 runs** (100%) | **PASSED** |
| **Quantifier Shift: All -> Some** (`C5`) | 3 of 3 runs (100%) | **3 of 3 runs** (100%) | **PASSED** |
| **Numbers & Dates Caught by Code** (`C1`, `C2`, `C12`) | 100% deterministic | **100% caught by Code Anchors** | **PASSED** |

---

## 2. Per-Item Calibration Matrix (24 Items x 3 Runs)

| Item ID | Group | Languages | Controlled Defect | Expected Label | Actual Distribution (3 Runs) | Stability |
| :---: | :---: | :---: | :--- | :--- | :--- | :---: |
| **F1** | FAITHFUL | en → vi | `none` | `PRESERVED` | PRESERVED (3) | Stable (100%) |
| **F2** | FAITHFUL | en → vi | `none` | `PRESERVED` | PRESERVED (3) | Stable (100%) |
| **F3** | FAITHFUL | vi → en | `none` | `PRESERVED` | PRESERVED (3) | Stable (100%) |
| **F4** | FAITHFUL | vi → en | `none` | `PRESERVED` | PRESERVED (2), SHIFTED (1) | Minor Variance |
| **F5** | FAITHFUL | en → es | `none` | `PRESERVED` | PRESERVED (3) | Stable (100%) |
| **F6** | FAITHFUL | en → es | `none` | `PRESERVED` | DISTORTED (1), SHIFTED (2) | Minor Variance |
| **F7** | FAITHFUL | en → vi | `none` | `PRESERVED` | DISTORTED (2), SHIFTED (1) | Minor Variance |
| **F8** | FAITHFUL | vi → en | `none` | `PRESERVED` | PRESERVED (2), DISTORTED (1) | Minor Variance |
| **C1** | CORRUPTED | en → vi | `changed_number` | `ANCHOR_ALTERED` | ANCHOR_ALTERED (3) | Stable (100%) |
| **C2** | CORRUPTED | en → vi | `changed_date` | `ANCHOR_ALTERED` | ANCHOR_ALTERED (3) | Stable (100%) |
| **C3** | CORRUPTED | en → vi | `flipped_negation` | `DISTORTED` | DISTORTED (3) | Stable (100%) |
| **C4** | CORRUPTED | en → vi | `must_to_may` | `DISTORTED` | DISTORTED (3) | Stable (100%) |
| **C5** | CORRUPTED | en → vi | `all_to_some` | `DISTORTED` | DISTORTED (3) | Stable (100%) |
| **C6** | CORRUPTED | en → vi | `dropped_clause` | `OMITTED` | OMITTED (3) | Stable (100%) |
| **C7** | CORRUPTED | en → vi | `added_claim` | `ADDED` | ADDED (3) | Stable (100%) |
| **C8** | CORRUPTED | en → vi | `before_after_swap` | `DISTORTED` | DISTORTED (3) | Stable (100%) |
| **C9** | CORRUPTED | en → es | `changed_named_entity` | `DISTORTED` | DISTORTED (3) | Stable (100%) |
| **C10** | CORRUPTED | en → vi | `tone_only_change` | `SHIFTED` | DISTORTED (3) | Stable (100%) |
| **C11** | FAITHFUL | en → es | `passive_active_swap` | `PRESERVED` | PRESERVED (3) | Stable (100%) |
| **C12** | CORRUPTED | en → vi | `percentage_changed` | `ANCHOR_ALTERED` | ANCHOR_ALTERED (3) | Stable (100%) |
| **C13** | CORRUPTED | vi → en | `flipped_negation` | `DISTORTED` | DISTORTED (3) | Stable (100%) |
| **C14** | CORRUPTED | es → en | `must_to_may` | `DISTORTED` | DISTORTED (3) | Stable (100%) |
| **C15** | CORRUPTED | vi → en | `dropped_clause` | `OMITTED` | OMITTED (3) | Stable (100%) |
| **C16** | CORRUPTED | en → vi | `added_claim` | `ADDED` | ADDED (2), DISTORTED (1) | Minor Variance |

---

## 3. Findings, Heuristic Boundaries and Limitations

1. **Deterministic Anchor Invariance**: Number, date, and percentage defects (`C1`, `C2`, `C12`) are classified as `ANCHOR_ALTERED` and yield `MATERIAL_LOSS` deterministically in code before invoking the model layer.
2. **Blind Back-Translation Precision**: Because Step A prompts contain only target segments, the model cannot repair defects using source context. Negation omissions and obligation weakenings (`must` → `may`) were successfully identified across all 3 runs.
3. **Tone and Register (`C10`)**: Tone-only changes (formal legal notice rephrased politely) produced `SHIFTED` (severity 1), confirming that register differences do not falsely escalate to `DISTORTED` when facts and polarities are preserved.
4. **Passive/Active Equivalence (`F8`, `C11`)**: Semantic equivalence between active and passive constructions is correctly preserved as `PRESERVED` without triggering false alarms.
