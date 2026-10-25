// Pure follow-up formatting (tot-handoff prompts/followup.md). Uses the
// student's exact words; a trailing period is stripped so sentences don't end "..".

import type { QAPair } from '@shared/contracts';

const CLOSING =
  'Please assess whether this reasoning is on track, point out any misconception, and guide the next step without immediately restating the whole solution.';

const clean = (s: string) => s.trim().replace(/\.+$/, '');

export function formatFollowUp(qaHistory: QAPair[]): string {
  const [first, ...rest] = qaHistory.filter((p) => p.answer.trim().length > 0);
  if (!first) return '';
  const parts = [`My initial approach is: ${clean(first.answer)}.`];
  for (const p of rest) parts.push(`When asked "${p.question.trim()}", I added: ${clean(p.answer)}.`);
  parts.push(CLOSING);
  return parts.join(' ');
}
