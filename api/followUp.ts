// Prompt 2: judge the student's answer and, if it holds no thinking, ask one
// smaller follow-up. Rules: TOT_PROMPTS.md §6 and §7. Every failure path
// returns `pass`, so the student is never stuck in the sidebar.

import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { MAX_FOLLOW_UPS, type FollowUpRequest, type FollowUpResponse } from '../shared/contracts.ts';
import { DEFAULT_MODEL } from './classifier.ts';
import { attachmentsSection, contextSection, loadPrompt, neutralizeTags, studentMessageSection } from './promptText.ts';

export const DEFAULT_FOLLOW_UP_TIMEOUT_MS = 3800; // inside the extension's 4 s budget

const DEFAULT_PROMPT_PATH = fileURLToPath(new URL('./prompts/followup.system.md', import.meta.url));
const MAX_QUESTION_CHARS = 300;

// What the model is constrained to emit (TOT_PROMPTS.md §6 output schema).
export const FollowUpOutputSchema = z.object({
  decision: z.enum(['pass', 'follow_up']),
  question: z.string(),
});

export function loadFollowUpPrompt(path = process.env.TOT_FOLLOW_UP_PROMPT_PATH || DEFAULT_PROMPT_PATH): string {
  return loadPrompt(path);
}

/**
 * The model sees the original message and every question/answer so far, so it
 * builds on what the student said and never repeats an earlier question.
 */
export function buildFollowUpTurn(req: FollowUpRequest): string {
  const qa = req.qaHistory
    .map((p) => `[tot] ${neutralizeTags(p.question.trim())} [student] ${neutralizeTags(p.answer.trim())}`)
    .join(' ');
  return [
    `<mode>${req.mode}</mode>`,
    contextSection(req.conversationContext),
    attachmentsSection(req.attachments),
    studentMessageSection(req.prompt),
    `<qa_history>\n${qa}\n</qa_history>`,
    `<follow_ups_used>${req.followUpsUsed}</follow_ups_used>`,
  ]
    .filter((s) => s !== null)
    .join('\n');
}

function pass(requestId: string, reason: string): FollowUpResponse {
  return { requestId, decision: 'pass', reason, question: null };
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// TOT_PROMPTS.md §6 post-processing. Never trust the model for these rules.
export function postProcessFollowUp(req: FollowUpRequest, raw: unknown): FollowUpResponse {
  const parsed = FollowUpOutputSchema.safeParse(raw);
  if (!parsed.success) return pass(req.requestId, 'invalid_output');
  if (parsed.data.decision === 'pass') return pass(req.requestId, 'model');

  const question = parsed.data.question.trim();
  if (!question || question.length > MAX_QUESTION_CHARS) return pass(req.requestId, 'bad_question');
  if (req.qaHistory.some((p) => sameText(p.question, question))) return pass(req.requestId, 'repeated_question');
  return { requestId: req.requestId, decision: 'follow_up', reason: 'model', question };
}

export type FollowUpConfig = {
  client: Anthropic;
  systemPrompt: string;
  model?: string;
  timeoutMs?: number;
};

export type FollowUpOutcome = {
  res: FollowUpResponse;
  latencyMs: number;
  cacheReadTokens?: number;
};

export async function judgeAnswer(req: FollowUpRequest, cfg: FollowUpConfig): Promise<FollowUpOutcome> {
  const started = Date.now();
  const done = (res: FollowUpResponse, cacheReadTokens?: number): FollowUpOutcome => ({
    res,
    latencyMs: Date.now() - started,
    cacheReadTokens,
  });

  // Follow-up cap: pass without calling the model.
  if (req.followUpsUsed >= MAX_FOLLOW_UPS) return done(pass(req.requestId, 'cap_reached'));

  try {
    const message = await cfg.client.messages.parse(
      {
        model: cfg.model ?? DEFAULT_MODEL,
        max_tokens: 256,
        thinking: { type: 'between_tools' },
        output_config: { effort: 'low', format: zodOutputFormat(FollowUpOutputSchema) },
        system: [{ type: 'text', text: cfg.systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildFollowUpTurn(req) }],
      },
      { timeout: cfg.timeoutMs ?? DEFAULT_FOLLOW_UP_TIMEOUT_MS, maxRetries: 0 },
    );

    const cacheRead = message.usage.cache_read_input_tokens ?? undefined;
    if (message.stop_reason === 'refusal') return done(pass(req.requestId, 'refusal'), cacheRead);
    if (message.stop_reason === 'max_tokens') return done(pass(req.requestId, 'max_tokens'), cacheRead);
    return done(postProcessFollowUp(req, message.parsed_output), cacheRead);
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionTimeoutError) return done(pass(req.requestId, 'timeout'));
    if (error instanceof Anthropic.APIError) return done(pass(req.requestId, `api_error_${error.status ?? 'unknown'}`));
    return done(pass(req.requestId, 'error'));
  }
}
