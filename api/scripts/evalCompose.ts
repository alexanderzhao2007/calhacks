// Runs the labeled prompt-3 fixtures against the real model, checks the
// paste/skip decision, and prints each message for review. Costs one API call
// per fixture. Usage: npm run eval:compose -w api [-- path/to/fixtures.json]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import type { ComposeRequest } from '../../shared/contracts.ts';
import { DEFAULT_MODEL } from '../classifier.ts';
import { composeFollowUp, loadComposePrompt } from '../compose.ts';

type Fixture = Omit<ComposeRequest, 'requestId' | 'attachments'> & { decision: 'paste' | 'skip' };

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // No .env file: rely on the real environment.
}

const fixturesPath =
  process.argv[2] ?? fileURLToPath(new URL('../../tests/classifier/prompt3.fixtures.json', import.meta.url));
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')) as Fixture[];
const client = new Anthropic();
const systemPrompt = loadComposePrompt();
const model = process.env.TOT_MODEL || DEFAULT_MODEL;

let passed = 0;
for (const [i, f] of fixtures.entries()) {
  const { decision, ...rest } = f;
  const { res, latencyMs } = await composeFollowUp(
    { ...rest, requestId: `eval-${i}`, attachments: [] },
    { client, systemPrompt, model, timeoutMs: 10_000 },
  );
  const ok = res.decision === decision;
  if (ok) passed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(latencyMs).padStart(5)} ms  want ${decision.padEnd(6)} got ${res.decision.padEnd(8)} ${res.reason}`);
  console.log(`      prompt: ${f.prompt.slice(0, 80)}`);
  if (res.message) console.log(`      message: ${res.message}`);
}
console.log(`\n${passed}/${fixtures.length} decisions matched · model ${model}`);
process.exitCode = passed === fixtures.length ? 0 : 1;
