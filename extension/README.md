# tot extension

From the repo root:

```sh
npm install        # installs the workspace
npm run dev        # launches Chrome with the extension; profile persists in extension/.chrome-profile
npm test           # vitest unit tests
npm run compile    # typecheck
npm run build      # production build → extension/.output/chrome-mv3 (load unpacked)
```

The background worker calls the live classifier at `http://localhost:8787/classify`
by default. Start it from the repo root with `npm run dev:api` (needs `ANTHROPIC_API_KEY`
in the root `.env`). Override the URL with `WXT_TOT_API_URL` in `extension/.env` (also
update `host_permissions` in `wxt.config.ts`).

Switch to a mock classifier (background worker console or any extension page):

```js
chrome.storage.local.set({ mockMode: 'slow' }) // 'live' (default) | 'fast' | 'slow' | 'error'
```
