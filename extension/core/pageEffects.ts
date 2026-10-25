// Page-level styles tot needs outside its shadow root: the brand fonts (a font
// face must be registered on the document to be usable inside a shadow root)
// and the backdrop blur on Claude's page while the popup is open.

import type { PublicPath } from 'wxt/browser';

const STYLE_ID = 'tot-page-style';
const MODAL_ATTR = 'data-tot-modal';

const FONTS: { family: string; weight: number; path: PublicPath }[] = [
  { family: 'Quicksand', weight: 500, path: '/fonts/quicksand-latin-500-normal.woff2' },
  { family: 'Figtree', weight: 400, path: '/fonts/figtree-latin-400-normal.woff2' },
  { family: 'Figtree', weight: 600, path: '/fonts/figtree-latin-600-normal.woff2' },
];

/** `hostTag` is the shadow host's tag, which must stay unblurred. */
export function installPageStyle(hostTag: string) {
  if (document.getElementById(STYLE_ID)) return;
  const faces = FONTS.map(
    (f) => `@font-face {
  font-family: '${f.family}';
  font-style: normal;
  font-weight: ${f.weight};
  font-display: swap;
  src: url('${browser.runtime.getURL(f.path)}') format('woff2');
}`,
  ).join('\n');
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `${faces}
body[${MODAL_ATTR}] > :not(${hostTag}) { filter: blur(6px) !important; }
`;
  document.head.append(style);
}

export function uninstallPageStyle() {
  document.getElementById(STYLE_ID)?.remove();
  setModal(false);
}

export function setModal(on: boolean) {
  document.body.toggleAttribute(MODAL_ATTR, on);
}
