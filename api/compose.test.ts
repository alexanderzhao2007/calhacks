import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { ComposeResponseSchema, type ComposeRequest } from '../shared/contracts.ts';
import { buildComposeTurn, composeFollowUp, loadComposePrompt, postProcessCompose } from './compose.ts';

const req = (over: Partial<ComposeRequest> = {}): ComposeRequest => ({
  requestId: 'r1',
  mode: 'brainstorm',
  prompt: 'give me startup ideas',
  attachments: [],
  qaHistory: [{ question: "What's a problem you've run into?", answer: "i don't know to edit clips" }],
  ...over,
});

describe('buildComposeTurn', () => {
  it('includes mode, original message, and the Q&A history', () => {
    expect(buildComposeTurn(req())).toBe(
      [
        '<mode>brainstorm</mode>',
        '<student_message>\ngive me startup ideas\n</student_message>',
        "<qa_history>\n[tot] What's a problem you've run into? [student] i don't know to edit clips\n</qa_history>",
      ].join('\n'),
    );
  });
});

describe('postProcessCompose', () => {
  const valid = (r: ReturnType<typeof postProcessCompose>) =>
    expect(ComposeResponseSchema.safeParse(r).success).toBe(true);

  it('passes a message through and maps skip to a null message', () => {
    const r = postProcessCompose('r1', { decision: 'paste', message: ' Redo the ideas around editing clips. ' });
    expect(r).toMatchObject({ decision: 'paste', message: 'Redo the ideas around editing clips.' });
    valid(r);
    const s = postProcessCompose('r1', { decision: 'skip', message: 'leak' });
    expect(s).toMatchObject({ decision: 'skip', message: null });
    valid(s);
  });

  it('falls back on invalid output, empty, or overlong messages', () => {
    expect(postProcessCompose('r1', null).decision).toBe('fallback');
    expect(postProcessCompose('r1', { decision: 'paste', message: '  ' }).reason).toBe('bad_message');
    const r = postProcessCompose('r1', { decision: 'paste', message: 'x'.repeat(1201) });
    expect(r).toMatchObject({ decision: 'fallback', message: null });
    valid(r);
  });
});

describe('composeFollowUp', () => {
  const stub = (parse: () => Promise<unknown>) => ({ messages: { parse } }) as unknown as Anthropic;

  it('falls back on timeout', async () => {
    const client = stub(async () => {
      throw new Anthropic.APIConnectionTimeoutError();
    });
    expect((await composeFollowUp(req(), { client, systemPrompt: 'sys' })).res).toMatchObject({
      decision: 'fallback',
      reason: 'timeout',
    });
  });
});

describe('loadComposePrompt', () => {
  it('loads the bundled prompt', () => {
    expect(loadComposePrompt()).toContain('You are the writer for tot');
  });
});
