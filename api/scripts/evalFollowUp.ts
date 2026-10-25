// Runs the labeled prompt-2 fixtures against the real model and reports
// decision accuracy and latency. Costs real API calls (one per fixture below
// the follow-up cap). Usage: npm run eval:follow-up -w api [-- path/to/fixtures.json]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import type { FollowUpRequest } from '../../shared/contracts.ts';
import { DEFAULT_MODEL } from '../classifier.ts';
import { judgeAnswer, loadFollowUpPrompt } from '../followUp.ts';

type Fixture = Omit<FollowUpRequest, 'requestId' | 'attachments'> & { decision: 'pass' | 'follow_up' };

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // No .env file: rely on the real environment.
}

const fixturesPath =
  process.argv[2] ?? fileURLToPath(new URL('../../tests/classifier/prompt2.fixtures.json', import.meta.url));
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')) as Fixture[];
const client = new Anthropic();
const systemPrompt = loadFollowUpPrompt();
const model = process.env.TOT_MODEL || DEFAULT_MODEL;

let passed = 0;
for (const [i, f] of fixtures.entries()) {
  const { decision, ...rest } = f;
  const { res, latencyMs } = await judgeAnswer(
    { ...rest, requestId: `eval-${i}`, attachments: [] },
    { client, systemPrompt, model, timeoutMs: 10_000 },
  );
  const ok = res.decision === decision;
  if (ok) passed++;
  const last = f.qaHistory[f.qaHistory.length - 1].answer;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(latencyMs).padStart(5)} ms  want ${decision.padEnd(10)} got ${res.decision.padEnd(10)} ${res.reason}`);
  console.log(`      answer: ${last.slice(0, 80)}  (follow-ups used: ${f.followUpsUsed})`);
  if (res.question) console.log(`      Q: ${res.question}`);
}
console.log(`\n${passed}/${fixtures.length} passed · model ${model}`);
process.exitCode = passed === fixtures.length ? 0 : 1;
