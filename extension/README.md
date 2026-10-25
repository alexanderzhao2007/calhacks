# tot extension

From the repo root:

```sh
npm install        # installs the workspace
npm start          # classifier API + extension together (auto-runs on folder open in VS Code)
npm run dev        # extension only: dev build with live reload (load extension/.output/chrome-mv3-dev unpacked in Chrome once)
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

## Turning tot on

After install, tot opens a welcome page (`entrypoints/welcome`). Its **Turn on tot** button is the one-time consent to send Claude messages to the classifier (`core/consent.ts`, storage key `totEnabled`). Until then the content script lets every query send through untouched: no cover, no classifier call, nothing counted. Reloading the unpacked extension keeps the setting; a fresh profile asks again. The toolbar popup shows a "Turn it on" link while tot is off.
