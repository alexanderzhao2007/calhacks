# tot extension

From the repo root:

```sh
npm install        # installs the workspace
npm run dev        # launches Chrome with the extension; profile persists in extension/.chrome-profile
npm test           # vitest unit tests
npm run compile    # typecheck
npm run build      # production build → extension/.output/chrome-mv3 (load unpacked)
```

Mock classifier mode (background worker console or any extension page):

```js
chrome.storage.local.set({ mockMode: 'slow' }) // 'fast' | 'slow' | 'error'
```
