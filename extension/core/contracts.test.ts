import { describe, expect, it } from 'vitest';
import { ClassifyResponseSchema, FollowUpResponseSchema, SidebarResultSchema } from '@shared/contracts';

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
  it('accepts answer and skip', () => {
    expect(SidebarResultSchema.safeParse({ action: 'skip', turnId: 't' }).success).toBe(true);
    expect(SidebarResultSchema.safeParse({ action: 'answer', turnId: 't', answer: 'idea' }).success).toBe(true);
    expect(SidebarResultSchema.safeParse({ action: 'answer', turnId: 't' }).success).toBe(false);
  });
});

describe('FollowUpResponseSchema', () => {
  it('requires a question only for follow_up', () => {
    const base = { requestId: 'r', reason: 'x' };
    expect(FollowUpResponseSchema.safeParse({ ...base, decision: 'pass', question: null }).success).toBe(true);
    expect(FollowUpResponseSchema.safeParse({ ...base, decision: 'pass', question: 'q' }).success).toBe(false);
    expect(FollowUpResponseSchema.safeParse({ ...base, decision: 'follow_up', question: 'q?' }).success).toBe(true);
    expect(FollowUpResponseSchema.safeParse({ ...base, decision: 'follow_up', question: ' ' }).success).toBe(false);
  });
});
