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
  alias: {
    '@shared': resolve(__dirname, '../shared'),
  },
  manifest: {
    name: 'tot',
    description:
      'Train of thought: a quick nudge to try your own reasoning before reading the AI answer.',
    // Keep permissions minimal (CLAUDE.md §9): claude.ai plus the classifier
    // origin. Swap the localhost entry for the deployed API origin later.
    permissions: ['storage'],
    host_permissions: ['https://claude.ai/*', 'http://localhost:8787/*'],
    // Brand fonts are registered on claude.ai's document for the popup.
    web_accessible_resources: [{ resources: ['fonts/*.woff2'], matches: ['https://claude.ai/*'] }],
  },
});
