// Background service worker. Owns network calls to the classifier so the
// endpoint and CORS stay out of the page. Defaults to the live classifier
// (api/server.ts); the mock modes stay available for browser-flow testing
// without API calls (CLAUDE.md §10).

import type { ClassifyRequest, ClassifyResponse } from '@shared/contracts';

export type MockMode = 'live' | 'fast' | 'slow' | 'error';

const CLASSIFY_URL = `${import.meta.env.WXT_TOT_API_URL ?? 'http://localhost:8787'}/classify`;

export type ClassifyMessage = {
  type: 'tot:classify';
  req: ClassifyRequest;
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

const MOCK_DELAY_MS: Record<Exclude<MockMode, 'live'>, number> = { fast: 150, slow: 5000, error: 100 };

type ClassifyResult = { ok: true; res: unknown } | { ok: false; error: string };

// Aborts at the content script's remaining deadline so a slow API never
// holds the cover. The coordinator validates the body before it touches UI.
async function liveClassify(req: ClassifyRequest, deadlineMs: number): Promise<ClassifyResult> {
  try {
    const resp = await fetch(CLASSIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(Math.max(1, deadlineMs)),
    });
    if (!resp.ok) return { ok: false, error: `classifier HTTP ${resp.status}` };
    return { ok: true, res: await resp.json() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.name : String(e) };
  }
}

async function mockClassifyResult(req: ClassifyRequest, mode: Exclude<MockMode, 'live'>): Promise<ClassifyResult> {
  await new Promise((r) => setTimeout(r, MOCK_DELAY_MS[mode]));
  if (mode === 'error') return { ok: false, error: 'mock error' };
  return { ok: true, res: mockClassify(req) };
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: ClassifyMessage, _sender, sendResponse) => {
    if (msg?.type !== 'tot:classify') return;
    void (async () => {
      const { mockMode = 'live' } = (await browser.storage.local.get('mockMode')) as {
        mockMode?: MockMode;
      };
      sendResponse(
        mockMode === 'live'
          ? await liveClassify(msg.req, msg.deadlineMs)
          : await mockClassifyResult(msg.req, mockMode),
      );
    })();
    return true; // keep the channel open for the async response
  });
});
