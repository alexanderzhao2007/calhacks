// Prompt 3: turn the original request and the tot Q&A into a message, in the
// student's voice, that asks the AI to redo its answer around their thinking.
// May decide nothing is worth sending. Every failure returns `fallback`, so the
// extension uses its deterministic template.

import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { ComposeRequest, ComposeResponse } from '../shared/contracts.ts';
import { DEFAULT_MODEL } from './classifier.ts';
import { attachmentsSection, contextSection, loadPrompt, neutralizeTags, studentMessageSection } from './promptText.ts';

export const DEFAULT_COMPOSE_TIMEOUT_MS = 4800; // inside the extension's 5 s budget

const DEFAULT_PROMPT_PATH = fileURLToPath(new URL('./prompts/compose.system.md', import.meta.url));
const MAX_MESSAGE_CHARS = 1200;

export const ComposeOutputSchema = z.object({
  decision: z.enum(['paste', 'skip']),
  message: z.string(),
});

export function loadComposePrompt(path = process.env.TOT_COMPOSE_PROMPT_PATH || DEFAULT_PROMPT_PATH): string {
  return loadPrompt(path);
}

export function buildComposeTurn(req: ComposeRequest): string {
  const qa = req.qaHistory
    .map((p) => `[tot] ${neutralizeTags(p.question.trim())} [student] ${neutralizeTags(p.answer.trim())}`)
    .join(' ');
  return [
    `<mode>${req.mode}</mode>`,
    contextSection(req.conversationContext),
    attachmentsSection(req.attachments),
    studentMessageSection(req.prompt),
    `<qa_history>\n${qa}\n</qa_history>`,
  ]
    .filter((s) => s !== null)
    .join('\n');
}

function fallback(requestId: string, reason: string): ComposeResponse {
  return { requestId, decision: 'fallback', reason, message: null };
}

export function postProcessCompose(requestId: string, raw: unknown): ComposeResponse {
  const parsed = ComposeOutputSchema.safeParse(raw);
  if (!parsed.success) return fallback(requestId, 'invalid_output');
  if (parsed.data.decision === 'skip') return { requestId, decision: 'skip', reason: 'model', message: null };

  const message = parsed.data.message.trim();
  if (!message || message.length > MAX_MESSAGE_CHARS) return fallback(requestId, 'bad_message');
  return { requestId, decision: 'paste', reason: 'model', message };
}

export type ComposeConfig = {
  client: Anthropic;
  systemPrompt: string;
  model?: string;
  timeoutMs?: number;
};

export type ComposeOutcome = {
  res: ComposeResponse;
  latencyMs: number;
  cacheReadTokens?: number;
};

export async function composeFollowUp(req: ComposeRequest, cfg: ComposeConfig): Promise<ComposeOutcome> {
  const started = Date.now();
  const done = (res: ComposeResponse, cacheReadTokens?: number): ComposeOutcome => ({
    res,
    latencyMs: Date.now() - started,
    cacheReadTokens,
  });

  try {
    const message = await cfg.client.messages.parse(
      {
        model: cfg.model ?? DEFAULT_MODEL,
        max_tokens: 600,
        thinking: { type: 'between_tools' },
        output_config: { effort: 'low', format: zodOutputFormat(ComposeOutputSchema) },
        system: [{ type: 'text', text: cfg.systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildComposeTurn(req) }],
      },
      { timeout: cfg.timeoutMs ?? DEFAULT_COMPOSE_TIMEOUT_MS, maxRetries: 0 },
    );

    const cacheRead = message.usage.cache_read_input_tokens ?? undefined;
    if (message.stop_reason === 'refusal') return done(fallback(req.requestId, 'refusal'), cacheRead);
    if (message.stop_reason === 'max_tokens') return done(fallback(req.requestId, 'max_tokens'), cacheRead);
    return done(postProcessCompose(req.requestId, message.parsed_output), cacheRead);
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionTimeoutError) return done(fallback(req.requestId, 'timeout'));
    if (error instanceof Anthropic.APIError) return done(fallback(req.requestId, `api_error_${error.status ?? 'unknown'}`));
    return done(fallback(req.requestId, 'error'));
  }
}
