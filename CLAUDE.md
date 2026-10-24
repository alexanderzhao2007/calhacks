# tot — Claude Implementation Guide

> **Project:** tot ("train of thought")  
> **Product:** Chrome extension that helps college students contribute independent reasoning when using AI for learning  
> **Initial supported site:** `https://claude.ai/` only  
> **Status:** Hackathon MVP specification, not a claim that Claude's current DOM has been validated  
> **Team plan:** See [`DELEGATION.md`](./DELEGATION.md).

## 1. Product in one paragraph

tot is a lightweight behavioral intervention layer on Claude. When a student asks Claude to do substantive learning-related work **without showing a meaningful attempt**, tot can briefly hide the newly generated answer, ask **one context-specific train-of-thought (ToT) question**, and let the student contribute an initial idea. tot then prepares a follow-up message containing **the student's exact reasoning** and asks Claude to assess that reasoning and guide the next step rather than simply repeat a finished solution. When the student has already shown effort, is asking for explanation or feedback, or the request is unrelated to learning, tot should stay out of the way.

**Principle:** Encourage thinking before accepting an answer. Do not treat all AI use or all cognitive offloading as harmful.

## 2. Non-negotiable MVP decisions

- **Claude web app only.** Do not spend MVP time supporting ChatGPT, Gemini, other browsers, or the Claude API as the chat surface.
- **Post-send architecture.** The student's original message is submitted normally. tot does **not** block Enter, disable Send, or delay the outgoing Claude request while waiting for an LLM.
- **Cover then decide.** As soon as a submitted turn is detected, protect the incoming assistant-response area while an asynchronous classifier runs. If no intervention is warranted, reveal it immediately.
- **One model request** returns the classifier decision and, if needed, one concise, task-specific question. No multi-agent system.
- **No user modes.** Every interaction is evaluated conservatively; productive or ambiguous interactions pass through.
- **Sidebar:** A single question, free-text response, **Continue**, and **Skip / Reveal**. Voice is out of scope.
- **Continue:** Prepare a tutoring-focused follow-up in the **same Claude conversation** using the student's words. Show a preview and require confirmation before automatic submission in the MVP.
- **Skip:** Remove the cover; send no follow-up. Always offer a way out.
- **No automatic edit/regenerate.** Do not navigate Claude's original-message Edit UI; it is not part of this MVP.
- **Attachment handling:** Detect attachment presence/available metadata; do not assume the extension can read uploaded file contents. Fall back conservatively when the task lives inside an unread file.
- **Privacy:** Do not transmit prompt content to a remote classifier before clear opt-in. Do not store raw chat messages or file contents by default.

## 3. Why we're building this

Students can use AI to finish problems without practicing the underlying reasoning. This is a concern about **unproductive cognitive offloading**, not a demonstrated long-term decline in intelligence or brain function. The design is motivated by learning research on independent attempts, self-explanation, and metacognition. Do not claim tot has been proven to improve learning. A hackathon demo can validate feasibility and user behavior; a controlled study is needed to establish improvements in retention or independent problem-solving.

**Initial users:** College students, particularly those doing introductory programming, mathematics, statistics, or writing-intensive coursework. Do not build course-specific logic into the browser infrastructure.

## 4. Expected user flow

1. User types a prompt in Claude and presses Send **normally**.
2. A Claude-specific content script recognizes the new submitted user turn, captures its text and safe attachment metadata, and immediately covers the associated *new assistant response* before answer text is visible where feasible.
3. The extension calls the classifier API asynchronously (after consent). Claude is already processing the original request.
4. The API returns one of `allow`, `intervene`, or `uncertain`, with a question only for `intervene`.
5. For `allow`, `uncertain`, timeout, backend error, unsupported state, or extension failure: **reveal the answer**. Never trap the user.
6. For `intervene`: open the tot sidebar with one specific question. Preserve the original answer behind a reversible cover.
7. User can **Skip / Reveal** or type their thoughts and choose **Continue**.
8. On Continue, compose an explicit follow-up from the student's words, preview it, and send it to the **same conversation after confirmation**. Do not impersonate the student or silently change their meaning.
9. Keep the original full answer hidden unless the student explicitly reveals it; display Claude's tutoring follow-up normally if the site adapter can distinguish it. Provide a visible Reveal option and a safe recovery path if this cannot be done reliably.

**Fundamental trade-off:** Claude already generated an answer and it remains part of conversation context. Hiding it does not undo the generation. A follow-up can redirect Claude toward tutoring, but is not the same as inserting student reasoning into the original message before generation. Measure whether this flow actually encourages independent thinking.

### Illustrative example

- Original message: `Write the recursive Fibonacci function for my assignment.`
- tot question: `Before seeing code, what are the base cases, and how does each call reduce the problem?`
- Student response: `The base cases should be 0 and 1. For bigger n, call the function on n-1 and n-2.`
- Follow-up sent to Claude (after preview):

```text
I want to work through my earlier question rather than just receive a finished solution.

My initial approach (my own words):
"The base cases should be 0 and 1. For bigger n, call the function on n-1 and n-2."

Please evaluate whether this reasoning is on track, point out any misconception,
and help me identify the next step with a hint or question. Avoid immediately
restating the complete solution unless I explicitly ask for it.
```

## 5. Decision criteria for Layer 1

Do **not** judge prompts as "stupid". Estimate whether an independent-thinking checkpoint would be useful **based on the whole visible prompt**.

Intervene only if all are reasonably true:

1. The request concerns a substantive intellectual/learning task (solve, derive, code, argue, analyze, etc.).
2. The student is asking Claude to perform a meaningful part of that task for them.
3. Their message does **not** already contain meaningful task-specific thinking: e.g. an initial approach, partial working, hypothesis, specific rationale, proposed structure, attempted code, or precise obstacle.
4. One short pre-answer question can elicit useful independent reasoning.

Do **not** intervene if the student shows genuine reasoning **even if the reasoning is wrong**, seeks conceptual explanation, wants critique of their own attempt, is doing ordinary administration, or the evidence is insufficient. A text such as `Can you solve this? I tried substitution because ...` is *not* automatically eligible because it starts with `solve this`.

A request whose actual problem exists only in an unread attachment should normally return `uncertain` and pass through. An attachment filename is not evidence of its content.

### Classifier examples

| Submitted prompt | Decision | Reason |
|---|---|---|
| `Solve this integral for me.` | `intervene` | Wants complete solution; no visible attempt |
| `Solve it. I tried u-substitution because the inner derivative appears, but got stuck.` | `allow` | Task-specific reasoning and a precise obstacle |
| `What does integration by parts mean?` | `allow` | Asks for explanation |
| `Write my entire essay arguing for utilitarianism.` | `intervene` | Outsources central argument |
| `Here's my thesis and supporting evidence. What is weak?` | `allow` | Seeks feedback on independent thought |
| `Summarize this administrative email.` | `allow` | Routine productivity |
| `Do number 4` with unread PDF | `uncertain` | Not enough information to ask a relevant question |
| `Do the next one.` | `uncertain` | Meaning depends on prior conversation |

## 6. Architecture

```text
claude.ai (user submits normally)
  │
  ▼
Claude content-script adapter  ────────────────┐
  │ detect submitted turn, response, attachments│
  │ cover newly generated response             │
  ▼                                            │
Shared turn coordinator / state machine        │
  │                                            │
  ├──► background worker ─► /api/classify ─► LLM
  │                         │                  │
  │                         ◄── structured JSON│
  ▼                                            │
Decision policy                                │
  ├─ allow / uncertain / failure ─► reveal     │
  └─ intervene ─► React sidebar                │
                         │                     │
                 student's reasoning          │
                         │                     │
                         ▼                     │
                 follow-up composer ───────────┘
                         │
                         ▼
                existing Claude conversation
```

### Implementation stack

- **Extension:** WXT, TypeScript, React, Chrome Manifest V3.
- **Page UI:** WXT content-script Shadow Root for isolated tot sidebar styles.
- **Browser adapter:** Claude-specific DOM observation and composer integration. Keep selectors centralized and easily replaceable.
- **Backend:** One small serverless HTTP endpoint and one fast LLM using a strict response schema. Put provider credentials only on the server.
- **State:** Per-tab/per-conversation runtime state plus minimal optional local aggregate counters. A hosted database is unnecessary for the MVP.
- **Testing:** Unit tests for policy and prompt formatting; browser end-to-end smoke tests on the actual Claude UI; manual streaming and failure testing.

Helpful implementation references:
- Chrome content scripts: https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
- WXT Shadow Root UI: https://wxt.dev/guide/essentials/content-scripts.html#shadow-root

**Do not assume Claude has stable selectors or APIs.** Inspect the live UI before selecting DOM targets. Build a narrow integration adapter rather than brittle selectors scattered across React components.

### Suggested repository layout

```text
tot/
├── CLAUDE.md
├── DELEGATION.md
├── extension/
│   ├── entrypoints/
│   │   ├── background.ts
│   │   └── claude.content.tsx
│   ├── adapters/
│   │   └── claudeAdapter.ts
│   ├── core/
│   │   ├── turnCoordinator.ts
│   │   ├── responseCover.ts
│   │   ├── decisionPolicy.ts
│   │   └── followUpComposer.ts
│   ├── ui/
│   │   └── TotSidebar.tsx
│   └── storage/
│       └── localStats.ts
├── api/
│   └── classify.ts
├── shared/
│   └── contracts.ts
└── tests/
    ├── classifier/
    └── e2e/
```

## 7. Shared interfaces (agree before parallel implementation)

Put types and runtime validation schemas in `shared/contracts.ts`. These are starting contracts; make adjustments **with agreement across owners**.

```ts
export type AttachmentMeta = {
  name?: string;
  mimeType?: string;
};

export type ClassifyRequest = {
  requestId: string;
  prompt: string;
  attachments: AttachmentMeta[];
  attachmentContentsAvailable: false; // MVP: do not parse attachments
};

export type ClassifyResponse = {
  requestId: string;
  decision: 'allow' | 'intervene' | 'uncertain';
  reason: string;
  question: string | null; // nonempty only if intervene
};

export type SidebarRequest = {
  turnId: string;
  question: string;
  originalPrompt: string;
};

export type SidebarResult =
  | { action: 'continue'; turnId: string; studentReasoning: string }
  | { action: 'skip'; turnId: string };
```

The sidebar may display only the question and task summary rather than the full original prompt, but its parent coordinator retains the exact original user turn. Validate all API output before it affects page UI.

## 8. The turn coordinator and race conditions

Keep a **state machine for each new user turn**, not a single global flag for the whole browser.

```text
NEW_TURN → COVERED → CLASSIFYING
                     ├── ALLOWED → REVEALED → DONE
                     ├── UNCERTAIN/ERROR/TIMEOUT → REVEALED → DONE
                     └── INTERVENING
                           ├── SKIP → REVEALED → DONE
                           └── CONTINUE → REVIEW_FOLLOWUP → SUBMIT_FOLLOWUP → DONE
```

Minimum safeguards:

- Associate each response cover with **one assistant turn**, not all assistant messages on the page.
- Use `turnId` and `requestId` to reject responses from obsolete conversations, retries, or duplicate events.
- Set a maximum classification deadline (initial target: **2 seconds**, configurable); timeout **reveals** the original response.
- If the response is already visible before the cover attaches, record a **coverage failure**; do not pretend it was hidden. Eliminating all flashes may prove impossible with a pure post-send DOM approach.
- When user navigates, closes a tab, or site markup changes, remove orphaned covers, close dialogs, and clean up listeners.
- Avoid classifying or re-intervening on tot's own follow-up messages. Mark the transaction and track the expected follow-up turn.
- Do not overwrite an existing unsent draft when preparing follow-up. Provide a recovery/copy path if the composer is occupied.
- Only claim successful submission after observing the corresponding turn in Claude, not merely after firing a click event.
- If Claude's response-to-follow-up cannot be distinguished reliably, prefer revealing content and informing the user over accidentally masking unrelated messages.

### Critical feasibility caveat

With post-send processing, **zero initial send delay** is achievable, but **zero visual delay or guaranteed no-answer leakage is not**. The extension can attach a cover on the send action without preventing submission, but browser event timing and Claude DOM changes can still expose early tokens. **This is the first experimental gate**. A pre-send hold or broader response-area pre-cover would be a later alternative if a fully reliable mask cannot be achieved.

## 9. Reliability, latency, and safety targets

Targets to test, **not promises**:

| Metric | Initial engineering goal |
|---|---|
| Extra waiting before Claude receives original prompt | **0 intentional wait** |
| Classification response latency | Track p50/p95; try for **p95 under 1 s** |
| Max visual masking before fail-open | **2 s** initially |
| First-token exposure before cover | **0 observed in regression cases** |
| Wrong response masked / stuck overlay | **0 in regression cases** |
| Follow-up duplicate submissions | **0 in regression cases** |
| False-positive intervention rate | Minimize on labeled dataset; inspect by prompt category |

No infinite spinner or permanent answer lock. A student must always be able to reveal the original answer.

Privacy rules:
- Ask user consent for sending submitted prompt text to the classifier; disclose the remote processing provider when appropriate.
- Request only host permissions needed for `claude.ai` plus the approved classifier endpoint.
- Do not request access to unrelated browser tabs or websites.
- Do not log raw prompts, file contents, or student responses to analytics by default.
- Do not expose API keys in the extension bundle.
- Treat content from user prompts as **untrusted data**; never let it override classifier system instructions.
- Sanitize user/LLM text rendered in the sidebar. Do not inject untrusted HTML into Claude's page.

## 10. Testing matrix

Use a hardcoded classification result to validate the browser behavior **before** adding real AI.

- [ ] Claude plain-text prompt; allow: original answer appears promptly.
- [ ] Claude plain-text prompt; intervene: new response is masked, sidebar opens.
- [ ] Continue: reasoned follow-up is previewed and sent **once** in the same conversation.
- [ ] Skip: original answer reveals, no extra message.
- [ ] Classification error, delay, timeout: answer automatically reveals.
- [ ] Student navigates or changes conversations during a pending request.
- [ ] Two Claude tabs do not share in-progress state.
- [ ] New response streaming while cover is active; no unintended masking of old content.
- [ ] Student uploads a file: detect metadata when exposed, do not parse, fail open if unclear.
- [ ] Student has an unsent draft during follow-up: do not clobber it.
- [ ] Classifier correctly allows a prompt with meaningful reasoning despite `do this for me` phrasing.
- [ ] Manual accessibility pass: keyboard navigation, focus, Skip and Reveal always accessible.

For classifier evaluation, assemble at least **50–100 labeled prompts** including ambiguous requests, wrong-but-genuine attempts, homework solution requests, feedback requests, ordinary productivity tasks, and unread-attachment cases.

## 11. Build order / stop conditions

1. **Feasibility spike:** on Claude, detect a submitted prompt; cover and reveal its associated streaming answer using a hardcoded rule. If response-to-turn association is unreliable, solve that before adding AI.
2. **Follow-up spike:** draft and submit a simple user-approved follow-up in the correct Claude conversation exactly once.
3. **Classifier:** implement and benchmark structured `allow/intervene/uncertain` plus one question on a labeled dataset.
4. **Sidebar:** connect the polished, isolated UI using mock objects and then the real classifier.
5. **Integration:** connect all pieces, measure masking delays and failure recovery, remove brittle behavior.
6. **Only then:** attachment metadata, polish, simple local statistics. No multi-site expansion during the hackathon.

### Definition of done

The live demo must show: (1) a prompt that already includes thinking passes through, (2) a no-attempt intellectual task triggers tot, the user contributes reasoning and Claude receives the follow-up, and (3) the system safely reveals content when the classifier fails. No lost drafts, unbounded overlays, or duplicate follow-ups.

**When making code changes:** Prefer small incremental changes, reuse shared types, keep Claude DOM logic in the adapter, and do not add new product features without validating the high-risk browser flow. See `DELEGATION.md` for file ownership and parallel work.
