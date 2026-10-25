// Shared contracts between the extension (Person 1), classifier API (Person 2),
// and sidebar UI (Person 3). Source: CLAUDE.md §7.
// Changes require agreement across owners — do not edit silently.

import { z } from 'zod';

export const AttachmentMetaSchema = z.object({
  name: z.string().optional(),
  mimeType: z.string().optional(),
});
export type AttachmentMeta = z.infer<typeof AttachmentMetaSchema>;

// Recent turns before the submitted message (TOT_PROMPTS.md §4). Optional so
// existing callers keep working; the classifier uses at most the last 4.
export const ContextTurnSchema = z.object({
  role: z.enum(['student', 'assistant']),
  text: z.string(),
});
export type ContextTurn = z.infer<typeof ContextTurnSchema>;

export const ClassifyRequestSchema = z.object({
  requestId: z.string().min(1),
  prompt: z.string(),
  conversationContext: z.array(ContextTurnSchema).optional(),
  attachments: z.array(AttachmentMetaSchema),
  attachmentContentsAvailable: z.literal(false), // MVP: do not parse attachments
});
export type ClassifyRequest = z.infer<typeof ClassifyRequestSchema>;

export const DecisionSchema = z.enum(['allow', 'intervene', 'uncertain']);
export type Decision = z.infer<typeof DecisionSchema>;

export const ModeSchema = z.enum(['solve', 'brainstorm', 'none']);
export type Mode = z.infer<typeof ModeSchema>;

export const ClassifyResponseSchema = z
  .object({
    requestId: z.string().min(1),
    decision: DecisionSchema,
    reason: z.string(),
    question: z.string().nullable(), // nonempty only if intervene
    mode: ModeSchema.optional(), // 'solve' | 'brainstorm' only if intervene
  })
  .refine(
    (r) =>
      r.decision === 'intervene'
        ? typeof r.question === 'string' && r.question.trim().length > 0
        : r.question === null,
    { message: 'question must be nonempty for intervene and null otherwise' },
  );
export type ClassifyResponse = z.infer<typeof ClassifyResponseSchema>;

export const QAPairSchema = z.object({
  question: z.string(), // what tot asked
  answer: z.string(), // what the student typed
});
export type QAPair = z.infer<typeof QAPairSchema>;

export const SidebarRequestSchema = z.object({
  turnId: z.string().min(1),
  question: z.string().min(1),
  originalPrompt: z.string(),
  history: z.array(QAPairSchema).optional(), // earlier rounds, shown above a follow-up question
});
export type SidebarRequest = z.infer<typeof SidebarRequestSchema>;

// 'answer' submits the student's reply to the question currently shown. The
// coordinator decides (via /follow-up) whether to ask again or hand off.
export const SidebarResultSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('answer'),
    turnId: z.string().min(1),
    answer: z.string().min(1),
  }),
  z.object({ action: z.literal('skip'), turnId: z.string().min(1) }),
]);
export type SidebarResult = z.infer<typeof SidebarResultSchema>;

// ---- Follow-up judging (TOT_PROMPTS.md §6) ---------------------------------

export const MAX_FOLLOW_UPS = 2;

export const FollowUpRequestSchema = z.object({
  requestId: z.string().min(1),
  mode: z.enum(['solve', 'brainstorm']),
  prompt: z.string(), // the original student message
  conversationContext: z.array(ContextTurnSchema).optional(),
  attachments: z.array(AttachmentMetaSchema),
  qaHistory: z.array(QAPairSchema).min(1), // last entry is the answer being judged
  followUpsUsed: z.number().int().min(0),
});
export type FollowUpRequest = z.infer<typeof FollowUpRequestSchema>;

export const FollowUpResponseSchema = z
  .object({
    requestId: z.string().min(1),
    decision: z.enum(['pass', 'follow_up']),
    reason: z.string(),
    question: z.string().nullable(), // nonempty only if follow_up
  })
  .refine(
    (r) =>
      r.decision === 'follow_up'
        ? typeof r.question === 'string' && r.question.trim().length > 0
        : r.question === null,
    { message: 'question must be nonempty for follow_up and null otherwise' },
  );
export type FollowUpResponse = z.infer<typeof FollowUpResponseSchema>;
