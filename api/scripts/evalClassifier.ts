// Runs the labeled prompt-1 fixtures against the real model and reports
// decision accuracy and latency. Costs real API calls (one per fixture).
// Usage: npm run eval -w api [-- path/to/fixtures.json]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import type { AttachmentMeta, ContextTurn, Decision, Mode } from '../../shared/contracts.ts';
import { classify, DEFAULT_MODEL, loadSystemPrompt } from '../classifier.ts';

type Fixture = {
  prompt: string;
  attachments?: AttachmentMeta[];
  conversationContext?: ContextTurn[];
  decision: Decision;
  mode?: Mode;
};

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // No .env file: rely on the real environment.
}

const fixturesPath =
  process.argv[2] ?? fileURLToPath(new URL('../../tests/classifier/prompt1.fixtures.json', import.meta.url));
const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')) as Fixture[];
const client = new Anthropic();
const systemPrompt = loadSystemPrompt();
const model = process.env.TOT_MODEL || DEFAULT_MODEL;
// Generous timeout here: we are measuring latency, not enforcing the cover budget.
const timeoutMs = 10_000;

const latencies: number[] = [];
let passed = 0;

for (const [i, f] of fixtures.entries()) {
  const { res, latencyMs } = await classify(
    {
      requestId: `eval-${i}`,
      prompt: f.prompt,
      conversationContext: f.conversationContext,
      attachments: f.attachments ?? [],
      attachmentContentsAvailable: false,
    },
    { client, systemPrompt, model, timeoutMs },
  );
  latencies.push(latencyMs);
  const ok = res.decision === f.decision && (f.mode === undefined || res.mode === f.mode);
  if (ok) passed++;
  const got = `${res.decision}${res.mode && res.mode !== 'none' ? `/${res.mode}` : ''}`;
  const want = `${f.decision}${f.mode && f.mode !== 'none' ? `/${f.mode}` : ''}`;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(latencyMs).padStart(5)} ms  want ${want.padEnd(20)} got ${got.padEnd(20)} ${res.reason}`);
  console.log(`      ${f.prompt.slice(0, 90)}`);
  if (res.question) console.log(`      Q: ${res.question}`);
}

const sorted = [...latencies].sort((a, b) => a - b);
const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
console.log(`\n${passed}/${fixtures.length} passed · model ${model} · p50 ${pct(50)} ms · p95 ${pct(95)} ms`);
process.exitCode = passed === fixtures.length ? 0 : 1;
