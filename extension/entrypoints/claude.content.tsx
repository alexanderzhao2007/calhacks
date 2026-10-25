// Claude content script: wires the adapter, the CSS cover, the pure turn
// coordinator, the background classifier, and the tot popup together.
// Rule of thumb: on anything unexpected, reveal.

import ReactDOM from 'react-dom/client';
import '../ui/tot.css';
import type { ClassifyRequest, ComposeRequest, FollowUpRequest, SidebarRequest, SidebarResult } from '@shared/contracts';
import {
  answerTextLength,
  getAssistantMessages,
  getComposer,
  getComposerText,
  getTurnKey,
  getUserMessages,
  insertComposerTextAtStart,
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
import { installPageStyle, setModal, uninstallPageStyle } from '../core/pageEffects';
import { TurnCoordinator, chatIdFromPath, type Effect } from '../core/turnCoordinator';
import { TotPopup, type ThanksStatus } from '../ui/TotPopup';
import type { ActivityMessage } from './background';

const DEADLINE_MS = 10000;
const FOLLOW_UP_DEADLINE_MS = 4000; // judging an answer; failure hands off
const COMPOSE_DEADLINE_MS = 5000; // writing the message for Claude; failure uses the template
const USER_CHECKED_ATTR = 'data-tot-checked';
const UI_NAME = 'tot-panel'; // also the shadow host's tag, kept unblurred

const log = (...args: unknown[]) => console.log('[tot]', ...args);

/** Friends board count (no content). The background drops it unless the student joined. */
function recordActivity(msg: ActivityMessage) {
  // Throws synchronously once the extension reloads under an open tab; counting
  // must never break the send or sidebar flow.
  try {
    browser.runtime.sendMessage(msg).catch(() => {});
  } catch {
    // extension context gone: reload the tab
  }
}

export default defineContentScript({
  matches: ['https://claude.ai/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui', // tot.css goes into the shadow root, not the page

  async main(ctx) {
    log('content script loaded', location.pathname);
    installCoverStyle();
    installPageStyle(UI_NAME);

    const coord = new TurnCoordinator(chatIdFromPath(location.pathname));
    const deadlines = new Map<string, ReturnType<typeof setTimeout>>();
    const awaitingNode: string[] = []; // turnIds whose assistant reply hasn't appeared yet
    const turnKeyOf = new Map<string, string>(); // turnId → data-turn-key
    const nodeOf = new Map<string, HTMLElement>(); // turnId → assistant element (may go stale)
    const seenKeys = new Set<string>(); // replies already revealed; re-mark if React re-renders them
    const sendTime = new Map<string, number>();

    // ---- UI ----------------------------------------------------------------
    let panel: { request: SidebarRequest | null; judging: boolean; thanks: ThanksStatus | null } = {
      request: null,
      judging: false,
      thanks: null,
    };
    const heldTurnIds = new Set<string>(); // turns whose original answer is held behind the popup
    const ui = await createShadowRootUi(ctx, {
      name: UI_NAME,
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
      ui.mounted?.render(<TotPopup {...panel} onResult={(r) => apply(onSidebarResult(r))} />);
    const setPanel = (patch: Partial<typeof panel>) => {
      panel = { ...panel, ...patch };
      setModal(panel.request !== null); // blur Claude's page while the popup is open
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
            // A new question, not a follow-up round. Counted only if joined.
            if (!fx.request.history?.length) recordActivity({ type: 'tot:question' });
            break;
          case 'closeSidebar':
            if (panel.request?.turnId === fx.turnId) {
              unlockComposerFocus();
              setPanel({ request: null, judging: false, thanks: null });
            }
            break;
          case 'judgeAnswer':
            setPanel({ judging: true });
            void judgeAnswer(fx.turnId, fx.request);
            break;
          case 'showThanks':
            setPanel({ judging: false, thanks: 'composing' });
            break;
          case 'earnMiles':
            recordActivity({ type: 'tot:thoughtFirst', tier: fx.tier });
            break;
          case 'composeFollowUp':
            void composeFollowUp(fx.turnId, fx.request);
            break;
          case 'thanksReady':
            if (panel.request?.turnId === fx.turnId) setPanel({ thanks: fx.willPaste ? 'pasting' : 'nothing' });
            break;
          case 'submitFollowUp':
            void submitFollowUp(fx.turnId, fx.text);
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
      heldTurnIds.delete(turnId);
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
      heldTurnIds.clear();
      setPanel({ request: null, judging: false, thanks: null });
      log('revealAll', reason);
    }

    function openSidebar(request: SidebarRequest) {
      if (heldTurnIds.has(request.turnId)) {
        // A follow-up question for a turn whose answer is already held.
        setPanel({ request, judging: false, thanks: null });
        log('follow-up question', { turnId: request.turnId });
        return;
      }
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
      heldTurnIds.add(request.turnId);
      setPanel({ request, judging: false, thanks: null });
      log('intervene', { turnId: request.turnId, msSinceSend: Math.round(performance.now() - (sendTime.get(request.turnId) ?? 0)) });
    }

    function onSidebarResult(result: SidebarResult): Effect[] {
      return coord.onSidebarResult(result, performance.now());
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
      recordActivity({ type: 'tot:prompt' });
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
      apply(coord.onClassifyResult(turnId, result, performance.now()));
    }

    type ApiResult = { ok: true; res: unknown } | { ok: false; error: string };

    /** Ask the background worker to call the API; always settles within the deadline. */
    async function callApi(type: 'tot:followUp' | 'tot:compose', req: unknown, deadlineMs: number): Promise<ApiResult> {
      const timeout = new Promise<ApiResult>((r) => setTimeout(() => r({ ok: false, error: 'timeout' }), deadlineMs + 500));
      try {
        const result = await Promise.race([browser.runtime.sendMessage({ type, req, deadlineMs }), timeout]);
        return result && typeof result === 'object' ? result : { ok: false, error: 'empty response' };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }

    async function judgeAnswer(turnId: string, req: FollowUpRequest) {
      const startedAt = performance.now();
      const result = await callApi('tot:followUp', req, FOLLOW_UP_DEADLINE_MS);
      log('judged', { turnId, ok: result.ok, ms: Math.round(performance.now() - startedAt) });
      apply(coord.onFollowUpResult(turnId, result, performance.now()));
    }

    async function composeFollowUp(turnId: string, req: ComposeRequest) {
      const startedAt = performance.now();
      const result = await callApi('tot:compose', req, COMPOSE_DEADLINE_MS);
      log('composed', { turnId, ok: result.ok, ms: Math.round(performance.now() - startedAt) });
      apply(coord.onComposeResult(turnId, result));
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
        if (confirmed) log('follow-up confirmed in thread', confirmed);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ---- Follow-up submission ---------------------------------------------
    // Pastes the follow-up into Claude's composer, above any draft, silently
    // (HANDOFF.md §3). Never sends it: the student presses Send. Any failure is
    // silent; the answer is already revealed.
    async function submitFollowUp(turnId: string, text: string) {
      unlockComposerFocus(); // we're about to focus and type into it ourselves
      const composer = getComposer();
      if (!text || !composer) {
        log('follow-up not placed: no composer', turnId);
        return;
      }
      if (!coord.markFollowUpPending(turnId, text)) return; // already placed
      const landed = await insertComposerTextAtStart(composer, text);
      log(landed ? 'follow-up placed in composer' : 'follow-up paste not verified', turnId);
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
      uninstallPageStyle();
    });
  },
});
