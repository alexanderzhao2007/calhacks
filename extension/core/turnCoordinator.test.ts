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

  it('continue submits exactly once and the follow-up is not classified', () => {
    const c = setup();
    c.onClassifyResult('t1', intervene('t1'));
    const fx = c.onSidebarResult({ action: 'continue', turnId: 't1', studentReasoning: 'base cases' });
    expect(fx.map((e) => e.type)).toEqual(['closeSidebar', 'submitFollowUp']);
    expect(c.onSidebarResult({ action: 'continue', turnId: 't1', studentReasoning: 'again' })).toEqual([]);

    const text = 'My initial approach:\n  "base cases"';
    expect(c.markFollowUpPending('t1', text)).toBe(true);
    expect(c.markFollowUpPending('t1', text)).toBe(false); // no double click
    expect(c.startTurn({ turnId: 't2', prompt: text, now: 1 })).toBeNull();

    expect(c.onUserMessageObserved('unrelated message')).toBeNull();
    // Claude's rendered user message: sr-only prefix, paragraphs joined without newlines.
    expect(c.onUserMessageObserved('You said: My initial approach:"base cases"')).toBe('t1');
    expect(c.getTurn('t1')?.phase).toBe('FOLLOWUP_SENT');
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
