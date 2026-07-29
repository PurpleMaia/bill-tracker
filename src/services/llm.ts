'use server'
import { KANBAN_COLUMNS, COLUMN_INDEX } from '@/lib/kanban-columns';
import { limitFixedWindow, retryAfterMs } from '@/lib/ratelimit-memory';
import { OpenAI } from 'openai';
import { db } from '../db/kysely/client';
import { sql } from 'kysely';
import {
  DOCUMENT_SYSTEM_PROMPT,
  REPORT_SYSTEM_PROMPT,
  DIFF_SYSTEM_PROMPT,
  buildDocumentUserTurn,
  buildReportUserTurn,
  buildDiffUserTurn,
} from '@/lib/summary-prompts';
import type { VersionComparison } from '@/lib/version-diff';

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL
});

const SYSTEM_PROMPT = [
  "# Hawaiʻi Bill-Status Classifier",
  "",
  "## 1. Purpose",
  "You are a legislative bill-status classifier for the Hawaii State Legislature.",
  "You will receive: the bill number, its committee assignments (in order), and the ten most-recent status lines (newest first).",
  "Output exactly one status ID from the list below. No extra text.",
  "",
  "---",
  "",
  "## 2. Crossover Detection (CRITICAL — FOLLOW EXACTLY)",
  "The input includes a pre-computed 'Crossover: YES/NO' line. YOU MUST OBEY THIS LINE.",
  "- If 'Crossover: NO' -> the bill is in its originating chamber. You MUST use non-crossover IDs: introduced, scheduled1, deferred1, waiting2, scheduled2, deferred2, waiting3, scheduled3, deferred3.",
  "- If 'Crossover: YES' -> the bill has crossed to the opposite chamber. You MUST use crossover IDs: crossoverWaiting1, crossoverScheduled1, crossoverDeferred1, crossoverWaiting2, crossoverScheduled2, crossoverDeferred2, crossoverWaiting3, crossoverScheduled3, crossoverDeferred3.",
  "- NEVER output a crossover ID when Crossover is NO. NEVER output a non-crossover ID when Crossover is YES.",
  "- The only exceptions are late-stage IDs (passedCommittees, conference*, transmittedGovernor, vetoList, governorSigns, lawWithoutSignature) which apply regardless of crossover.",
  "",
  "---",
  "",
  "## 3. Committee Counting (CRITICAL)",
  "You are given the committee assignment list, e.g., 'Committees (in order): AGR, ECD, FIN'.",
  "Committees are listed in the order the bill must pass through:",
  "- 1st committee in the list = First Committee Hearing",
  "- 2nd committee in the list = Second Committee Hearing",
  "- 3rd committee in the list = Third Committee Hearing",
  "",
  "To determine the hearing number, find which committee is mentioned in the status text and match it to its position in the list.",
  "Example: Committees are 'AGR, ECD, FIN'. Status says 'committee on ECD recommends PASS' -> ECD is 2nd -> 'Waiting to be Scheduled for Second Committee Hearing' (or crossover variant).",
  "Example: Committees are 'AGR, ECD, FIN'. Status says 'referred to FIN' -> FIN is 3rd -> 'Waiting to be Scheduled for Third Committee Hearing'.",
  "",
  "After crossover, the opposite chamber assigns its own committees. Use the committee names in the status text and the referral order to determine position.",
  "Joint committee hearings (e.g., 'ECD/TOU') count as ONE committee slot.",
  "",
  "---",
  "",
  "## 4. What Counts as a Committee Hearing?",
  "Key phrases and their meaning:",
  "- 'Referred to X, Y, Z, referral sheet N' -> Bill introduced and assigned committees -> introduced.",
  "- 'Bill scheduled to be heard by X on ...' -> Hearing is scheduled -> scheduled1/scheduled2/scheduled3 (or crossover variant).",
  "- 'Bill scheduled for decision making on ...' -> This is a scheduled hearing -> scheduled1/scheduled2/scheduled3 (or crossover variant).",
  "- 'The committee on X recommend that the measure be PASSED' -> Committee passed it. Bill advances to next committee -> waiting2/waiting3 (or crossover variant).",
  "- 'The committee on X deferred the measure' or 'committee on X recommend that the measure be DEFERRED' -> deferred1/deferred2/deferred3 (or crossover variant).",
  "- 'Report adopted; referred to Y' or 'Passed Second Reading and referred to Y' -> Prior hearing done. Bill waiting for NEXT committee (Y's position) -> waiting2/waiting3 (or crossover variant).",
  "- 'Reported from X ... recommending passage on Second Reading and referral to Y' -> Same as above, waiting for Y.",
  "- 'Passed Third Reading' and 'Transmitted to [other chamber]' -> crossoverWaiting1.",
  "- 'Received from [chamber]' in the opposite chamber -> Bill just crossed over -> crossoverWaiting1.",
  "- 'Returned from [chamber] in amended form' -> Both chambers have passed it but versions differ. This typically means conference committees are needed.",
  "",
  "---",
  "",
  "## 5. Allowed Status IDs",
  "You MUST output exactly one of these IDs. No other text.",
  "",
  "### Pre-crossover (originating chamber):",
  "| ID              | Meaning                                                    |",
  "| --------------- | ---------------------------------------------------------- |",
  "| introduced      | Introduced / waiting for 1st committee hearing             |",
  "| scheduled1      | Scheduled for 1st committee hearing                        |",
  "| deferred1       | Deferred after 1st committee hearing                       |",
  "| waiting2        | Waiting for 2nd committee hearing                          |",
  "| scheduled2      | Scheduled for 2nd committee hearing                        |",
  "| deferred2       | Deferred after 2nd committee hearing                       |",
  "| waiting3        | Waiting for 3rd committee hearing                          |",
  "| scheduled3      | Scheduled for 3rd committee hearing                        |",
  "| deferred3       | Deferred after 3rd committee hearing                       |",
  "",
  "### Post-crossover (opposite chamber):",
  "| ID                  | Meaning                                                |",
  "| ------------------- | ------------------------------------------------------ |",
  "| crossoverWaiting1   | Crossed over, waiting for 1st committee hearing        |",
  "| crossoverScheduled1 | Scheduled for 1st committee hearing after crossover    |",
  "| crossoverDeferred1  | Deferred after 1st committee hearing after crossover   |",
  "| crossoverWaiting2   | Waiting for 2nd committee hearing after crossover      |",
  "| crossoverScheduled2 | Scheduled for 2nd committee hearing after crossover    |",
  "| crossoverDeferred2  | Deferred after 2nd committee hearing after crossover   |",
  "| crossoverWaiting3   | Waiting for 3rd committee hearing after crossover      |",
  "| crossoverScheduled3 | Scheduled for 3rd committee hearing after crossover    |",
  "| crossoverDeferred3  | Deferred after 3rd committee hearing after crossover   |",
  "",
  "### Late-stage:",
  "| ID                  | Meaning                                                |",
  "| ------------------- | ------------------------------------------------------ |",
  "| passedCommittees    | Passed all committees in both chambers                 |",
  "| conferenceAssigned  | Conference committees assigned                         |",
  "| conferenceScheduled | Conference hearing scheduled                           |",
  "| conferenceDeferred  | Deferred during conference committee                   |",
  "| conferencePassed    | Passed conference committee                            |",
  "| transmittedGovernor | Transmitted to Governor                                |",
  "| vetoList            | Governor's intent to veto                              |",
  "| governorSigns       | Governor signed bill into law                          |",
  "| lawWithoutSignature | Became law without Governor's signature                |",
  "",
  "---",
  "",
  "## 6. Decision Rubric",
  "Follow these steps in order:",
  "",
  "Step 1: GOVERNOR CHECK (highest priority).",
  "- If ANY status line contains 'Act' followed by a number (e.g., 'Act 048', 'Act 137') -> governorSigns. STOP.",
  "- If ANY status line contains 'Became law without' -> lawWithoutSignature. STOP.",
  "- If ANY status line contains 'intent to veto' -> vetoList. STOP.",
  "- If the newest status line says 'Transmitted to Governor' -> transmittedGovernor. STOP.",
  "",
  "Step 2: CONFERENCE CHECK.",
  "- The input includes a pre-computed 'BothChambers: YES/NO' line indicating whether the status log contains updates from BOTH the House (H) and the Senate (S).",
  "- Conference IDs (conferenceAssigned, conferenceScheduled, conferenceDeferred, conferencePassed) may ONLY be used when 'BothChambers: YES'. A bill cannot reach conference without activity in both chambers.",
  "- If 'BothChambers: NO', NEVER output a conference ID, even if the status text mentions the word 'conference'. Instead, classify using the appropriate committee-stage ID.",
  "- If 'BothChambers: YES' AND status mentions conference committee scheduling, deferral, passage, or assignment -> use the matching conference ID.",
  "",
  "Step 3: CROSSOVER CHECK.",
  "- Read the 'Crossover: YES/NO' line from the input. This is pre-computed and authoritative.",
  "- If NO -> use non-crossover IDs (introduced, scheduled1-3, deferred1-3, waiting2-3).",
  "- If YES -> use crossover IDs (crossoverWaiting1-3, crossoverScheduled1-3, crossoverDeferred1-3).",
  "- Do NOT second-guess this field. It is always correct.",
  "",
  "Step 4: COMMITTEE NUMBER.",
  "- Find which committee is mentioned in the status text.",
  "- Match it to the committee assignment list to determine 1st/2nd/3rd.",
  "- Select the appropriate category based on the action (introduced, scheduled, deferred, waiting, passed).",
  "",
  "Step 5: Output exactly one status ID. Nothing else.",
  "",
  "---",
  "",
  "## 7. Few-Shot Examples",
  "(Bill info and status lines are provided newest -> oldest.)",
  "",
  "Example A:",
  "Bill: SB1234 (Originated in Senate)",
  "Committees (in order): AGR, ECD, FIN",
  "S 3/4/2025 Referred to AGR, ECD, FIN, referral sheet 18",
  "-> Crossover check: SB = Senate, chamber = S, same -> NOT crossover",
  "-> Committee: AGR is 1st, but bill was just introduced",
  "= introduced",
  "",
  "Example B:",
  "Bill: SB1234 (Originated in Senate)",
  "Committees (in order): AGR, ECD, FIN",
  "H 3/21/2025 Report adopted; referred to FIN",
  "H 3/19/2025 Committee on ECD recommends PASS WITH AMENDMENTS",
  "-> Crossover check: SB = Senate, chamber = H, different -> CROSSOVER",
  "-> Committee: FIN is 3rd in original list, but after crossover use referral order. ECD passed, now referred to FIN as next committee.",
  "= crossoverWaiting3",
  "",
  "Example C:",
  "Bill: HB1099 HD1 SD1 CD1 (Originated in House)",
  "S Act 048, on 05/14/2025 (Gov. Msg. No. 1148).",
  "-> Governor check: contains 'Act 048' -> STOP",
  "= governorSigns",
  "",
  "Example D:",
  "Bill: HB1060 HD1 (Originated in House)",
  "Committees (in order): EEP, ECD, FIN",
  "H 2/12/2025 Bill scheduled for decision making on Wednesday, 02-12-25 11:00AM",
  "-> Crossover check: HB = House, chamber = H, same -> NOT crossover",
  "-> This is a scheduled hearing. Which committee? Check context for committee name.",
  "= scheduled1",
  "",
  "## 8. No Backward Regression (CRITICAL)",
  "Bills move FORWARD through the legislative process. They do NOT move backward.",
  "The status IDs are ordered by progression (index 0 = earliest stage, higher index = later stage).",
  "The input includes a 'Current status: <statusId> (index N)' line showing the bill's current position.",
  "Your classification MUST have an index >= the current index. A bill at index 5 cannot regress to index 3.",
  "If the status text is ambiguous, keep the bill at its current status rather than moving it backward.",
  "The ONLY exception: 'unassigned' (index 0) has no restriction — any status is valid from unassigned.",
  "",
  "---",
  "",
  "## 9. Output format",
  "Respond with exactly one status ID (e.g., 'introduced', 'waiting2', 'crossoverWaiting1', 'governorSigns').",
  "No extra text, no explanations, no reasoning.",
  "Do not repeat the status log.",
  "",
  "IMPORTANT: The output must be EXACTLY one of the status IDs listed in Section 5. Nothing else.",
].join('\n');

// Prompt version: v6 - add no-backward-regression rule + deterministic guard
// v1: 48% -> v2: 60.3% -> v3: 63.7% -> v4: TBD -> v5: TBD -> v6: TBD
const PROMPT_VERSION = 'v6';

const LLM_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

function detectCrossover(billNumber: string, newestChamber: string): boolean {
    const prefix = billNumber.trim().substring(0, 2).toUpperCase();
    const originChamber = prefix === 'HB' ? 'H' : prefix === 'SB' ? 'S' : null;
    if (!originChamber) return false;
    return newestChamber.toUpperCase() !== originChamber;
}

/**
 * Enforces monotonic forward progression of bill status.
 * Returns the proposedStatus if it's at or ahead of currentStatus,
 * otherwise returns currentStatus (no regression allowed).
 * Bills at 'unassigned' have no restriction.
 */
function enforceForwardProgression(currentStatus: string | null | undefined, proposedStatus: string): string {
    if (!currentStatus || currentStatus === 'unassigned') return proposedStatus;

    const currentIndex = COLUMN_INDEX[currentStatus];
    const proposedIndex = COLUMN_INDEX[proposedStatus];

    // If either status is unknown, allow the proposed status through
    if (currentIndex === undefined || proposedIndex === undefined) return proposedStatus;

    if (proposedIndex < currentIndex) {
        console.warn(`[LLM] Backward regression blocked: "${proposedStatus}" (index ${proposedIndex}) < current "${currentStatus}" (index ${currentIndex}). Keeping current status.`);
        return currentStatus;
    }

    return proposedStatus;
}

async function getContext(billId: string) {
    console.log('[LLM] fetching recent status update context...')
    try {
        const bill = await db.selectFrom('bills')
            .select(['bill_number', 'committee_assignment', 'bill_status'])
            .where('id', '=', billId)
            .executeTakeFirst();

        // Lightweight query: distinct chambers across ALL status updates (for pre-computed flags)
        const distinctChambers = await db.selectFrom('status_updates')
            .select('chamber')
            .distinct()
            .where('bill_id', '=', billId)
            .execute();

        // Limited query: only the most recent status lines for LLM context
        const data = await db.selectFrom('status_updates as su')
            .select(['chamber', 'date', 'statustext'])
            .where('bill_id', '=', billId)
            .orderBy(sql`cast(su.date as date)`, 'desc')
            .limit(10)
            .execute();
        console.log('[LLM] # of status updates (capped at 10):', data.length)
        console.log('[LLM] current status update:', data[0])

        const lines: string[] = [];

        // Add bill number so LLM knows originating chamber
        if (bill?.bill_number) {
            const prefix = bill.bill_number.trim().substring(0, 2).toUpperCase();
            const chamber = prefix === 'HB' ? 'House' : prefix === 'SB' ? 'Senate' : 'Unknown';
            lines.push(`Bill: ${bill.bill_number} (Originated in ${chamber})`);
        }

        // Add committee assignment so LLM can count committee order
        if (bill?.committee_assignment) {
            lines.push(`Committees (in order): ${bill.committee_assignment}`);
        }

        // Deterministic crossover detection
        if (bill?.bill_number && data.length > 0) {
            const crossed = detectCrossover(bill.bill_number, data[0].chamber);
            console.log('[LLM] Crossover detected:', crossed, `(bill prefix: ${bill.bill_number.substring(0,2).toUpperCase()}, newest chamber: ${data[0].chamber.toUpperCase()})`);
            lines.push(`Crossover: ${crossed ? 'YES — bill is now in the opposite chamber. Use crossover status IDs (crossoverWaiting1, crossoverScheduled1, etc.)' : 'NO — bill is still in its originating chamber. Use non-crossover status IDs (introduced, scheduled1, waiting2, etc.)'}`);
        }

        // Deterministic both-chambers detection (uses full history via distinct query)
        const chambers = new Set(distinctChambers.map(row => row.chamber.toUpperCase()));
        const bothChambers = chambers.has('H') && chambers.has('S');
        console.log('[LLM] BothChambers: ', bothChambers, ' (distinct chambers in history:', Array.from(chambers).join(', '), ')');
        lines.push(`BothChambers: ${bothChambers ? 'YES — status updates exist from both chambers. Conference IDs are eligible.' : 'NO — only one chamber has acted. Conference IDs are NOT allowed.'}`);

        // Include current status so the LLM can respect the no-backward-regression rule
        if (bill?.bill_status) {
            const currentIndex = COLUMN_INDEX[bill.bill_status];
            lines.push(`Current status: ${bill.bill_status} (index ${currentIndex ?? '?'}). Your classification must have an index >= ${currentIndex ?? '?'}.`);
        }

        lines.push('');
        lines.push('Status log (newest first):');

        // Format as tab-separated string, one row per line
        for (const row of data) {
            lines.push(`${row.chamber}\t${row.date}\t${row.statustext}`);
        }

        return lines.join('\n');
    } catch (error){
        console.log('Error fetching bill\'s status context:', error)
        return null
    }
}
export async function classifyStatusWithLLM(billId: string, maxRetries = 3, retryDelay = 1000) {
    console.log("[LLM] model:", process.env.VLLM || process.env.LLM);

    console.log("[LLM] classifying bill:", billId.slice(0,6), '...');
    const rl = limitFixedWindow(`llm:classify:${billId}`, LLM_RATE_LIMIT.limit, LLM_RATE_LIMIT.windowMs);
    if (!rl.ok) {
        console.warn('LLM classification rate limited', { billId, retryAfterMs: retryAfterMs(rl.resetAt) });
        return null;
    }

    const context = await getContext(billId);
    let attempt = 0;
    console.log('[LLM] starting classification attempts...')
    while (attempt < maxRetries) {
            try {
                const model = process.env.VLLM || process.env.LLM || '';
                if (!model) {
                    console.log('[LLM] model not found')
                    console.error('[LLM] LLM model not configured. Please set VLLM or LLM environment variable.');
                    return null;
                }
                const response = await client.chat.completions.create({
                    model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        {
                            role: 'user',
                            content: [
                                "Here is the bill's context and status log:",
                                context,
                                "",
                                "Classify this bill's current status. Respond with only the status ID.",
                                " /no_think"
                            ].join("\n")
                        }
                    ],
                    temperature: 0.0
                });
                // console.log('response:', response)

                if (!response || !response.choices[0].message.content || !response.choices || !response.choices[0].message) {
                    console.log('response not found')
                    return null;
                }

                const classification = response.choices[0].message.content.trim();
                console.log("Classification:", classification);
                const mappedStatus = mapToColumnID(classification)
                console.log("Mapped:", mappedStatus)

                if (!mappedStatus) return mappedStatus;

                // Deterministic guard: prevent backward regression
                const currentBill = await db.selectFrom('bills')
                    .select('bill_status')
                    .where('id', '=', billId)
                    .executeTakeFirst();

                const newStatus = enforceForwardProgression(currentBill?.bill_status, mappedStatus);
                if (newStatus !== mappedStatus) {
                    console.log(`[LLM] Final status after guard: ${newStatus} (LLM proposed: ${mappedStatus})`);
                }

                return newStatus;
            } catch (error) {
                const err = error as any;
                const status = err?.response?.status || err?.status;
                const message = typeof err?.message === 'string' ? err.message : String(err);

                // Retry on HTTP 524 (Cloudflare), ETIMEDOUT, or generic timeout message
                const isTimeout =
                    status === 524 ||
                    err?.code === 'ETIMEDOUT' ||
                    message.toLowerCase().includes('timeout');

                if (isTimeout) {
                    attempt++;
                    if (attempt < maxRetries) {
                        console.warn(`Timeout encountered. Retrying attempt ${attempt + 1} after ${retryDelay}ms...`);
                        await new Promise(res => setTimeout(res, retryDelay));
                        continue;
                    }
                }
                console.error(`Error:`, message);
                return null;
            }
        }
}

const VALID_STATUS_IDS = new Set(KANBAN_COLUMNS.map(col => col.id));

function mapToColumnID(classification: string): string | undefined {
    const id = classification.trim();
    // Direct ID match (v3+ prompt outputs IDs directly)
    if (VALID_STATUS_IDS.has(id)) return id;
    // Fallback: title match (backwards compatibility)
    const col = KANBAN_COLUMNS.find(col => col.title.trim().toLowerCase() === id.toLowerCase());
    return col ? col.id : undefined;
}

// ==============================================
// AI SUMMARIES (documents + version diffs)
// ==============================================
// Spec: docs/superpowers/specs/2026-07-28-ai-version-summaries-design.md
// Prompt construction is PURE and lives in @/lib/summary-prompts — this section
// only orchestrates the call. Opt-in enforcement is the CALLER's job (the action
// and route arms); by the time we get here consent is already verified.

/** Same fixed window as classification: cheap protection against click-spam. */
const SUMMARY_RATE_LIMIT = { limit: 5, windowMs: 60_000 };

/**
 * Client-side ceiling on a summary request. Kept under the typical Cloudflare
 * 100s gateway limit so we fail with a real error instead of a bodiless 524.
 */
const SUMMARY_TIMEOUT_MS = 90_000;

/** Summaries run 25-180 words; this is generous headroom, not a target. */
const SUMMARY_MAX_TOKENS = 700;

/** The configured model, surfaced in the UI's provenance footer. */
export async function getSummaryModelName(): Promise<string> {
  return process.env.VLLM || process.env.LLM || 'unknown';
}

async function runSummary(
  systemPrompt: string,
  userTurn: string,
  rateLimitKey: string,
): Promise<string | null> {
  const rl = limitFixedWindow(rateLimitKey, SUMMARY_RATE_LIMIT.limit, SUMMARY_RATE_LIMIT.windowMs);
  if (!rl.ok) {
    console.warn('[LLM] summary rate limited', { rateLimitKey, retryAfterMs: retryAfterMs(rl.resetAt) });
    return null;
  }

  const model = process.env.VLLM || process.env.LLM || '';
  if (!model) {
    console.error('[LLM] model not configured. Set VLLM or LLM.');
    return null;
  }

  try {
    const response = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${userTurn}\n /no_think` },
        ],
        temperature: 0.0,
        // Summaries are 25-180 words. Without a ceiling a confused model can
        // run for minutes and get killed by the gateway (observed: HTTP 524,
        // no body) instead of returning something usable.
        max_tokens: SUMMARY_MAX_TOKENS,
      },
      // Fail fast and locally rather than waiting for the upstream gateway to
      // drop the connection — a 524 arrives with no body and no useful error.
      { timeout: SUMMARY_TIMEOUT_MS },
    );

    const text = response?.choices?.[0]?.message?.content?.trim();
    return text ? text : null;
  } catch (error) {
    // A timeout is worth distinguishing: "try again" is bad advice when the
    // request will simply time out again. 524 is the gateway's own timeout.
    const status = (error as { status?: number })?.status;
    const isTimeout =
      status === 524 ||
      status === 504 ||
      (error as { name?: string })?.name === 'APIConnectionTimeoutError';
    if (isTimeout) {
      console.error('[LLM] summary timed out', { rateLimitKey, status, promptChars: userTurn.length });
      return null;
    }
    console.error('[LLM] summary failed', error);
    return null;
  }
}

export async function summarizeDocumentWithLLM(input: {
  label: string;
  kind: 'bill version' | 'committee report';
  committees: string | null;
  text: string;
  rateLimitKey: string;
}): Promise<string | null> {
  const userTurn = buildDocumentUserTurn({
    label: input.label,
    kind: input.kind,
    committees: input.committees,
    text: input.text,
  });
  return runSummary(DOCUMENT_SYSTEM_PROMPT, userTurn, input.rateLimitKey);
}

/**
 * Committee reports get their OWN prompt, not the bill-version one. A report
 * records what a committee DID — passed, amended, deferred, who testified — and
 * the shared prompt was summarizing the bill the report restates instead. 75% of
 * the 7,827 reports in the corpus amend the bill, so those actions are the
 * substance, not a footnote.
 */
export async function summarizeReportWithLLM(input: {
  label: string;
  reportCode: string | null;
  versionLabel: string | null;
  text: string;
  rateLimitKey: string;
}): Promise<string | null> {
  const userTurn = buildReportUserTurn({
    label: input.label,
    reportCode: input.reportCode,
    versionLabel: input.versionLabel,
    text: input.text,
  });
  return runSummary(REPORT_SYSTEM_PROMPT, userTurn, input.rateLimitKey);
}

export async function summarizeDiffWithLLM(input: {
  comparison: VersionComparison;
  committees: string | null;
  rateLimitKey: string;
}): Promise<string | null> {
  const userTurn = buildDiffUserTurn({
    comparison: input.comparison,
    committees: input.committees,
  });
  return runSummary(DIFF_SYSTEM_PROMPT, userTurn, input.rateLimitKey);
}
