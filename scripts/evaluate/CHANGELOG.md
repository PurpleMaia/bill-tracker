# LLM Prompt Evaluation Changelog

# rtx6k-ollama-qwen3-vl:30b-a3b-instruct-q4_K_M

## v1 — Baseline
- **Accuracy: 48.0%** (262/546 correct)
- Basic system prompt with category table and few-shot examples
- No crossover detection context (LLM had to guess from status text alone)
- No committee counting context (LLM couldn't determine 1st/2nd/3rd)
- Top errors:
  - `waiting2 -> crossoverWaiting3` (83x) — couldn't distinguish crossover vs non-crossover
  - `crossoverWaiting2 -> crossoverWaiting3` (31x) — wrong committee number
  - `waiting2 -> waiting3` (20x) — wrong committee number
  - `governorSigns -> transmittedGovernor` (12x) — missed "Act ###" pattern

## v2 — Crossover + Committee + Governor fixes
- **Accuracy: 60.3%** (329/546 correct, 70 ERRORs from undefined title mappings)
- Changes to `getContext()`:
  - Added bill number with originating chamber (e.g., "Bill: HB1060 (Originated in House)")
  - Added committee assignment list (e.g., "Committees (in order): AGR, ECD, FIN")
- Changes to system prompt:
  - Added Section 2: Crossover Detection — explains HB/SB prefix -> originating chamber, compare with status chamber code
  - Added Section 3: Committee Counting — explains how to match committee names to position in assignment list
  - Added Section 6: Step-by-step Decision Rubric with governor check as highest priority
  - Rewrote few-shot examples to demonstrate crossover detection and committee counting reasoning
  - Strengthened governor rules: "Act ###" always = Governor Signs, not transmittedGovernor
- Changes to user message:
  - Updated to reference "context and status log" instead of just "status log"
- Top errors:
  - 70x ERROR (undefined mapping) — LLM output didn't exactly match any title string
  - `waiting2 -> crossoverWaiting2` (67x) — crossover detection still over-triggering
  - `deferred1 -> crossoverDeferred1` (9x) — same issue
  - `passedCommittees -> transmittedGovernor` (6x)
  - `scheduled1 -> introduced` (6x)
- Wins: governorSigns now 100% (24/24), introduced 95.9%

## v3 — Switch to status ID output
- **Accuracy: 63.7%** (348/546 correct, 0 ERRORs)
- Switched LLM output from long title strings to short status IDs (e.g., `crossoverWaiting2` instead of `Waiting to be Scheduled for Second Committee Hearing after Crossover`)
- Eliminates the 70 ERROR rows caused by title string mismatches in v2
- Updated `mapToColumnID()` to validate IDs directly with title-match fallback
- Updated all prompt sections, examples, and decision rubric to reference IDs
- Shorter output = less room for the LLM to hallucinate wrong text
- Top errors:
  - `waiting2 -> crossoverWaiting2` (83x) — LLM ignoring crossover=NO for SB bills with chamber=S
  - `passedCommittees -> crossoverWaiting3` (17x) — gold label not derivable from latest status
  - `deferred1 -> crossoverDeferred1` (12x) — same crossover false positive

## v4 — Deterministic crossover detection
- **Accuracy: 81.32** (444/546 correct, 0 ERRORs)
- Moved crossover detection from LLM reasoning into code: `detectCrossover()` compares bill prefix (HB/SB) with newest status chamber code
- `getContext()` now passes `Crossover: YES/NO` as a pre-computed authoritative fact
- Prompt updated to tell LLM to obey the Crossover field unconditionally — never second-guess it
- Decision rubric Step 3 now references the pre-computed field instead of asking LLM to reason about chambers
- Target: eliminate the 83x `waiting2 -> crossoverWaiting2` false positives and ~12x `deferred1 -> crossoverDeferred1`

# gpt-oss-120b
## v4 - same prompt version + deterministic crossover
- **Accuracy: 88.28** (482/546 correct, 1 ERRORs)