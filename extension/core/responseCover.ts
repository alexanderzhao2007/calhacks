// CSS-based response cover. Hiding is declared in a stylesheet so a new reply
// is hidden from its first paint, with no MutationObserver race. Everything is
// gated on attributes we control, so a lost attribute can only reveal content.

import { SEL } from '../adapters/claudeAdapter';

const PENDING_ATTR = 'data-tot-pending';
const SEEN_ATTR = 'data-tot-seen';
const BASE_STYLE_ID = 'tot-cover-base';
const HOLD_STYLE_ID = 'tot-cover-holds';

const holds = new Set<string>(); // data-turn-key values held after an intervention

export function installCoverStyle() {
  if (document.getElementById(BASE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = BASE_STYLE_ID;
  const unseen = `body[${PENDING_ATTR}] ${SEL.assistantMessage}:not([${SEEN_ATTR}])`;
  style.textContent = `
${unseen} { visibility: hidden !important; }
${unseen} ${SEL.statusMark} { visibility: visible !important; }
`;
  document.head.append(style);
  const holdStyle = document.createElement('style');
  holdStyle.id = HOLD_STYLE_ID;
  document.head.append(holdStyle);
}

export function uninstallCoverStyle() {
  document.getElementById(BASE_STYLE_ID)?.remove();
  document.getElementById(HOLD_STYLE_ID)?.remove();
  document.body.removeAttribute(PENDING_ATTR);
  holds.clear();
}

export function setPending(on: boolean) {
  document.body.toggleAttribute(PENDING_ATTR, on);
}

export function markSeen(el: Element) {
  el.setAttribute(SEEN_ATTR, '');
}

export function isSeen(el: Element) {
  return el.hasAttribute(SEEN_ATTR);
}

/** Keep one reply hidden by its turn key, independent of the pending flag. */
export function hold(turnKey: string) {
  holds.add(turnKey);
  renderHolds();
}

export function release(turnKey: string) {
  if (holds.delete(turnKey)) renderHolds();
}

export function releaseAll() {
  holds.clear();
  renderHolds();
}

function renderHolds() {
  const style = document.getElementById(HOLD_STYLE_ID);
  if (!style) return;
  style.textContent = [...holds]
    .map((k) => `${SEL.assistantMessage}[data-turn-key="${CSS.escape(k)}"] { visibility: hidden !important; }`)
    .join('\n');
}
