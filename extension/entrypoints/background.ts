// Background service worker. Owns network calls to the classifier so the
// endpoint and CORS stay out of the page. Defaults to the live classifier
// (api/server.ts); the mock modes stay available for browser-flow testing
// without API calls (CLAUDE.md §10).

import type { ClassifyRequest, ClassifyResponse, FollowUpRequest, FollowUpResponse } from '@shared/contracts';

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

async function mockResult(mode: Exclude<MockMode, 'live'>, make: () => unknown): Promise<ApiResult> {
  await new Promise((r) => setTimeout(r, MOCK_DELAY_MS[mode]));
  if (mode === 'error') return { ok: false, error: 'mock error' };
  return { ok: true, res: make() };
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: ClassifyMessage | FollowUpMessage, _sender, sendResponse) => {
    if (msg?.type !== 'tot:classify' && msg?.type !== 'tot:followUp') return;
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
      } else {
        sendResponse(
          mockMode === 'live'
            ? await postJson('/follow-up', msg.req, msg.deadlineMs)
            : await mockResult(mockMode, () => mockFollowUp(msg.req)),
        );
      }
    })();
    return true; // keep the channel open for the async response
  });
});
