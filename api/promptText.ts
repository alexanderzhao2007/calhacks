// Shared helpers for building the tagged user turns sent to both prompts.

import { readFileSync } from 'node:fs';
import type { AttachmentMeta, ContextTurn } from '../shared/contracts.ts';

const MAX_CONTEXT_TURNS = 4;
const MAX_CONTEXT_CHARS = 400;

export function loadPrompt(path: string): string {
  const text = readFileSync(path, 'utf8').trim();
  if (!text) throw new Error(`System prompt at ${path} is empty`);
  return text;
}

// Student text goes inside our XML-like tags. Neutralize any of our tag names
// so a message cannot close its section early or fake a new one.
const OUR_TAGS = /<(\/?)(conversation_context|attachments|student_message|qa_history|mode|follow_ups_used)\b/gi;
export function neutralizeTags(text: string): string {
  return text.replace(OUR_TAGS, (_m, slash: string, name: string) => `<\\${slash}${name}`);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** `<conversation_context>` section, or null when there is no context. */
export function contextSection(context: ContextTurn[] | undefined): string | null {
  const recent = (context ?? []).slice(-MAX_CONTEXT_TURNS);
  if (recent.length === 0) return null;
  const lines = recent.map((t) => `[${t.role}] ${neutralizeTags(truncate(t.text.trim(), MAX_CONTEXT_CHARS))}`);
  return `<conversation_context>\n${lines.join('\n')}\n</conversation_context>`;
}

/** `<attachments>` section (metadata only), or null when there are none. */
export function attachmentsSection(attachments: AttachmentMeta[]): string | null {
  if (attachments.length === 0) return null;
  const meta = attachments.map((a) => ({ name: a.name ?? '', type: a.mimeType ?? '' }));
  return `<attachments>\n${neutralizeTags(JSON.stringify(meta))}\n</attachments>`;
}

export function studentMessageSection(prompt: string): string {
  return `<student_message>\n${neutralizeTags(prompt)}\n</student_message>`;
}
