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
| **2** | Classification and backend | Test examples and labels, model prompt, one `/classify` endpoint, structured JSON, caching/latency measurements, attachment-conservative decisions | Reliable and fast API that distinguishes *visible student reasoning* from likely learning substitution |
| **3** | Sidebar and product UX | React + Shadow Root sidebar, Continue/Skip/Reveal, focus/accessibility, loading/error views, follow-up preview, locally testable mock interface | Polished component accepts typed contracts and emits user actions, with no knowledge of Claude DOM |
| **4 (when available)** | QA, performance, recovery, demo | Automated E2E checks, streaming/race cases, attachment tests, failure scenarios, latency dashboard, rehearsable demo | Regression suite and live demo pass on chosen Claude web build |

**Important:** Do not make Person 4 the only tester. Until they arrive, Person 1 tests site behavior, Person 2 tests classifier decisions, and Person 3 tests UI interactions.

## 2. What must be agreed together first (before separate branches)

Spend the first short team sync agreeing on:

1. This exact user flow: **send normally → cover new Claude output → classify asynchronously → reveal or sidebar → follow-up after user confirmation**.
2. Fail-open behavior: `uncertain`, timeout, API error, unsupported attachment and unexpected DOM state **must not trap the student**.
3. Shared contracts in `shared/contracts.ts` (start from `CLAUDE.md`): `ClassifyRequest`, `ClassifyResponse`, `SidebarRequest`, `SidebarResult`.
4. Who owns the integrator: **Person 1** merges integration PRs and resolves shared behavior; nobody bypasses this agreement to alter page integration.
5. Definition of done: two contrasting learning examples plus one safe-failure scenario work live on Claude.

Record any contract changes in the shared types **before** a consuming team member changes implementation.

## 3. Interfaces between tracks

### Person 1 → Person 2: submitted prompt

```json
{
  "requestId": "per-turn-id",
  "prompt": "Solve this integral for me",
  "attachments": [],
  "attachmentContentsAvailable": false
}
```

### Person 2 → Person 1: decision + optional question

```json
{
  "requestId": "per-turn-id",
  "decision": "intervene",
  "reason": "Requests a full solution without visible effort",
  "question": "What method would you try first, and why?"
}
```

For `allow` or `uncertain`, `question` must be `null`. Person 1 owns the final deterministic behavior: reveal or open the sidebar, based on the validated result and state.

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

**Boundary:** Person 3 returns the student's action and words; **Person 1** assembles the site-specific follow-up submission and checks that it succeeds. Person 3 can own a pure `formatFollowUp` function, but it must not click buttons or manipulate Claude's composer.

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
- Build one mockable `/classify` API returning schema-validated JSON.
- Implement model instructions based on **meaningful demonstrated effort**, not simple keyword detection.
- Measure request p50/p95, failure behavior, false-positive interruptions.

**Person 3:**
- Build standalone sidebar with representative fixture data.
- Implement one question, free-text input, Continue, Skip/Reveal, and follow-up preview.
- Validate keyboard focus and responsive UI; isolate styles in a Shadow Root.
- Export a component that uses only shared types and callbacks, not direct Claude selectors.

**Integration checkpoint A:** Person 1 demonstrates cover/reveal on Claude; Persons 2 and 3 demonstrate API and sidebar independently using mocks.

### Phase B — First real integration

- Person 1 wires new-turn capture to Person 2's API and validated output.
- Person 1 wires `intervene` to Person 3's sidebar through the agreed interface.
- `allow`, `uncertain`, timeout, and errors remove the cover.
- Continue opens a preview and, after explicit confirmation, creates **one** follow-up in the existing Claude conversation.
- Skip reveals the original response and sends nothing.

**Integration checkpoint B:** All of the following work in one Chrome profile: allow, intervene/continue, skip, API timeout, navigation away.

### Phase C — Reliability and hackathon delivery

- Test multiple tabs, rapid requests, streamed output, edited drafts, navigation, UI changes, attachment indicators, and repeated classifier responses.
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
│   ├── core/followUpComposer.ts    # Person 1
│   └── ui/TotSidebar.tsx           # Person 3
├── api/classify.ts                 # Person 2
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
| API slowness leaves response hidden | P2 / P1 | 2s maximum initial mask, fail open; collect p95 |
| Student cannot dismiss sidebar or recover response | P3 / P4 | Permanent Skip/Reveal affordance, keyboard and failure tests |
| Uploaded files assumed readable | P1 / P2 | Metadata only, `attachmentContentsAvailable: false`, conservative pass-through |
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
- Parsing arbitrary uploaded files or screenshots.
- Editing and regenerating original Claude user messages.
- Autonomous agents, persistent personalized tutors, or multiple classification model calls.
- Perfect protection against all answer exposure without having experimentally proved it is possible.

## 10. Demo checklist and ship criteria

**Demo 1 — Visible effort, no interruption**
> `I tried substitution because the inside derivative appears, but I'm getting stuck. Can you check my approach?`

Expected: classify `allow`; tot uncovers Claude normally.

**Demo 2 — No attempt, intervention**
> `Write the recursive Fibonacci function for my homework.`

Expected: classify `intervene`; tot asks for base cases/recursive idea; student types reasoning; preview appears; one confirmed follow-up is sent; Claude can respond to that reasoning.

**Demo 3 — Fail-open**
> Submit a prompt with a simulated slow or failed classifier.

Expected: cover disappears at deadline; original Claude response is accessible; no stranded overlay or lost message.

**Ship only if** these work reliably. Then add cosmetic polish; do not trade message safety for more features.

---

**Decision rule for the team:** Any proposed addition must either make those three demos more reliable or address a clearly observed problem. Otherwise, defer it until after the hackathon.
