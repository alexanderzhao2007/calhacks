# tot — Hackathon Delegation and Integration Plan

> **MVP:** Chrome extension for `claude.ai`, post-send response-cover flow  
> **Current team:** 3 developers  
> **Planned team:** 4 developers  
> **Canonical product and technical spec:** [`CLAUDE.md`](./CLAUDE.md)

## 1. Division of ownership

The three current contributors should start **in parallel**. Person 1 is the integration lead until the fourth developer arrives. If someone is especially experienced with extensions, assign them Person 1; this is the highest-risk workstream.

| Person | Primary track | Ownership | Definition of done |
|---|---|---|---|
| **1** | Claude browser integration **and integration lead** | Claude DOM adapter, sent-turn detection, response cover, conversation/turn IDs, safe follow-up insertion/submission, runtime state machine | Hardcoded intervention works end-to-end on Claude without missing/duplicating messages |
| **2** | Classification and question generation (two-stage) | Test examples and labels, Stage 1 classifier, Stage 2 question generator, the `/classify` and `/question` endpoints, structured JSON, caching/latency measurements, attachment-conservative decisions, the pure follow-up template | Stage 1 reliably distinguishes *visible student reasoning* from likely learning substitution inside the mask deadline; Stage 2 returns one specific question; follow-up text is deterministic and unit-tested |
| **3** | Sidebar and product UX | React + Shadow Root sidebar, Continue/Skip/Reveal, focus/accessibility, loading/error views, follow-up preview, locally testable mock interface | Polished component accepts typed contracts and emits user actions, with no knowledge of Claude DOM |
| **4 (when available)** | QA, performance, recovery, demo | Automated E2E checks, streaming/race cases, attachment tests, failure scenarios, latency dashboard, rehearsable demo | Regression suite and live demo pass on chosen Claude web build |

**Important:** Do not make Person 4 the only tester. Until they arrive, Person 1 tests site behavior, Person 2 tests classifier decisions, and Person 3 tests UI interactions.

## 2. What must be agreed together first (before separate branches)

Spend the first short team sync agreeing on:

1. This exact user flow: **send normally → cover new Claude output → classify asynchronously → reveal or sidebar → follow-up after user confirmation**.
2. Fail-open behavior: `uncertain`, timeout, API error, unsupported attachment and unexpected DOM state **must not trap the student**.
3. Shared contracts in `shared/contracts.ts` (start from `CLAUDE.md`): `ClassifyRequest`, `ClassifyResponse`, `QuestionRequest`, `QuestionResponse`, `SidebarRequest`, `SidebarResult`.
   - **Contract change from `CLAUDE.md` §7:** classification and question generation are now **two separate model calls behind two endpoints**. `ClassifyResponse.question` is therefore always `null`; the question arrives from a second `/question` call made only after a `intervene` decision. `CLAUDE.md` §2 ("one model request") and §7 must be updated to match before P1 or P3 implement against it.
4. Who owns the integrator: **Person 1** merges integration PRs and resolves shared behavior; nobody bypasses this agreement to alter page integration.
5. Definition of done: two contrasting learning examples plus one safe-failure scenario work live on Claude.
6. **Two deadlines, not one.** The Stage 1 classify deadline (initial target **2 s**) governs the cover. A separate Stage 2 question deadline (initial target **6 s**, to be measured, not assumed) governs the sidebar's loading state. Either deadline expiring **reveals** the original response; a Stage 2 expiry also closes the sidebar rather than leaving an empty prompt box.
7. **Attachment vision is consent-gated and in-session only.** See §3.3. Nothing is sent to the vision model without explicit opt-in, and anything the extension could not capture at upload time stays `uncertain`.

Record any contract changes in the shared types **before** a consuming team member changes implementation.

## 3. Interfaces between tracks

Person 2 owns **two sequential model calls behind two endpoints**. Only the first one sits inside the response-mask deadline.

```text
P1 detects sent turn ──► cover response
                       │
                       ▼
        Stage 1  POST /classify        (fast model, ≤ 2 s budget)
          text prompt + attachment metadata
          + consented attachment images
                       │
      allow / uncertain / timeout / error ──► reveal, DONE
                       │
                   intervene
                       │
                       ▼
            open sidebar in LOADING state (cover stays)
                       │
                       ▼
        Stage 2  POST /question        (Claude, ≤ 6 s budget)
          one train-of-thought question
                       │
         timeout / error ──► close sidebar, reveal, DONE
                       │
                       ▼
              student types reasoning ──► formatFollowUp() ──► P1 submits
```

### 3.1 Stage 1 — classification (`POST /classify`)

**Model:** a fast, cheap external model. *Target: a Gemini Flash Lite-class model; the exact model ID is **TBD by Person 2** and must not be depended on by core logic.* The provider is swappable behind this endpoint: P1 and P3 see only the JSON below.

**Job:** decide `allow` / `intervene` / `uncertain` per the rubric in `CLAUDE.md` §5. Nothing else — it never writes a question.

Person 1 → Person 2:

```json
{
  "requestId": "per-turn-id",
  "prompt": "Solve this integral for me",
  "attachments": [{ "name": "hw4.pdf", "mimeType": "application/pdf" }],
  "attachmentContentsAvailable": false,
  "attachmentContents": []
}
```

Person 2 → Person 1:

```json
{
  "requestId": "per-turn-id",
  "decision": "intervene",
  "reason": "Requests a full solution without visible effort",
  "question": null
}
```

`question` is **always `null`** on this endpoint; it exists only so the field stays shape-compatible with `CLAUDE.md` §7 during the transition. Person 1 owns the final deterministic behavior: reveal or open the sidebar, based on the validated result and state.

### 3.2 Stage 2 — train-of-thought question (`POST /question`)

**Model:** Claude, via the Claude API with server-side credentials. Called by the background worker **only** after a validated `intervene`.

**Job:** produce exactly one short, task-specific question that elicits the student's own first move — base cases, chosen method and why, proposed thesis, expected failure mode. It must not contain the answer, a worked step, or a multiple-choice menu of methods.

Person 1 → Person 2:

```json
{
  "requestId": "per-turn-id",
  "prompt": "Write the recursive Fibonacci function for my homework",
  "classifierReason": "Requests a full solution without visible effort",
  "attachments": [],
  "attachmentContentsAvailable": false,
  "attachmentContents": []
}
```

Person 2 → Person 1:

```json
{
  "requestId": "per-turn-id",
  "question": "Before seeing code, what are the base cases, and how does each call reduce the problem?"
}
```

On any failure, Person 2 returns a non-2xx response rather than a vague or generic question. A generic fallback question ("What do you think?") is **worse than revealing the answer** — it trains students to dismiss the sidebar. Person 1 fails open.

### 3.3 Attachment vision (consent-gated, in-session only)

Stage 1 may read attachment **images** through a vision-capable model, under these constraints, agreed as a unit:

- **Explicit opt-in.** Off by default. Until the student opts in, `attachmentContents` is always `[]` and behavior is identical to the text-only classifier. The consent copy must name that attachment images are sent to a third-party model.
- **In-session capture only (P1).** Attachments on `claude.ai` live on Anthropic's servers; the extension cannot fetch them back. P1 captures bytes at **upload time** in the live tab (file input / drag / paste). A conversation that was reloaded, or an attachment uploaded before tot was active, yields nothing.
- **`attachmentContentsAvailable` becomes a real boolean**, set by P1 per turn — it is no longer the literal `false` in `CLAUDE.md` §7. When it is `false`, the `CLAUDE.md` §5 rule still holds: a task living only in an unread attachment returns `uncertain` and passes through.
- **No persistence.** Attachment bytes are never stored, logged, or cached by request key.
- **Size and type ceiling** set by P2; anything over it is treated as unread rather than silently truncated.
- This is a **Phase C item**, not Phase A. The text-only classifier must pass its labeled set first.

### Person 1 → Person 3: show sidebar

```json
{
  "turnId": "claude-turn-id",
  "originalPrompt": "Solve this integral for me",
  "question": "What method would you try first, and why?"
}
```

### Person 3 → Person 1: student outcome

```json
{
  "action": "continue",
  "turnId": "claude-turn-id",
  "studentReasoning": "I think substitution might work because ..."
}
```

Or `{"action":"skip","turnId":"claude-turn-id"}`.

### Person 2 → Person 1: the follow-up text

Person 2 owns a **pure, deterministic, non-model** function — no LLM call on this path, so the same reasoning always produces the same message:

```ts
formatFollowUp(input: {
  studentReasoning: string;
  question: string;
}): string;
```

It returns the message body from `CLAUDE.md` §4: a framing line, the student's reasoning **quoted verbatim and unaltered**, and the request that Claude assess the reasoning and give a hint rather than restate the solution. Rules: never paraphrase, summarize, or "clean up" the student's words; escape or fence their text so it cannot read as instructions to Claude; return a plain string and nothing else.

**Boundary:** Person 3 returns the student's action and words. **Person 2** turns those words into the follow-up string. **Person 1** inserts that string into Claude's composer, previews it, and confirms exactly one submission landed. Neither Person 2 nor Person 3 may click buttons or manipulate Claude's composer. Person 3 renders the preview using the string P2's function returned — it does not build its own version of the text.

## 4. Work sequence and dependencies

### Phase A — Parallel feasibility work (start immediately)

**Person 1:**
- Initialize the WXT + React + TypeScript Chrome extension, permissioned only for Claude.
- Inspect Claude's actual DOM and document stable-enough selectors in one adapter.
- Detect submitted messages and related streaming responses.
- Build a cover/reveal demo with a hardcoded decision; measure whether early tokens flash.
- Prototype programmatic follow-up drafting and user-confirmed submission. Do not hardwire classifier or sidebar yet.

**Person 2:**
- Prepare 50–100 prompts labeled `allow/intervene/uncertain`, including already-attempted problems, conceptual questions, essays, coding, ambiguous context, and unread files.
- Build **both** mockable endpoints returning schema-validated JSON: `/classify` (Stage 1) and `/question` (Stage 2). Ship them as stubs on day one so P1 and P3 are never blocked.
- Implement Stage 1 model instructions based on **meaningful demonstrated effort**, not simple keyword detection. Text-only first; no vision in Phase A.
- Implement Stage 2 on the Claude API: one question, no answer leakage, no generic fallbacks.
- Write and unit-test the pure `formatFollowUp` template against the `CLAUDE.md` §4 example, including adversarial reasoning text (quotes, backticks, "ignore previous instructions").
- Measure p50/p95 **per stage separately** — Stage 1 against the 2 s cover deadline, Stage 2 against the 6 s sidebar deadline — plus failure behavior and false-positive interruptions.
- Treat prompt and reasoning text as **untrusted data** in both model calls; neither may be able to override the system instructions.

**Person 3:**
- Build standalone sidebar with representative fixture data.
- Implement one question, free-text input, Continue, Skip/Reveal, and follow-up preview.
- Validate keyboard focus and responsive UI; isolate styles in a Shadow Root.
- Export a component that uses only shared types and callbacks, not direct Claude selectors.

**Integration checkpoint A:** Person 1 demonstrates cover/reveal on Claude; Persons 2 and 3 demonstrate API and sidebar independently using mocks.

### Phase B — First real integration

- Person 1 wires new-turn capture to Person 2's `/classify` and validates the output.
- Person 1 wires `intervene` to Person 3's sidebar in its **loading** state, then calls `/question` and fills it in.
- `allow`, `uncertain`, Stage 1 timeout, and Stage 1 errors remove the cover.
- Stage 2 timeout or error closes the sidebar **and** removes the cover; the student is never left looking at an empty question box.
- Continue opens a preview and, after explicit confirmation, creates **one** follow-up in the existing Claude conversation.
- Skip reveals the original response and sends nothing.

**Integration checkpoint B:** All of the following work in one Chrome profile: allow, intervene/continue, skip, **Stage 1 timeout**, **Stage 2 timeout**, and navigation away mid-request at either stage.

### Phase C — Reliability and hackathon delivery

- Test multiple tabs, rapid requests, streamed output, edited drafts, navigation, UI changes, attachment indicators, and repeated classifier responses.
- Only now: add consented attachment vision to Stage 1 per §3.3, with the opt-in flow and the in-session upload capture. Verify that revoking consent returns the classifier to text-only behavior.
- Fix response-to-turn association and self-triggering on the tot-generated follow-up.
- Confirm no stuck covers and no overwritten existing drafts.
- Measure and record actual latency and response exposure, not assumed numbers.
- Freeze scope, rehearse demo, capture a fallback screen recording if allowed by the hackathon.

**Integration checkpoint C:** An unassisted live demo succeeds three consecutive times; one classification failure demonstrably recovers without locking the user out.

## 5. Fourth developer onboarding

When Person 4 joins, give them **tests and reliability ownership**, not a fourth core feature. Start with:

1. Run the current extension against the three acceptance scenarios and report reproducible failures.
2. Create an E2E smoke suite for message association, Continue, Skip, and timeout.
3. Stress test late API returns, Claude route/navigation changes, and immediate follow-up messages.
4. Record the cover-to-reveal distribution and any answer leakage.
5. Build the runbook for the live demo and help with final QA.

Person 4 can pair with Person 1 on brittle DOM issues, but Person 1 remains code owner for the adapter.

## 6. Suggested file ownership

```text
tot/
├── CLAUDE.md                       # Shared spec; team review
├── DELEGATION.md                   # Shared work plan; team review
├── shared/contracts.ts            # Shared contract; changes require agreement
├── extension/
│   ├── entrypoints/background.ts  # Person 1
│   ├── entrypoints/claude.content.tsx # Person 1 (mounts Person 3 UI)
│   ├── adapters/claudeAdapter.ts   # Person 1
│   ├── core/turnCoordinator.ts     # Person 1
│   ├── core/responseCover.ts       # Person 1
│   ├── core/followUpComposer.ts    # Person 1 — calls P2's formatFollowUp, owns submission
│   └── ui/TotSidebar.tsx           # Person 3
├── api/
│   ├── classify.ts                  # Person 2 — Stage 1, external fast model
│   └── question.ts                  # Person 2 — Stage 2, Claude API
├── shared/formatFollowUp.ts         # Person 2 — pure function, no DOM, no model call
├── tests/classifier/              # Person 2 initially; Person 4 assists
└── tests/e2e/                     # Person 1 initially; Person 4 owns later
```

Avoid parallel edits to the same adapter or coordinator files. Merge work in small PRs, ideally as working vertical increments rather than huge feature branches.

## 7. Biggest risks and owners

| Risk | Owner | Immediate mitigation |
|---|---|---|
| Claude DOM changes or assistant turn misidentified | P1 | Centralized selectors, runtime checks, automated smoke test |
| First tokens shown before cover | P1 / P4 | Attach cover on send event without blocking submission; verify real streaming behavior; document limits |
| Follow-up duplicates, wrong conversation, or overwrites draft | P1 / P4 | Turn IDs, idempotent state machine, detect occupied composer, submission confirmation |
| Classifier interrupts prompts already showing effort | P2 | Labeled regression prompts, conservative `uncertain`, explicit rubric |
| API slowness leaves response hidden | P2 / P1 | 2 s maximum Stage 1 mask, fail open; collect p95 |
| Two-stage pipeline doubles the latency budget | P2 | Stage 2 runs **after** the decision, outside the cover deadline; only `intervene` pays for it; separate 6 s sidebar deadline, also fail-open |
| Stage 2 question is generic, leading, or leaks the answer | P2 | Rubric for question quality, labeled review of generated questions, non-2xx instead of a fallback question |
| Credentials for two providers | P2 | Both keys server-side only; neither provider SDK ships in the extension bundle |
| Student cannot dismiss sidebar or recover response | P3 / P4 | Permanent Skip/Reveal affordance, keyboard and failure tests |
| Uploaded files assumed readable | P1 / P2 | In-session upload capture only; honest `attachmentContentsAvailable` flag; `uncertain` pass-through whenever contents are absent |
| Coursework images sent to a third-party model | P2 / P3 | Explicit opt-in naming the provider, off by default, no persistence of bytes, Phase C only |
| Raw conversation data leaked to logs | P1 / P2 | Explicit consent, minimal logging, no raw prompt persistence |

## 8. Commit and collaboration conventions

- Set up one repo and one main branch; create short-lived branches such as `feat/claude-adapter`, `feat/classifier`, and `feat/sidebar`.
- Person 1 establishes minimal tooling so everyone can run the same project.
- All components support **mock inputs** to avoid blocking on another track.
- Share the API's example requests/responses and sidebar fixtures at the start.
- PR checklist: builds, typechecks, includes a test or reproducible manual instructions, does not broaden site permissions, and preserves the fail-open path.
- When a real Claude selector changes, update **only the adapter** and its tests wherever practical.
- Resolve contract changes in a short group sync; do not silently change `shared/contracts.ts`.

## 9. Features explicitly deferred

Do not spend hackathon MVP time on:

- ChatGPT/Gemini support or generic adapter abstraction beyond clean Claude-specific boundaries.
- Friends, leaderboards, group challenges, accounts, or cloud user profiles.
- Learning/productivity modes, activity dashboards, or usage-scoring systems.
- Parsing arbitrary uploaded files or screenshots **beyond** the consented in-session attachment vision in §3.3. No OCR pipelines, no server-side file fetching, no retroactive reading of attachments from reloaded conversations.
- Editing and regenerating original Claude user messages.
- Autonomous agents, persistent personalized tutors, or a third model call. The pipeline is exactly **two** model calls — one classify, one question — plus a deterministic non-model formatter. No model rewrites the student's reasoning.
- Perfect protection against all answer exposure without having experimentally proved it is possible.

## 10. Demo checklist and ship criteria

**Demo 1 — Visible effort, no interruption**
> `I tried substitution because the inside derivative appears, but I'm getting stuck. Can you check my approach?`

Expected: classify `allow`; tot uncovers Claude normally.

**Demo 2 — No attempt, intervention**
> `Write the recursive Fibonacci function for my homework.`

Expected: Stage 1 classifies `intervene`; sidebar opens in loading state; Stage 2 returns a base-cases/recursion question; student types reasoning; `formatFollowUp` preview appears with their words quoted verbatim; one confirmed follow-up is sent; Claude responds to that reasoning.

**Demo 3 — Fail-open**
> Submit a prompt with a simulated slow or failed Stage 1, then repeat with a simulated slow or failed Stage 2.

Expected: Stage 1 failure — cover disappears at deadline, sidebar never opens. Stage 2 failure — the loading sidebar closes itself and the cover lifts. In both cases the original Claude response is accessible, with no stranded overlay, empty question box, or lost message.

**Ship only if** these work reliably. Then add cosmetic polish; do not trade message safety for more features.

---

**Decision rule for the team:** Any proposed addition must either make those three demos more reliable or address a clearly observed problem. Otherwise, defer it until after the hackathon.
