# Follow-up text pasted into Claude's message box

Pasted silently after the answer is revealed. Never sent automatically. If the message box already has text, insert this above the student's draft, followed by a blank line.

## One round

```
My initial approach is: {answer_1}. Please assess whether this reasoning is on track, point out any misconception, and guide the next step without immediately restating the whole solution.
```

## Several rounds

```
My initial approach is: {answer_1}. When asked "{question_2}", I added: {answer_2}. Please assess whether this reasoning is on track, point out any misconception, and guide the next step without immediately restating the whole solution.
```

Repeat the `When asked "…", I added: …` sentence for each extra round, in order.

## Rules

- Use the student's words exactly; trim whitespace, don't correct spelling.
- Strip a trailing period from an answer before inserting it, so the sentence doesn't end with "..".
- If the student skipped, paste nothing.

Open question: the answer is already visible when this is pasted, so the last clause may need rewording (see HANDOFF.md §10).
