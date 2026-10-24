// Minimal HTTP wrapper around the classifier: POST /classify, GET /health.
// Plain node:http so it runs locally and ports to any serverless host.
// Logs metadata only, never prompt text (CLAUDE.md §9).

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { ClassifyRequestSchema } from '../shared/contracts.ts';
import { classify, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS, loadSystemPrompt } from './classifier.ts';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  // No .env file: rely on the real environment.
}

const PORT = Number(process.env.PORT) || 8787;
const MODEL = process.env.TOT_MODEL || DEFAULT_MODEL;
const TIMEOUT_MS = Number(process.env.TOT_CLASSIFY_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
const ALLOWED_ORIGINS = (process.env.TOT_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const MAX_BODY_BYTES = 64 * 1024;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[tot-api] ANTHROPIC_API_KEY is not set; every classify call will fail open.');
}

const client = new Anthropic();
const systemPrompt = loadSystemPrompt();

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function applyCors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (req, res) => {
  applyCors(req, res);
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;

  if (req.method === 'OPTIONS') return void res.writeHead(204).end();
  if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true, model: MODEL });
  if (req.method !== 'POST' || path !== '/classify') return send(res, 404, { error: 'not found' });

  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: 'invalid JSON body' });
  }
  const parsed = ClassifyRequestSchema.safeParse(body);
  if (!parsed.success) return send(res, 400, { error: 'invalid ClassifyRequest' });

  const { res: result, latencyMs, cacheReadTokens } = await classify(parsed.data, {
    client,
    systemPrompt,
    model: MODEL,
    timeoutMs: TIMEOUT_MS,
  });
  console.log(
    JSON.stringify({
      requestId: result.requestId,
      decision: result.decision,
      mode: result.mode,
      reason: result.reason,
      latencyMs,
      cacheReadTokens,
    }),
  );
  send(res, 200, result);
});

server.listen(PORT, () => {
  console.log(`[tot-api] listening on http://localhost:${PORT} (model ${MODEL}, timeout ${TIMEOUT_MS} ms)`);
});
