// Classification + question generation: one model call per submitted turn.
// Prompt and post-processing rules: TOT_PROMPTS.md §5 and §7. Every failure
// path returns `uncertain`, which the extension treats as "reveal".

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { ClassifyRequest, ClassifyResponse, Mode } from '../shared/contracts.ts';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const DEFAULT_TIMEOUT_MS = 9800; // inside the extension's 10 s cover budget

const DEFAULT_PROMPT_PATH = fileURLToPath(new URL('./prompts/classify.system.md', import.meta.url));

export const FALLBACK_QUESTIONS = {
  solve: 'Before the answer: what would you try first, and why?',
  brainstorm: "Before seeing ideas: what's one direction you're already considering, even a rough one?",
} as const;

const MAX_QUESTION_CHARS = 300;
const MAX_CONTEXT_TURNS = 4;
const MAX_CONTEXT_CHARS = 400;

// What the model is constrained to emit (TOT_PROMPTS.md §5 output schema).
export const ModelOutputSchema = z.object({
  decision: z.enum(['intervene', 'allow', 'uncertain']),
  mode: z.enum(['solve', 'brainstorm', 'none']),
  question: z.string(),
});
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

export function loadSystemPrompt(path = process.env.TOT_CLASSIFY_PROMPT_PATH || DEFAULT_PROMPT_PATH): string {
  const text = readFileSync(path, 'utf8').trim();
  if (!text) throw new Error(`System prompt at ${path} is empty`);
  return text;
}

// Student text goes inside our XML-like tags. Neutralize any of our tag names
// so a message cannot close its section early or fake a new one.
const OUR_TAGS = /<(\/?)(conversation_context|attachments|student_message)\b/gi;
export function neutralizeTags(text: string): string {
  return text.replace(OUR_TAGS, (_m, slash: string, name: string) => `<\\${slash}${name}`);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function buildUserTurn(req: ClassifyRequest): string {
  const parts: string[] = [];

  const context = (req.conversationContext ?? []).slice(-MAX_CONTEXT_TURNS);
  if (context.length > 0) {
    const lines = context.map((t) => `[${t.role}] ${neutralizeTags(truncate(t.text.trim(), MAX_CONTEXT_CHARS))}`);
    parts.push(`<conversation_context>\n${lines.join('\n')}\n</conversation_context>`);
  }

  if (req.attachments.length > 0) {
    const meta = req.attachments.map((a) => ({ name: a.name ?? '', type: a.mimeType ?? '' }));
    parts.push(`<attachments>\n${neutralizeTags(JSON.stringify(meta))}\n</attachments>`);
  }

  parts.push(`<student_message>\n${neutralizeTags(req.prompt)}\n</student_message>`);
  return parts.join('\n');
}

function failOpen(requestId: string, reason: string): ClassifyResponse {
  return { requestId, decision: 'uncertain', reason, question: null, mode: 'none' };
}

// TOT_PROMPTS.md §5 post-processing. Never trust the model for these rules.
export function postProcess(requestId: string, raw: unknown): ClassifyResponse {
  const parsed = ModelOutputSchema.safeParse(raw);
  if (!parsed.success) return failOpen(requestId, 'invalid_output');
  const out = parsed.data;

  if (out.decision !== 'intervene') {
    return { requestId, decision: out.decision, reason: 'model', question: null, mode: 'none' };
  }

  const mode: Exclude<Mode, 'none'> = out.mode === 'none' ? 'solve' : out.mode;
  const question = out.question.trim();
  if (question.length === 0 || question.length > MAX_QUESTION_CHARS) {
    return { requestId, decision: 'intervene', reason: 'fallback_question', question: FALLBACK_QUESTIONS[mode], mode };
  }
  return { requestId, decision: 'intervene', reason: 'model', question, mode };
}

export type ClassifierConfig = {
  client: Anthropic;
  systemPrompt: string;
  model?: string;
  timeoutMs?: number;
};

export type ClassifyOutcome = {
  res: ClassifyResponse;
  latencyMs: number;
  cacheReadTokens?: number;
};

export async function classify(req: ClassifyRequest, cfg: ClassifierConfig): Promise<ClassifyOutcome> {
  const started = Date.now();
  const done = (res: ClassifyResponse, cacheReadTokens?: number): ClassifyOutcome => ({
    res,
    latencyMs: Date.now() - started,
    cacheReadTokens,
  });

  try {
    const message = await cfg.client.messages.parse(
      {
        model: cfg.model ?? DEFAULT_MODEL,
        max_tokens: 256,
        // Lowest-latency setting on Sonnet 5.5: no extended thinking.
        thinking: { type: 'between_tools' },
        output_config: { effort: 'low', format: zodOutputFormat(ModelOutputSchema) },
        system: [{ type: 'text', text: cfg.systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildUserTurn(req) }],
      },
      // One attempt only: a retry cannot fit inside the cover budget.
      { timeout: cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS, maxRetries: 0 },
    );

    const cacheRead = message.usage.cache_read_input_tokens ?? undefined;
    if (message.stop_reason === 'refusal') return done(failOpen(req.requestId, 'refusal'), cacheRead);
    if (message.stop_reason === 'max_tokens') return done(failOpen(req.requestId, 'max_tokens'), cacheRead);
    return done(postProcess(req.requestId, message.parsed_output), cacheRead);
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionTimeoutError) return done(failOpen(req.requestId, 'timeout'));
    if (error instanceof Anthropic.APIError) return done(failOpen(req.requestId, `api_error_${error.status ?? 'unknown'}`));
    return done(failOpen(req.requestId, 'error'));
  }
}
