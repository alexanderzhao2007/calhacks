// All claude.ai DOM knowledge lives here. Nothing else should query Claude's DOM.
//
// Recon notes (2026-10-24, live claude.ai, Sonnet 5.5):
// - Composer: div[contenteditable][data-testid="chat-input"], TipTap/ProseMirror
//   ("tiptap ProseMirror"). Exposes data-doc-empty="true" when empty.
// - Send: a button inside [data-testid="chat-input-send"]. While a reply streams,
//   it is replaced by [data-testid="chat-input-stop"] ("Stop response").
// - Transcript: [data-testid="transcript-list"] > [data-testid="transcript-row"].
//   On send, the user row and an empty assistant row are inserted in the same
//   mutation batch; first answer text arrived ~4 s later in the sample.
// - User message: [data-testid="user-message"]. textContent includes an sr-only
//   "You said:" prefix and may repeat the text, so match with `includes`.
// - Assistant message: [data-testid="assistant-message"] with
//   data-is-streaming="true|false" and data-turn-key="<uuid>-hub-reply"
//   (stable per reply, so we key holds on it in case React swaps the node).
// - Streaming text arrives as span._animating_* chunks inside <p> (hashed class,
//   do not rely on it). At stream end many paragraphs were inserted at once,
//   so the node may be re-rendered; untested whether the element is replaced.
// - Thinking indicator: span[data-testid="TurnStatusClayMark"] inside the reply.
// - URL: /new → /chat/<uuid> after the first send (not yet timed).
// - Retry: [data-testid="user-message-retry"], [data-testid="action-bar-retry"].

export const SEL = {
  composer: '[data-testid="chat-input"]',
  sendButton: '[data-testid="chat-input-send"] button',
  userMessage: '[data-testid="user-message"]',
  assistantMessage: '[data-testid="assistant-message"]',
  statusMark: 'span[data-testid="TurnStatusClayMark"]',
} as const;

export function getComposer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(SEL.composer);
}

export function isComposerEmpty(composer: HTMLElement): boolean {
  const flag = composer.getAttribute('data-doc-empty');
  if (flag !== null) return flag === 'true';
  return composer.innerText.trim().length === 0;
}

export function getComposerText(composer: HTMLElement): string {
  return composer.innerText.trim();
}

/** True if the event target is (inside) Claude's Send button. */
export function isSendButtonTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SEL.sendButton) !== null;
}

export function getEnabledSendButton(): HTMLButtonElement | null {
  const btn = document.querySelector<HTMLButtonElement>(SEL.sendButton);
  if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return null;
  return btn;
}

export function getAssistantMessages(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(SEL.assistantMessage)];
}

export function getUserMessages(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(SEL.userMessage)];
}

export function getTurnKey(assistant: HTMLElement): string | null {
  return assistant.getAttribute('data-turn-key');
}

/** Visible answer text length, ignoring the thinking/status indicator. */
export function answerTextLength(assistant: HTMLElement): number {
  let len = 0;
  for (const p of assistant.querySelectorAll('p, li, pre, code, h1, h2, h3, h4')) {
    len += p.textContent?.trim().length ?? 0;
  }
  return len;
}

/**
 * Put text into the ProseMirror composer so its internal state updates.
 * Tries a synthetic paste first (keeps paragraphs), then execCommand.
 */
export function insertComposerText(composer: HTMLElement, text: string): boolean {
  composer.focus();
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  composer.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
  );
  if (!isComposerEmpty(composer)) return true;
  document.execCommand('insertText', false, text);
  return !isComposerEmpty(composer);
}
