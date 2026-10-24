// Background service worker. Owns network calls to the classifier so the
// endpoint and CORS stay out of the page. For now it serves a local mock
// (CLAUDE.md §10: validate browser behavior with hardcoded results first).

import type { ClassifyRequest, ClassifyResponse } from '@shared/contracts';

export type MockMode = 'fast' | 'slow' | 'error';

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

const MOCK_DELAY_MS: Record<MockMode, number> = { fast: 150, slow: 5000, error: 100 };

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: ClassifyMessage, _sender, sendResponse) => {
    if (msg?.type !== 'tot:classify') return;
    void (async () => {
      const { mockMode = 'fast' } = (await browser.storage.local.get('mockMode')) as {
        mockMode?: MockMode;
      };
      await new Promise((r) => setTimeout(r, MOCK_DELAY_MS[mockMode]));
      if (mockMode === 'error') sendResponse({ ok: false, error: 'mock error' });
      else sendResponse({ ok: true, res: mockClassify(msg.req) });
    })();
    return true; // keep the channel open for the async response
  });
});
