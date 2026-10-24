// Claude content script: wires the adapter, the CSS cover, the pure turn
// coordinator, the background classifier, and the sidebar together.
// Rule of thumb: on anything unexpected, reveal.

import ReactDOM from 'react-dom/client';
import type { ClassifyRequest, SidebarRequest, SidebarResult } from '@shared/contracts';
import {
  answerTextLength,
  getAssistantMessages,
  getComposer,
  getComposerText,
  getEnabledSendButton,
  getTurnKey,
  getUserMessages,
  insertComposerText,
  isComposerEmpty,
  isSendButtonTarget,
  lockComposerFocus,
  unlockComposerFocus,
} from '../adapters/claudeAdapter';
import {
  hold,
  installCoverStyle,
  isSeen,
  markSeen,
  release,
  releaseAll,
  setPending,
  uninstallCoverStyle,
} from '../core/responseCover';
import { formatFollowUp } from '../core/followUpText';
import { TurnCoordinator, chatIdFromPath, type Effect } from '../core/turnCoordinator';
import { TotPanel, type PanelProps } from '../ui/PlaceholderSidebar';

const DEADLINE_MS = 10000;
const SEND_BUTTON_WAIT_MS = 60_000; // the held answer may still be streaming
const FOLLOWUP_CONFIRM_MS = 10_000;
const USER_CHECKED_ATTR = 'data-tot-checked';

const log = (...args: unknown[]) => console.log('[tot]', ...args);

export default defineContentScript({
  matches: ['https://claude.ai/*'],
  runAt: 'document_idle',

  async main(ctx) {
    log('content script loaded', location.pathname);
    installCoverStyle();

    const coord = new TurnCoordinator(chatIdFromPath(location.pathname));
    const deadlines = new Map<string, ReturnType<typeof setTimeout>>();
    const awaitingNode: string[] = []; // turnIds whose assistant reply hasn't appeared yet
    const turnKeyOf = new Map<string, string>(); // turnId → data-turn-key
    const nodeOf = new Map<string, HTMLElement>(); // turnId → assistant element (may go stale)
    const seenKeys = new Set<string>(); // replies already revealed; re-mark if React re-renders them
    const sendTime = new Map<string, number>();

    // ---- UI ----------------------------------------------------------------
    let panel: Omit<PanelProps, 'onResult' | 'onRevealHeld' | 'onDismissNotice'> = {
      request: null,
      notice: null,
      copyText: null,
      heldTurnIds: [],
    };
    const ui = await createShadowRootUi(ctx, {
      name: 'tot-panel',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      // Keep typing in the panel from reaching claude.ai's document listeners.
      isolateEvents: ['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'paste'],
      onMount: (container) => ReactDOM.createRoot(container),
      onRemove: (root) => root?.unmount(),
    });
    ui.mount();

    // While focus is in the panel, Claude's composer can't take it. With an open
    // shadow root, document.activeElement is the host whenever focus is inside.
    ctx.addEventListener(ui.shadowHost, 'focusin', () => lockComposerFocus());
    ctx.addEventListener(ui.shadowHost, 'focusout', () => {
      // focusout fires before focus lands; check once it has.
      setTimeout(() => {
        if (document.activeElement !== ui.shadowHost) unlockComposerFocus();
      }, 0);
    });
    // Any click outside the panel hands the composer back, so the user is never
    // stuck unable to type into Claude.
    ctx.addEventListener(
      document,
      'pointerdown',
      (e) => {
        if (e.target !== ui.shadowHost) unlockComposerFocus();
      },
      { capture: true },
    );
    const render = () =>
      ui.mounted?.render(
        <TotPanel
          {...panel}
          onResult={(r) => apply(onSidebarResult(r))}
          onRevealHeld={revealHeld}
          onDismissNotice={() => setPanel({ notice: null, copyText: null })}
        />,
      );
    const setPanel = (patch: Partial<typeof panel>) => {
      panel = { ...panel, ...patch };
      render();
    };

    // ---- Effects -----------------------------------------------------------
    function apply(effects: Effect[]) {
      for (const fx of effects) {
        switch (fx.type) {
          case 'reveal':
            reveal(fx.turnId, fx.reason);
            break;
          case 'cancelDeadline':
            clearDeadline(fx.turnId);
            break;
          case 'openSidebar':
            openSidebar(fx.request);
            break;
          case 'closeSidebar':
            if (panel.request?.turnId === fx.turnId) {
              unlockComposerFocus();
              setPanel({ request: null });
            }
            break;
          case 'submitFollowUp':
            void submitFollowUp(fx.turnId, fx.studentReasoning);
            break;
          case 'revealAll':
            revealEverything(fx.reason);
            break;
        }
      }
      syncPending();
    }

    function syncPending() {
      setPending(coord.hasPendingClassification());
    }

    function clearDeadline(turnId: string) {
      const t = deadlines.get(turnId);
      if (t) clearTimeout(t);
      deadlines.delete(turnId);
    }

    function reveal(turnId: string, reason: string) {
      clearDeadline(turnId);
      const idx = awaitingNode.indexOf(turnId);
      if (idx >= 0) awaitingNode.splice(idx, 1);
      const key = turnKeyOf.get(turnId);
      if (key) {
        seenKeys.add(key);
        release(key);
      }
      const node = findNode(turnId);
      if (node) markSeen(node);
      setPanel({ heldTurnIds: panel.heldTurnIds.filter((id) => id !== turnId) });
      const started = sendTime.get(turnId);
      log('reveal', { turnId, reason, msSinceSend: started ? Math.round(performance.now() - started) : null });
    }

    function revealEverything(reason: string) {
      for (const t of deadlines.values()) clearTimeout(t);
      deadlines.clear();
      awaitingNode.length = 0;
      releaseAll();
      unlockComposerFocus();
      for (const el of getAssistantMessages()) markSeen(el);
      setPending(false);
      setPanel({ request: null, notice: null, copyText: null, heldTurnIds: [] });
      log('revealAll', reason);
    }

    function openSidebar(request: SidebarRequest) {
      const node = findNode(request.turnId);
      const key = turnKeyOf.get(request.turnId) ?? (node && getTurnKey(node));
      if (key) turnKeyOf.set(request.turnId, key);
      if (!key) {
        // Can't hold a reply we never located. Fail open.
        log('intervene but reply not located; revealing', request.turnId);
        apply(coord.onRevealRequested(request.turnId));
        return;
      }
      hold(key);
      setPanel({ request, heldTurnIds: [...panel.heldTurnIds, request.turnId] });
      log('intervene', { turnId: request.turnId, msSinceSend: Math.round(performance.now() - (sendTime.get(request.turnId) ?? 0)) });
    }

    function onSidebarResult(result: SidebarResult): Effect[] {
      return coord.onSidebarResult(result);
    }

    function revealHeld(turnId: string) {
      const effects = coord.onRevealRequested(turnId);
      // Coordinator may already be DONE; release the hold regardless.
      if (effects.length) apply(effects);
      else reveal(turnId, 'user-reveal');
    }

    function findNode(turnId: string): HTMLElement | null {
      const cached = nodeOf.get(turnId);
      if (cached?.isConnected) return cached;
      const key = turnKeyOf.get(turnId);
      if (!key) return null;
      return getAssistantMessages().find((el) => getTurnKey(el) === key) ?? null;
    }

    // ---- Send detection ----------------------------------------------------
    function onSend(source: 'enter' | 'click') {
      const composer = getComposer();
      if (!composer || isComposerEmpty(composer)) return;
      const prompt = getComposerText(composer);
      const turnId = crypto.randomUUID();
      const now = performance.now();

      const turn = coord.startTurn({ turnId, prompt, now });
      if (!turn) {
        log('own follow-up sent; not covering');
        return;
      }
      // Everything already on the page stays visible.
      for (const el of getAssistantMessages()) {
        markSeen(el);
        const key = getTurnKey(el);
        if (key) seenKeys.add(key);
      }
      setPending(true);
      awaitingNode.push(turnId);
      sendTime.set(turnId, now);
      deadlines.set(
        turnId,
        setTimeout(() => apply(coord.onDeadline(turnId)), DEADLINE_MS),
      );
      log('send', { turnId, source, chars: prompt.length });
      void classify(turnId, prompt, now);
    }

    async function classify(turnId: string, prompt: string, startedAt: number) {
      const req: ClassifyRequest = {
        requestId: turnId,
        prompt,
        attachments: [],
        attachmentContentsAvailable: false,
      };
      const deadlineMs = Math.max(0, DEADLINE_MS - (performance.now() - startedAt));
      let result: { ok: true; res: unknown } | { ok: false; error: string };
      try {
        result = await browser.runtime.sendMessage({ type: 'tot:classify', req, deadlineMs });
        if (!result || typeof result !== 'object') result = { ok: false, error: 'empty response' };
      } catch (e) {
        result = { ok: false, error: String(e) };
      }
      log('classified', { turnId, ok: result.ok, ms: Math.round(performance.now() - startedAt) });
      apply(coord.onClassifyResult(turnId, result));
    }

    ctx.addEventListener(
      document,
      'keydown',
      (e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
        if (!(e.target instanceof Element) || !e.target.closest('[contenteditable="true"]')) return;
        if (e.target.closest('[data-testid="chat-input"]')) onSend('enter');
      },
      { capture: true },
    );
    ctx.addEventListener(
      document,
      'click',
      (e) => {
        if (isSendButtonTarget(e.target)) onSend('click');
      },
      { capture: true },
    );

    // ---- DOM observation ---------------------------------------------------
    for (const el of getUserMessages()) el.setAttribute(USER_CHECKED_ATTR, '');

    const observer = new MutationObserver(() => {
      for (const el of getAssistantMessages()) {
        if (isSeen(el)) continue;
        const key = getTurnKey(el);
        if (key && seenKeys.has(key)) {
          markSeen(el); // React re-rendered a reply we already revealed
          continue;
        }
        if ([...nodeOf.values()].includes(el)) continue;
        const turnId = awaitingNode.shift();
        if (!turnId) {
          if (!document.body.hasAttribute('data-tot-pending')) markSeen(el);
          else log('untracked reply appeared while pending', key);
          continue;
        }
        nodeOf.set(turnId, el);
        if (key) turnKeyOf.set(turnId, key);
        const visibility = getComputedStyle(el).visibility;
        const textLen = answerTextLength(el);
        const ms = Math.round(performance.now() - (sendTime.get(turnId) ?? 0));
        if (visibility !== 'hidden' && textLen > 0) log('coverageFailure', { turnId, ms, textLen });
        else log('cover attached', { turnId, ms, visibility, textLen, key });
      }
      for (const el of getUserMessages()) {
        if (el.hasAttribute(USER_CHECKED_ATTR)) continue;
        el.setAttribute(USER_CHECKED_ATTR, '');
        const confirmed = coord.onUserMessageObserved(el.textContent ?? '');
        if (confirmed) {
          log('follow-up confirmed in thread', confirmed);
          followUpWaiters.get(confirmed)?.();
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ---- Follow-up submission ---------------------------------------------
    const followUpWaiters = new Map<string, () => void>();

    async function submitFollowUp(turnId: string, studentReasoning: string) {
      const text = formatFollowUp(studentReasoning);
      unlockComposerFocus(); // we're about to focus and type into it ourselves
      const composer = getComposer();
      if (!composer) {
        setPanel({ notice: "tot couldn't find Claude's message box. Copy your follow-up and paste it.", copyText: text });
        return;
      }
      if (!isComposerEmpty(composer)) {
        setPanel({ notice: 'You have an unsent draft, so tot did not overwrite it. Copy your follow-up and send it when ready.', copyText: text });
        return;
      }
      if (!coord.markFollowUpPending(turnId, text)) return; // already submitting
      if (!insertComposerText(composer, text)) {
        setPanel({ notice: "tot couldn't type into Claude's message box. Copy your follow-up and paste it.", copyText: text });
        return;
      }

      const confirmed = new Promise<boolean>((resolve) => {
        followUpWaiters.set(turnId, () => resolve(true));
        setTimeout(() => resolve(false), SEND_BUTTON_WAIT_MS + FOLLOWUP_CONFIRM_MS);
      });

      const btn = await waitFor(getEnabledSendButton, SEND_BUTTON_WAIT_MS, () =>
        setPanel({ notice: 'Your follow-up is ready in the message box. It will send when Claude finishes the hidden reply.' }),
      );
      if (!btn) {
        setPanel({ notice: 'Your follow-up is in the message box. Press Enter to send it.' });
      } else if (coord.getTurn(turnId)?.phase === 'SUBMIT_FOLLOWUP') {
        btn.click();
        log('follow-up send clicked', turnId);
      }

      const ok = await confirmed;
      followUpWaiters.delete(turnId);
      if (ok) setPanel({ notice: null, copyText: null });
      else setPanel({ notice: "tot couldn't confirm the follow-up was sent. Check the chat.", copyText: text });
    }

    // ---- Navigation & teardown --------------------------------------------
    ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => {
      apply(coord.onUrlChange(new URL(newUrl).pathname));
    });

    ctx.onInvalidated(() => {
      observer.disconnect();
      unlockComposerFocus();
      revealEverything('extension invalidated');
      uninstallCoverStyle();
    });
  },
});

/** Poll for a value; calls onSlow once if it isn't available within 500 ms. */
async function waitFor<T>(get: () => T | null, timeoutMs: number, onSlow?: () => void): Promise<T | null> {
  const start = performance.now();
  let warned = false;
  for (;;) {
    const v = get();
    if (v) return v;
    const elapsed = performance.now() - start;
    if (elapsed > timeoutMs) return null;
    if (!warned && elapsed > 500) {
      warned = true;
      onSlow?.();
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}
