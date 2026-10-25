import { resolve } from 'node:path';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // `npm run dev` does not open its own browser: load .output/chrome-mv3-dev
  // unpacked in your normal Chrome once and it live-reloads from there.
  // Set disabled to false to get a separate dev Chrome instead.
  webExt: {
    disabled: true,
    chromiumArgs: [`--user-data-dir=${resolve(__dirname, '.chrome-profile')}`],
    startUrls: ['https://claude.ai/'],
  },
  // The toolbar popup loads its code from this dev server during `npm run dev`.
  // Not 3000: other local apps (e.g. Next.js) often hold it, and the popup then
  // fetches their files and renders blank.
  dev: {
    server: { port: 3207 },
  },
  alias: {
    '@shared': resolve(__dirname, '../shared'),
  },
  manifest: {
    name: 'tot',
    description:
      'Train of thought: a quick nudge to try your own reasoning before reading the AI answer.',
    // Keep permissions minimal (CLAUDE.md §9): claude.ai, the classifier origin,
    // and SpacetimeDB for the opt-in friends board (local dev server + Maincloud).
    // Swap the localhost entries for the deployed origins later.
    permissions: ['storage'],
    host_permissions: [
      'https://claude.ai/*',
      'http://localhost:8787/*',
      'http://127.0.0.1:3100/*',
      'https://maincloud.spacetimedb.com/*',
    ],
    // Brand fonts are registered on claude.ai's document for the popup.
    web_accessible_resources: [{ resources: ['fonts/*.woff2'], matches: ['https://claude.ai/*'] }],
  },
});
