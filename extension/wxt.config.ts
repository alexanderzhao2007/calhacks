import { resolve } from 'node:path';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
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
  },
});
