// tot popup (HANDOFF.md §2, §4): question, judging trace, follow-up with
// history, and the skip confirm. Takes a SidebarRequest and emits a
// SidebarResult; knows nothing about Claude's DOM. Styles live in tot.css.

import { useEffect, useState } from 'react';
import type { SidebarRequest, SidebarResult } from '@shared/contracts';
import { COPY } from './copy';

/** composing: /compose is running. pasting / nothing: ready, auto-close counting down. */
export type ThanksStatus = 'composing' | 'pasting' | 'nothing';

export type PopupProps = {
  request: SidebarRequest | null;
  judging: boolean;
  thanks: ThanksStatus | null;
  onResult: (result: SidebarResult) => void;
};

const THANKS_CLOSE_S = 4;

export function TotPopup({ request, judging, thanks, onResult }: PopupProps) {
  if (!request) return null;
  if (thanks) return <Thanks status={thanks} onClose={() => onResult({ action: 'close', turnId: request.turnId })} />;
  // Keyed by question so a follow-up starts with an empty field.
  return <Popup key={`${request.turnId}:${request.question}`} request={request} judging={judging} onResult={onResult} />;
}

function Popup({ request, judging, onResult }: Omit<PopupProps, 'thanks'> & { request: SidebarRequest }) {
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(false);

  const submit = () => {
    const answer = draft.trim();
    if (!answer || judging) return;
    onResult({ action: 'answer', turnId: request.turnId, answer });
  };

  if (confirming) {
    return (
      <div className="tot-backdrop">
        <div className="tot-popup tot-confirm" role="alertdialog" aria-modal="true" aria-labelledby="tot-confirm-title">
          <h2 className="tot-confirm-title" id="tot-confirm-title">
            {COPY.skipConfirm.title}
          </h2>
          <div className="tot-confirm-actions">
            <button
              type="button"
              className="tot-btn tot-btn-secondary"
              onClick={() => onResult({ action: 'skip', turnId: request.turnId })}
            >
              {COPY.skipConfirm.leave}
            </button>
            {/* Keep thinking is the default: primary, right-hand, focused. */}
            <button type="button" className="tot-btn tot-btn-primary" autoFocus onClick={() => setConfirming(false)}>
              {COPY.skipConfirm.stay}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const history = request.history ?? [];
  const questionRow = (
    <div className="tot-question-row">
      <TotIcon />
      <h2 className="tot-question" id="tot-q">
        {request.question}
      </h2>
    </div>
  );

  return (
    <div className="tot-backdrop">
      <div
        className="tot-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tot-q"
        aria-describedby="tot-reason"
        aria-busy={judging}
      >
        {judging && (
          <svg className="tot-trace" aria-hidden="true">
            <rect x="0" y="0" width="100%" height="100%" rx="16" pathLength={100} />
          </svg>
        )}
        <p className="tot-reason" id="tot-reason">
          {COPY.popup.reason}
        </p>
        {history.length > 0 && !judging ? (
          // column-reverse: DOM order is newest-first so it opens scrolled to the current question.
          <div className="tot-history" tabIndex={0} aria-label={COPY.followUp.historyAriaLabel}>
            {questionRow}
            {[...history].reverse().map((p, i) => (
              <HistoryRound key={history.length - i} question={p.question} answer={p.answer} />
            ))}
          </div>
        ) : (
          questionRow
        )}
        <textarea
          className="tot-field"
          aria-label={COPY.popup.fieldAriaLabel}
          placeholder={COPY.popup.fieldPlaceholder}
          autoFocus
          disabled={judging}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits; Shift+Enter adds a line.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="tot-actions">
          <button type="button" className="tot-skip" disabled={judging} onClick={() => setConfirming(true)}>
            {COPY.popup.skip}
          </button>
          <div className="tot-actions-right">
            <span className="tot-hint">{COPY.popup.submitHint}</span>
            <button type="button" className="tot-btn tot-btn-primary" disabled={judging} onClick={submit}>
              {COPY.popup.submit}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Shown after the student's last answer, so tot never just disappears. Closes
// itself a few seconds after the message for Claude is ready.
function Thanks({ status, onClose }: { status: ThanksStatus; onClose: () => void }) {
  const [left, setLeft] = useState(THANKS_CLOSE_S);
  const counting = status !== 'composing';

  useEffect(() => {
    if (!counting) return;
    if (left <= 0) {
      onClose();
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [counting, left, onClose]);

  return (
    <div className="tot-backdrop">
      <div
        className="tot-popup tot-thanks"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tot-thanks-title"
        aria-describedby="tot-thanks-body"
        aria-busy={!counting}
      >
        {!counting && (
          <svg className="tot-trace" aria-hidden="true">
            <rect x="0" y="0" width="100%" height="100%" rx="16" pathLength={100} />
          </svg>
        )}
        <div className="tot-question-row">
          <TotIcon />
          <h2 className="tot-question" id="tot-thanks-title">
            {COPY.thanks.title}
          </h2>
        </div>
        <p className="tot-thanks-body" id="tot-thanks-body" aria-live="polite">
          {COPY.thanks[status]}
        </p>
        <div className="tot-actions">
          <span className="tot-hint">{counting ? COPY.thanks.closingIn(Math.max(left, 0)) : ''}</span>
          <button type="button" className="tot-btn tot-btn-primary" autoFocus onClick={onClose}>
            {COPY.thanks.close}
          </button>
        </div>
      </div>
    </div>
  );
}

// Rendered inside a column-reverse box, so children are in bottom-to-top order.
function HistoryRound({ question, answer }: { question: string; answer: string }) {
  return (
    <>
      <div className="tot-history-rule" />
      <div className="tot-history-a">{answer}</div>
      <div className="tot-history-q">{question}</div>
    </>
  );
}

function TotIcon() {
  return (
    <svg className="tot-icon" viewBox="0 0 128 128" role="img" aria-label="tot">
      <rect width="128" height="128" rx="30" fill="#2F4858" />
      <rect className="edge" x="2" y="2" width="124" height="124" rx="28" fill="none" strokeWidth="4" />
      <circle cx="64" cy="54" r="30" fill="#F2B300" />
      <rect x="52" y="89" width="24" height="8" rx="3" fill="#FFFFFF" />
      <rect x="56" y="101" width="16" height="6" rx="3" fill="#FFFFFF" />
    </svg>
  );
}
