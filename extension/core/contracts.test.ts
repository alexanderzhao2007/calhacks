import { describe, expect, it } from 'vitest';
import { ClassifyResponseSchema, SidebarResultSchema } from '@shared/contracts';

describe('ClassifyResponseSchema', () => {
  it('requires a question only for intervene', () => {
    const base = { requestId: 'r', reason: 'x' };
    expect(ClassifyResponseSchema.safeParse({ ...base, decision: 'allow', question: null }).success).toBe(true);
    expect(ClassifyResponseSchema.safeParse({ ...base, decision: 'allow', question: 'q' }).success).toBe(false);
    expect(ClassifyResponseSchema.safeParse({ ...base, decision: 'intervene', question: 'q?' }).success).toBe(true);
    expect(ClassifyResponseSchema.safeParse({ ...base, decision: 'intervene', question: '  ' }).success).toBe(false);
    expect(ClassifyResponseSchema.safeParse({ ...base, decision: 'block', question: null }).success).toBe(false);
  });
});

describe('SidebarResultSchema', () => {
  it('accepts continue and skip', () => {
    expect(SidebarResultSchema.safeParse({ action: 'skip', turnId: 't' }).success).toBe(true);
    expect(
      SidebarResultSchema.safeParse({ action: 'continue', turnId: 't', studentReasoning: 'idea' }).success,
    ).toBe(true);
    expect(SidebarResultSchema.safeParse({ action: 'continue', turnId: 't' }).success).toBe(false);
  });
});
