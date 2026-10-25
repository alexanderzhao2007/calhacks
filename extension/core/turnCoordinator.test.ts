import { describe, expect, it } from 'vitest';
import { NEW_CHAT, TurnCoordinator, chatIdFromPath } from './turnCoordinator';

const intervene = (requestId: string) => ({
  ok: true as const,
  res: { requestId, decision: 'intervene', reason: 'r', question: 'What would you try first?' },
});
const allow = (requestId: string) => ({
  ok: true as const,
  res: { requestId, decision: 'allow', reason: 'r', question: null },
});

const followUp = (requestId: string, question: string) => ({
  ok: true as const,
  res: { requestId, decision: 'follow_up', reason: 'r', question },
});
const pass = (requestId: string) => ({
  ok: true as const,
  res: { requestId, decision: 'pass', reason: 'r', question: null },
});

function setup(chat = 'abc') {
  const c = new TurnCoordinator(chat);
  c.startTurn({ turnId: 't1', prompt: 'Solve this for me', now: 0 });
  return c;
}

describe('chatIdFromPath', () => {
  it('parses chat ids and treats everything else as a new chat', () => {
    expect(chatIdFromPath('/chat/1234-abcd')).toBe('1234-abcd');
    expect(chatIdFromPath('/new')).toBe(NEW_CHAT);
    expect(chatIdFromPath('/')).toBe(NEW_CHAT);
  });
});

describe('classification', () => {
  it('reveals on allow', () => {
    const c = setup();
    expect(c.onClassifyResult('t1', allow('t1'))).toEqual([
      { type: 'reveal', turnId: 't1', reason: 'allow' },
    ]);
    expect(c.hasPendingClassification()).toBe(false);
  });

  it('cancels the deadline and opens the sidebar on intervene', () => {
    const c = setup();
    const fx = c.onClassifyResult('t1', intervene('t1'));
    expect(fx.map((e) => e.type)).toEqual(['cancelDeadline', 'openSidebar']);
    expect(c.getTurn('t1')?.phase).toBe('INTERVENING');
  });

  it('fails open on error, invalid schema, and mismatched requestId', () => {
    let c = setup();
    expect(c.onClassifyResult('t1', { ok: false, error: 'boom' })[0]).toMatchObject({ reason: 'error' });
    c = setup();
    expect(
      c.onClassifyResult('t1', { ok: true, res: { requestId: 't1', decision: 'intervene', reason: '', question: null } })[0],
    ).toMatchObject({ type: 'reveal', reason: 'invalid' });
    c = setup();
    expect(c.onClassifyResult('t1', allow('other'))[0]).toMatchObject({ reason: 'invalid' });
  });

  it('ignores results for unknown turns and late results after timeout', () => {
    const c = setup();
    expect(c.onClassifyResult('ghost', allow('ghost'))).toEqual([]);
    expect(c.onDeadline('t1')).toEqual([{ type: 'reveal', turnId: 't1', reason: 'timeout' }]);
    expect(c.onClassifyResult('t1', intervene('t1'))).toEqual([]);
  });

  it('deadline does nothing once intervening', () => {
    const c = setup();
    c.onClassifyResult('t1', intervene('t1'));
    expect(c.onDeadline('t1')).toEqual([]);
  });
});

describe('sidebar outcomes', () => {
  it('skip closes the sidebar and reveals', () => {
    const c = setup();
    c.onClassifyResult('t1', intervene('t1'));
    expect(c.onSidebarResult({ action: 'skip', turnId: 't1' })).toEqual([
      { type: 'closeSidebar', turnId: 't1' },
      { type: 'reveal', turnId: 't1', reason: 'skip' },
    ]);
  });

  it('an answer is sent for judging with the original prompt and Q&A history', () => {
    const c = setup();
    c.onClassifyResult('t1', intervene('t1'));
    const fx = c.onSidebarResult({ action: 'answer', turnId: 't1', answer: ' idk ' });
    expect(fx).toEqual([
      {
        type: 'judgeAnswer',
        turnId: 't1',
        request: {
          requestId: 't1',
          mode: 'solve',
          prompt: 'Solve this for me',
          attachments: [],
          qaHistory: [{ question: 'What would you try first?', answer: 'idk' }],
          followUpsUsed: 0,
        },
      },
    ]);
    expect(c.getTurn('t1')?.phase).toBe('JUDGING');
    expect(c.onSidebarResult({ action: 'answer', turnId: 't1', answer: 'again' })).toEqual([]); // no double submit
  });

  it('follow_up shows the next question; pass hands off with every Q&A pair', () => {
    const c = setup();
    c.onClassifyResult('t1', intervene('t1'));
    c.onSidebarResult({ action: 'answer', turnId: 't1', answer: 'idk' });
    expect(c.onFollowUpResult('t1', followUp('t1', 'What is one piece?'))).toEqual([
      {
        type: 'openSidebar',
        request: {
          turnId: 't1',
          question: 'What is one piece?',
          originalPrompt: 'Solve this for me',
          history: [{ question: 'What would you try first?', answer: 'idk' }],
        },
      },
    ]);
    expect(c.getTurn('t1')?.followUpsUsed).toBe(1);

    const judge = c.onSidebarResult({ action: 'answer', turnId: 't1', answer: 'the x^2 part' });
    expect(judge[0]).toMatchObject({ type: 'judgeAnswer', request: { followUpsUsed: 1 } });
    const fx = c.onFollowUpResult('t1', pass('t1'));
    expect(fx.map((e) => e.type)).toEqual(['closeSidebar', 'reveal', 'submitFollowUp']);
    expect(fx[2]).toMatchObject({
      qaHistory: [
        { question: 'What would you try first?', answer: 'idk' },
        { question: 'What is one piece?', answer: 'the x^2 part' },
      ],
    });
  });

  it('hands off on judge failure, and skips the judge once the cap is reached', () => {
    let c = setup();
    c.onClassifyResult('t1', intervene('t1'));
    c.onSidebarResult({ action: 'answer', turnId: 't1', answer: 'idk' });
    expect(c.onFollowUpResult('t1', { ok: false, error: 'timeout' }).map((e) => e.type)).toEqual([
      'closeSidebar',
      'reveal',
      'submitFollowUp',
    ]);

    c = setup();
    c.onClassifyResult('t1', intervene('t1'));
    for (const q of ['q2', 'q3']) {
      c.onSidebarResult({ action: 'answer', turnId: 't1', answer: 'idk' });
      c.onFollowUpResult('t1', followUp('t1', q));
    }
    expect(c.getTurn('t1')?.followUpsUsed).toBe(2);
    const fx = c.onSidebarResult({ action: 'answer', turnId: 't1', answer: 'idk' });
    expect(fx.map((e) => e.type)).toEqual(['closeSidebar', 'reveal', 'submitFollowUp']); // no judgeAnswer
  });

  it('asks no new question once 30 s have passed since the popup opened', () => {
    let c = setup();
    c.onClassifyResult('t1', intervene('t1'), 1_000);
    const fx = c.onSidebarResult({ action: 'answer', turnId: 't1', answer: 'idk' }, 31_000);
    expect(fx.map((e) => e.type)).toEqual(['closeSidebar', 'reveal', 'submitFollowUp']);

    c = setup();
    c.onClassifyResult('t1', intervene('t1'), 1_000);
    c.onSidebarResult({ action: 'answer', turnId: 't1', answer: 'idk' }, 29_000);
    const late = c.onFollowUpResult('t1', followUp('t1', 'q2'), 31_500); // judge finished past the window
    expect(late.map((e) => e.type)).toEqual(['closeSidebar', 'reveal', 'submitFollowUp']);
  });

  it('skip while judging closes, reveals, and ignores the late judgment', () => {
    const c = setup();
    c.onClassifyResult('t1', intervene('t1'));
    c.onSidebarResult({ action: 'answer', turnId: 't1', answer: 'idk' });
    expect(c.onSidebarResult({ action: 'skip', turnId: 't1' })).toEqual([
      { type: 'closeSidebar', turnId: 't1' },
      { type: 'reveal', turnId: 't1', reason: 'skip' },
    ]);
    expect(c.onFollowUpResult('t1', followUp('t1', 'late?'))).toEqual([]);
  });

  it('the follow-up is placed once and is not classified', () => {
    const c = setup();
    c.onClassifyResult('t1', intervene('t1'));
    c.onSidebarResult({ action: 'answer', turnId: 't1', answer: 'base cases' });
    c.onFollowUpResult('t1', pass('t1'));

    const text = 'My initial approach:\n  "base cases"';
    expect(c.markFollowUpPending('t1', text)).toBe(true);
    expect(c.markFollowUpPending('t1', text)).toBe(false); // no double placement
    expect(c.startTurn({ turnId: 't2', prompt: text, now: 1 })).toBeNull();

    expect(c.onUserMessageObserved('unrelated message')).toBeNull();
    // Claude's rendered user message: sr-only prefix, paragraphs joined without newlines.
    expect(c.onUserMessageObserved('You said: My initial approach:"base cases"')).toBe('t1');
    expect(c.getTurn('t1')?.phase).toBe('FOLLOWUP_SENT');
  });

  it('treats an edited follow-up as ours, once', () => {
    const c = setup();
    c.onClassifyResult('t1', intervene('t1'));
    c.onSidebarResult({ action: 'answer', turnId: 't1', answer: 'base cases' });
    c.onFollowUpResult('t1', pass('t1'));
    c.markFollowUpPending('t1', 'original follow-up text');
    expect(c.startTurn({ turnId: 't2', prompt: 'edited follow-up text', now: 1 })).toBeNull();
    expect(c.getTurn('t1')?.phase).toBe('FOLLOWUP_SENT');
    expect(c.startTurn({ turnId: 't3', prompt: 'a new question', now: 2 })).not.toBeNull();
  });
});

describe('navigation', () => {
  it('/new → /chat/<id> keeps the turn and adopts the id', () => {
    const c = setup(NEW_CHAT);
    expect(c.onUrlChange('/chat/xyz')).toEqual([]);
    expect(c.currentChatId).toBe('xyz');
    expect(c.getTurn('t1')?.chatId).toBe('xyz');
    expect(c.onClassifyResult('t1', allow('t1'))[0]).toMatchObject({ type: 'reveal' });
  });

  it('switching chats reveals everything and drops turns', () => {
    const c = setup('abc');
    expect(c.onUrlChange('/chat/other')).toEqual([{ type: 'revealAll', reason: 'navigation' }]);
    expect(c.getTurn('t1')).toBeUndefined();
    expect(c.onClassifyResult('t1', intervene('t1'))).toEqual([]);
  });
});
