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
    // Keep permissions minimal (CLAUDE.md §9). Add the classifier origin here once it exists.
    permissions: ['storage'],
    host_permissions: ['https://claude.ai/*'],
  },
});
