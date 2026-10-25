// tot popup (HANDOFF.md §2, §4): question, judging trace, follow-up with
// history, and the skip confirm. Takes a SidebarRequest and emits a
// SidebarResult; knows nothing about Claude's DOM. Styles live in tot.css.

import { useState } from 'react';
import type { SidebarRequest, SidebarResult } from '@shared/contracts';
import { COPY } from './copy';

export type PopupProps = {
  request: SidebarRequest | null;
  judging: boolean;
  onResult: (result: SidebarResult) => void;
};

export function TotPopup({ request, judging, onResult }: PopupProps) {
  if (!request) return null;
  // Keyed by question so a follow-up starts with an empty field.
  return <Popup key={`${request.turnId}:${request.question}`} request={request} judging={judging} onResult={onResult} />;
}

function Popup({ request, judging, onResult }: PopupProps & { request: SidebarRequest }) {
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
      <div className="tot-popup" role="dialog" aria-modal="true" aria-labelledby="tot-q" aria-busy={judging}>
        {judging && (
          <svg className="tot-trace" aria-hidden="true">
            <rect x="0" y="0" width="100%" height="100%" rx="16" pathLength={100} />
          </svg>
        )}
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
