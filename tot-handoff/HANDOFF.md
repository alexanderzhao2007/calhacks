# tot — design handoff

**Get taught, not told.** tot is a Chrome extension for Claude. When a student's prompt looks like it's outsourcing their thinking, tot covers the answer, asks one question first, and adds the student's reasoning to the chat.

This file is the single source of truth for building the UX. Everything in it was decided in the design sessions on Oct 24; open items are listed at the end.

| What | Where |
|---|---|
| Wireframes (light + dark flow, brand boards) | "tot wireframes" canvas on claude.ai — ask Kira to share it |
| Brand brief (voice, identity, rationale) | "tot Brand Brief" doc on claude.ai — ask Kira to share it |
| Tokens, icon, reference code | this folder |

## Who should read what

| Person | Owns | Read first |
|---|---|---|
| Julia | Extension, Claude DOM, covering the answer, pasting into the composer | §2 Flow, §3 Behavior rules, §7 Follow-up text |
| Alex | Classifier + question API | §2 Flow (rounds), §8 What the API needs |
| Kira | Popup UI | §4 Visual spec, `reference/popup.html`, `design/tokens.css` |
| Ivan | Integration, tests, demo | §2 Flow, §3 Behavior rules, §9 Test checklist |

## 1. Folder contents

```
HANDOFF.md                 this file
design/tokens.css          CSS variables, light + dark (auto via prefers-color-scheme)
design/tokens.json         same values as JSON
content/copy.json          every UI string
prompts/followup.md        the text pasted into Claude's message box
assets/icon.svg            extension icon (128 grid)
assets/icon-16.svg         simplified icon for 16 px
assets/icon-16|32|48|128.png  Chrome manifest icons
reference/popup.html       working reference of every popup state, light/dark
reference/landing.html     landing page with the "room flickers on" intro
```

Open the two `reference/*.html` files directly in Chrome. They are plain HTML/CSS/JS, meant to be copied into React components, not shipped as-is.

## 2. Flow

```
student sends prompt
  └─ answer is covered instantly (invisibly: no spinner, no text) and the classifier runs
       ├─ allow / uncertain / error / timeout → uncover; tot shows nothing, ever
       └─ intervene → QUESTION popup
             ├─ Submit (button or Enter) → JUDGING (trace animation)
             │     ├─ enough effort, or ~30 s since the popup opened → DONE
             │     └─ not enough effort → FOLLOW-UP popup → Submit → JUDGING …
             └─ Skip → SKIP CONFIRM "See the response now?"
                   ├─ Keep thinking → back to the question (answer text kept)
                   └─ Show answer → close popup, uncover answer, paste nothing
DONE → close popup, uncover the answer, then paste the follow-up text into
       Claude's message box. Never send it; the student presses Send.
```

| State | On screen | Frame on canvas |
|---|---|---|
| Classifying | Claude's page; the new answer is hidden with nothing in its place | 1 |
| Question | Page dimmed + blurred, centered popup | 2 |
| Skip confirm | Small dialog over the same backdrop | 3 |
| Judging | Popup locked, a short line traces its edge | 4 |
| Follow-up | New question; earlier Q + answer scroll up above it | 5 |
| Done | Answer visible, follow-up text in the composer, not sent | 6, 6b |

Every frame exists in light and dark.

## 3. Behavior rules

- **Never block Send.** Classification starts after the message is sent.
- **Fail silent.** Any error or timeout = behave as "allow". No error UI.
- **Cover invisibly.** While classifying, hide the new answer without any visible cover or spinner. It should look like Claude hasn't started yet.
- **Keyboard:** Enter submits, Shift+Enter adds a new line. Focus goes to the text field when the popup opens.
- **Skip is quiet:** small muted text, bottom-left. It always asks "See the response now?" first, and **Keep thinking** is the highlighted (primary, right-hand) button so the default nudges students to stay; Show answer is secondary.
- **Rounds:** after each answer the API judges effort and may ask one more question. No new question is asked once ~30 s have passed since the popup opened; the current answer is the last.
- **Paste, don't send.** The follow-up goes into Claude's message box silently (no toast). If the box already has text, insert tot's text **above** the student's draft. Verify it landed; if not, fail silently.
- **Answer is revealed before pasting.**
- **Theme:** the popup matches light/dark. See open question 1.
- **Reduced motion:** with the OS setting on, no trace loop and no intro animation; show the end state.
- **Cooldown:** limit interventions per conversation and/or per time window. Numbers not decided (open question 2).

## 4. Visual spec

Tokens are in `design/tokens.css`. Popup measurements:

| Element | Spec |
|---|---|
| Backdrop | Claude's page `filter: blur(6px)` + overlay `--tot-backdrop` |
| Popup | 540 px wide, 32 px padding, 20 px gap, radius 16, `--tot-surface`; 1 px `--tot-border` in dark only |
| Question row | 32 px icon, 14 px gap, question text top-aligned beside it |
| Question text | Quicksand Medium 22/1.35, `--tot-text` |
| Answer field | 120 px tall, radius 10, 12 px padding, Figtree 15, placeholder "Type your thinking", no visible label (`aria-label="Your thinking"`) |
| Actions row | Skip left; "or press Enter" hint + Submit right |
| Submit | pill, min-height 44, radius 22, 0 24 px padding, Figtree SemiBold 15 |
| Skip | text button, Figtree 13, `--tot-text-muted`, 44 px tall hit area |
| Skip confirm | 400 px wide, 28 px padding, Quicksand Medium 20 title, two pills right-aligned: Show answer (secondary, outline) then Keep thinking (primary, filled). Initial focus on Keep thinking. |
| Follow-up history | scroll area, max 180 px tall, opens scrolled to the newest question; earlier Q + answer in `--tot-text-muted` |

**Type:** Quicksand = brand (Bold 700 wordmark only, Regular 400 big headlines, Medium 500 popup questions). Figtree = everything students read and click (400 body/field, 600 buttons). Both on Google Fonts.

**Color:** Gold `#F2B300` appears only in the bulb icon in light mode; in dark mode Submit turns Gold with Night text. Charcoal Blue `#2F4858` is text, buttons and the icon tile. All text pairs pass WCAG AA.

**Icon:** Charcoal tile, Gold bulb, two white base bars. Use `icon-16.svg` (one bar) at 16 px. In dark UIs the tile gets a faint `#48616F` edge.

## 5. Motion

| Animation | Spec |
|---|---|
| Judging trace | SVG `rect` on the popup's outline, `pathLength=100`, `stroke-dasharray: 12 88`, dash offset 0 → -100, 2.8 s linear, infinite. Stroke 2 px, `--tot-trace`. |
| Landing intro | 6.4 s, plays once with a Replay control. Dark screen → big "t t" → gray ball bounces in from the left, settles between the t's → letters shrink into the header "tot" while the ball flies into the icon and becomes the bulb → bulb flickers and lights Gold → whole page flickers from dark to light. Full code in `reference/landing.html`. |

## 6. Copy

All strings are in `content/copy.json`. Key ones: placeholder "Type your thinking"; buttons "Skip", "Submit", hint "or press Enter"; skip confirm "See the response now?" with "Keep thinking" (primary) / "Show answer"; slogan "Get taught, not told."

## 7. Follow-up text (pasted into Claude)

See `prompts/followup.md`. With one answer:

> My initial approach is: {answer}. Please assess whether this reasoning is on track, point out any misconception, and guide the next step without immediately restating the whole solution.

With several rounds, all answers are included in order (format in the file).

## 8. What the API needs (Alex)

The popup needs two kinds of call. The shapes below are a suggestion to agree on with Julia and Kira, not a decision.

1. **Classify** (existing): prompt → `allow | intervene | uncertain` + first question.
2. **Judge an answer** (new, for the follow-up rounds): original prompt + questions and answers so far → `enough` or `ask_again` + next question.

Latency budget: each judge call happens while the student watches the trace, so aim for about 1–2 s. If it fails or times out, treat it as `enough` and finish.

## 9. Test checklist (Ivan)

- [ ] Allow path: nothing from tot is ever visible
- [ ] Classifier error and timeout behave like allow
- [ ] No answer text flashes before the cover applies
- [ ] Enter submits; Shift+Enter adds a line
- [ ] Skip → Keep thinking keeps the typed answer
- [ ] Skip → Show answer pastes nothing
- [ ] Follow-up round appears only when the API says `ask_again` and the 30 s cap hasn't passed
- [ ] Follow-up text lands in the message box once, is not sent, and sits above an existing draft
- [ ] Light and dark both match the frames
- [ ] Reduced motion: no looping trace, no intro animation

## 10. Open questions

1. **Theme source (Julia):** follow the computer's light/dark setting, or Claude's own theme? They can differ; Claude's is the closer match.
2. **Cooldown numbers (team):** max interventions per conversation and/or per time window, and whether a skip counts.
3. **Follow-up wording:** the answer is revealed before pasting, so "without immediately restating the whole solution" may need rewording.
4. **Esc key:** close the popup (= Skip) or do nothing?
5. **Remote-analysis consent:** where the one-time opt-in screen lives and who builds it.
