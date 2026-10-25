// "Turn on tot": the one-time OK to send Claude messages to the classifier
// (CLAUDE.md §9). Given on the welcome page that opens after install. Until
// then the content script leaves Claude alone: no cover, no classifier call.

/** chrome.storage.local key; true once the student turns tot on. */
export const ENABLED_KEY = 'totEnabled';

export async function isEnabled(): Promise<boolean> {
  const { [ENABLED_KEY]: on } = await browser.storage.local.get(ENABLED_KEY);
  return on === true;
}

export async function setEnabled(on: boolean): Promise<void> {
  await browser.storage.local.set({ [ENABLED_KEY]: on });
}

/** Opens the welcome page, where tot is turned on. */
export function openWelcome(): void {
  void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
}
