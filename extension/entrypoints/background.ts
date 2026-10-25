// Background service worker. Owns network calls to the classifier so the
// endpoint and CORS stay out of the page. Defaults to the live classifier
// (api/server.ts); the mock modes stay available for browser-flow testing
// without API calls (CLAUDE.md §10).

import type {
  ClassifyRequest,
  ClassifyResponse,
  ComposeRequest,
  ComposeResponse,
  FollowUpRequest,
  FollowUpResponse,
} from '@shared/contracts';
import { callReducer } from '../core/friendsApi';
import { localDay, TOKEN_KEY, type Tier } from '../core/social';

export type MockMode = 'live' | 'fast' | 'slow' | 'error';

const API_URL = import.meta.env.WXT_TOT_API_URL ?? 'http://localhost:8787';

export type ClassifyMessage = {
  type: 'tot:classify';
  req: ClassifyRequest;
  deadlineMs: number;
};

export type FollowUpMessage = {
  type: 'tot:followUp';
  req: FollowUpRequest;
  deadlineMs: number;
};

export type ComposeMessage = {
  type: 'tot:compose';
  req: ComposeRequest;
  deadlineMs: number;
};

// Hardcoded rule for Spike 1: "for me" → intervene, anything else → allow.
function mockClassify(req: ClassifyRequest): ClassifyResponse {
  if (/\bfor me\b/i.test(req.prompt)) {
    return {
      requestId: req.requestId,
      decision: 'intervene',
      reason: 'mock: prompt contains "for me"',
      question: 'Before seeing the answer, what would you try first, and why?',
    };
  }
  return { requestId: req.requestId, decision: 'allow', reason: 'mock: default allow', question: null };
}

// Mock judge: a content-free answer gets one smaller question, anything else passes.
function mockFollowUp(req: FollowUpRequest): FollowUpResponse {
  const last = req.qaHistory[req.qaHistory.length - 1]?.answer ?? '';
  if (req.followUpsUsed < 2 && /^\s*(idk|i don'?t know|no idea|dunno|\?+)\s*$/i.test(last)) {
    return {
      requestId: req.requestId,
      decision: 'follow_up',
      reason: 'mock: no thinking in answer',
      question: "No worries. What's one small piece of this you could start with?",
    };
  }
  return { requestId: req.requestId, decision: 'pass', reason: 'mock: pass', question: null };
}

// Mock composer: the extension's template (fallback) unless every answer is empty-ish.
function mockCompose(req: ComposeRequest): ComposeResponse {
  const allEmpty = req.qaHistory.every((p) => /^\s*(idk|i don'?t know|no idea|dunno|\?+)?\s*$/i.test(p.answer));
  return allEmpty
    ? { requestId: req.requestId, decision: 'skip', reason: 'mock: nothing to paste', message: null }
    : { requestId: req.requestId, decision: 'fallback', reason: 'mock: use template', message: null };
}

const MOCK_DELAY_MS: Record<Exclude<MockMode, 'live'>, number> = { fast: 150, slow: 5000, error: 100 };

type ApiResult = { ok: true; res: unknown } | { ok: false; error: string };

// Aborts at the caller's deadline so a slow API never holds the page. The
// coordinator validates the body before it touches UI.
async function postJson(path: string, body: unknown, deadlineMs: number): Promise<ApiResult> {
  try {
    const resp = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1, deadlineMs)),
    });
    if (!resp.ok) return { ok: false, error: `${path} HTTP ${resp.status}` };
    return { ok: true, res: await resp.json() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.name : String(e) };
  }
}

// Friends board (SpacetimeDB) activity counts. Only after the student joins in
// the toolbar popup (the token exists then). Sends counts and a tier, never
// content; never blocks anything; failures are logged and dropped.
export type ActivityMessage =
  | { type: 'tot:prompt' }
  | { type: 'tot:question' }
  | { type: 'tot:thoughtFirst'; tier: Tier };

const ACTIVITY_REDUCER = {
  'tot:prompt': 'record_prompt',
  'tot:question': 'record_question',
  'tot:thoughtFirst': 'record_thought_first',
} as const;

async function storedToken(): Promise<string | undefined> {
  const { [TOKEN_KEY]: token } = (await browser.storage.local.get(TOKEN_KEY)) as Record<string, string | undefined>;
  return token;
}

async function recordActivity(msg: ActivityMessage): Promise<void> {
  const reducer = ACTIVITY_REDUCER[msg.type];
  const token = await storedToken();
  if (!token) {
    console.info(`[tot] friends: not joined, skipping ${reducer}`);
    return;
  }
  const args: unknown[] = [localDay(new Date())];
  if (msg.type === 'tot:thoughtFirst') args.push(msg.tier);
  try {
    await callReducer(token, reducer, args);
    console.info(`[tot] friends: ${reducer} recorded`);
  } catch (e) {
    console.info(`[tot] friends: ${reducer} failed:`, e instanceof Error ? e.message : e);
  }
}

/** "Join" on the toolbar icon until the student opts in, so a silent no-op is visible. */
async function updateJoinBadge(): Promise<void> {
  const joined = Boolean(await storedToken());
  await browser.action.setBadgeText({ text: joined ? '' : 'Join' });
  if (!joined) await browser.action.setBadgeBackgroundColor({ color: '#F2B300' });
}

async function mockResult(mode: Exclude<MockMode, 'live'>, make: () => unknown): Promise<ApiResult> {
  await new Promise((r) => setTimeout(r, MOCK_DELAY_MS[mode]));
  if (mode === 'error') return { ok: false, error: 'mock error' };
  return { ok: true, res: make() };
}

export default defineBackground(() => {
  void updateJoinBadge();
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && TOKEN_KEY in changes) void updateJoinBadge();
  });

  browser.runtime.onMessage.addListener((msg: ClassifyMessage | FollowUpMessage | ComposeMessage | ActivityMessage, _sender, sendResponse) => {
    if (msg?.type && msg.type in ACTIVITY_REDUCER) {
      void recordActivity(msg as ActivityMessage);
      return;
    }
    if (msg?.type !== 'tot:classify' && msg?.type !== 'tot:followUp' && msg?.type !== 'tot:compose') return;
    void (async () => {
      const { mockMode = 'live' } = (await browser.storage.local.get('mockMode')) as {
        mockMode?: MockMode;
      };
      if (msg.type === 'tot:classify') {
        sendResponse(
          mockMode === 'live'
            ? await postJson('/classify', msg.req, msg.deadlineMs)
            : await mockResult(mockMode, () => mockClassify(msg.req)),
        );
      } else if (msg.type === 'tot:followUp') {
        sendResponse(
          mockMode === 'live'
            ? await postJson('/follow-up', msg.req, msg.deadlineMs)
            : await mockResult(mockMode, () => mockFollowUp(msg.req)),
        );
      } else {
        sendResponse(
          mockMode === 'live'
            ? await postJson('/compose', msg.req, msg.deadlineMs)
            : await mockResult(mockMode, () => mockCompose(msg.req)),
        );
      }
    })();
    return true; // keep the channel open for the async response
  });
});
