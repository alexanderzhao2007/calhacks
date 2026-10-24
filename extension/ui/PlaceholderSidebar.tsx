// Stand-in for Person 3's TotSidebar. Same contract: takes a SidebarRequest,
// emits a SidebarResult. Knows nothing about Claude's DOM.

import { useState, type CSSProperties } from 'react';
import type { SidebarRequest, SidebarResult } from '@shared/contracts';
import { formatFollowUp } from '../core/followUpText';

export type PanelProps = {
  request: SidebarRequest | null;
  notice: string | null;
  copyText: string | null;
  heldTurnIds: string[];
  onResult: (result: SidebarResult) => void;
  onRevealHeld: (turnId: string) => void;
  onDismissNotice: () => void;
};

const box: CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 110,
  width: 340,
  zIndex: 2147483647,
  background: '#fff',
  color: '#1f1f1f',
  border: '1px solid #d6d3cc',
  borderRadius: 12,
  boxShadow: '0 8px 24px rgba(0,0,0,.15)',
  padding: 16,
  font: '14px/1.45 system-ui, sans-serif',
};

export function TotPanel(props: PanelProps) {
  const { request, notice, copyText, heldTurnIds } = props;
  if (request) return <Question key={request.turnId} {...props} request={request} />;
  if (notice) {
    return (
      <div style={box} role="status">
        <p style={{ margin: '0 0 8px' }}>{notice}</p>
        {copyText && (
          <button onClick={() => void navigator.clipboard.writeText(copyText)}>Copy follow-up</button>
        )}{' '}
        <button onClick={props.onDismissNotice}>Dismiss</button>
        <HeldButtons {...props} />
      </div>
    );
  }
  if (heldTurnIds.length) {
    return (
      <div style={{ ...box, width: 'auto', padding: 8 }}>
        <HeldButtons {...props} />
      </div>
    );
  }
  return null;
}

function HeldButtons({ heldTurnIds, onRevealHeld }: PanelProps) {
  return (
    <>
      {heldTurnIds.map((id) => (
        <button key={id} onClick={() => onRevealHeld(id)}>
          tot: Reveal original answer
        </button>
      ))}
    </>
  );
}

function Question({ request, onResult }: PanelProps & { request: SidebarRequest }) {
  const [reasoning, setReasoning] = useState('');
  const [preview, setPreview] = useState(false);
  const skip = () => onResult({ action: 'skip', turnId: request.turnId });

  return (
    <div style={box} role="dialog" aria-label="tot: try it first">
      <strong>Before you read the answer…</strong>
      {!preview ? (
        <>
          <p style={{ margin: '8px 0' }}>{request.question}</p>
          <textarea
            autoFocus
            rows={4}
            style={{ width: '100%', boxSizing: 'border-box' }}
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            placeholder="Your first idea, even if unsure"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button disabled={!reasoning.trim()} onClick={() => setPreview(true)}>
              Continue
            </button>
            <button onClick={skip}>Skip / Reveal answer</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ margin: '8px 0' }}>This will be sent to Claude in this chat:</p>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f4ef', padding: 8, maxHeight: 200, overflow: 'auto' }}>
            {formatFollowUp(reasoning)}
          </pre>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onResult({ action: 'continue', turnId: request.turnId, studentReasoning: reasoning.trim() })}
            >
              Send to Claude
            </button>
            <button onClick={() => setPreview(false)}>Back</button>
            <button onClick={skip}>Skip / Reveal answer</button>
          </div>
        </>
      )}
    </div>
  );
}
