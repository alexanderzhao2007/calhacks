// Per-turn state machine (CLAUDE.md §8). Pure: no DOM, no timers, no network.
// Callers feed it events and execute the returned effects. Every ambiguous or
// failing path resolves to a reveal effect (fail open).

import {
  ClassifyResponseSchema,
  type AttachmentMeta,
  type SidebarRequest,
  type SidebarResult,
} from '@shared/contracts';

export type TurnPhase =
  | 'CLASSIFYING'
  | 'INTERVENING'
  | 'SUBMIT_FOLLOWUP'
  | 'FOLLOWUP_SENT'
  | 'DONE';

export type Turn = {
  turnId: string;
  chatId: string; // NEW_CHAT until Claude assigns /chat/<uuid>
  prompt: string;
  attachments: AttachmentMeta[];
  phase: TurnPhase;
  startedAt: number;
  expectedFollowUp?: string;
};

export type Effect =
  | { type: 'reveal'; turnId: string; reason: RevealReason }
  | { type: 'cancelDeadline'; turnId: string }
  | { type: 'openSidebar'; request: SidebarRequest }
  | { type: 'closeSidebar'; turnId: string }
  | { type: 'submitFollowUp'; turnId: string; studentReasoning: string }
  | { type: 'revealAll'; reason: 'navigation' };

export type RevealReason = 'allow' | 'uncertain' | 'invalid' | 'error' | 'timeout' | 'skip';

export const NEW_CHAT = 'new';

/** `/chat/<id>` → id; anything else on claude.ai (e.g. `/new`, `/`) → NEW_CHAT. */
export function chatIdFromPath(pathname: string): string {
  const m = pathname.match(/^\/chat\/([^/?#]+)/);
  return m?.[1] ?? NEW_CHAT;
}

/**
 * Whitespace-free form for matching our follow-up in the thread. Claude renders
 * paragraphs as separate <p> elements, so textContent drops line breaks entirely.
 */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, '');
}

export class TurnCoordinator {
  private turns = new Map<string, Turn>();

  constructor(private chatId: string) {}

  get currentChatId() {
    return this.chatId;
  }

  getTurn(turnId: string): Turn | undefined {
    return this.turns.get(turnId);
  }

  /**
   * A send was detected. Returns null if this send is tot's own follow-up,
   * which must not be covered or classified.
   */
  startTurn(input: {
    turnId: string;
    prompt: string;
    attachments?: AttachmentMeta[];
    now: number;
  }): Turn | null {
    if (this.isExpectedFollowUp(input.prompt)) return null;
    const turn: Turn = {
      turnId: input.turnId,
      chatId: this.chatId,
      prompt: input.prompt,
      attachments: input.attachments ?? [],
      phase: 'CLASSIFYING',
      startedAt: input.now,
    };
    this.turns.set(turn.turnId, turn);
    return turn;
  }

  /** Raw classifier output (or failure). Validated here before it can affect UI. */
  onClassifyResult(
    turnId: string,
    result: { ok: true; res: unknown } | { ok: false; error: string },
  ): Effect[] {
    const turn = this.turns.get(turnId);
    if (!turn || turn.phase !== 'CLASSIFYING') return []; // stale, duplicate, or timed out

    if (!result.ok) return this.finish(turn, 'error');

    const parsed = ClassifyResponseSchema.safeParse(result.res);
    if (!parsed.success || parsed.data.requestId !== turnId) return this.finish(turn, 'invalid');

    const res = parsed.data;
    if (res.decision === 'allow') return this.finish(turn, 'allow');
    if (res.decision === 'uncertain') return this.finish(turn, 'uncertain');

    turn.phase = 'INTERVENING';
    return [
      { type: 'cancelDeadline', turnId },
      {
        type: 'openSidebar',
        request: { turnId, question: res.question!, originalPrompt: turn.prompt },
      },
    ];
  }

  /** The single send-time deadline fired. Only matters while still classifying. */
  onDeadline(turnId: string): Effect[] {
    const turn = this.turns.get(turnId);
    if (!turn || turn.phase !== 'CLASSIFYING') return [];
    return this.finish(turn, 'timeout');
  }

  onSidebarResult(result: SidebarResult): Effect[] {
    const turn = this.turns.get(result.turnId);
    if (!turn || turn.phase !== 'INTERVENING') return [];

    if (result.action === 'skip') {
      return [{ type: 'closeSidebar', turnId: turn.turnId }, ...this.finish(turn, 'skip')];
    }
    turn.phase = 'SUBMIT_FOLLOWUP';
    return [
      { type: 'closeSidebar', turnId: turn.turnId },
      { type: 'submitFollowUp', turnId: turn.turnId, studentReasoning: result.studentReasoning },
    ];
  }

  /** Call right before clicking Send, with the exact text placed in the composer. */
  markFollowUpPending(turnId: string, text: string): boolean {
    const turn = this.turns.get(turnId);
    if (!turn || turn.phase !== 'SUBMIT_FOLLOWUP' || turn.expectedFollowUp) return false;
    turn.expectedFollowUp = normalizeText(text);
    return true;
  }

  /**
   * A new user message appeared in the thread. Confirms a follow-up if it
   * contains our text (Claude adds an sr-only "You said:" prefix).
   */
  onUserMessageObserved(text: string): string | null {
    const norm = normalizeText(text);
    for (const turn of this.turns.values()) {
      if (turn.phase === 'SUBMIT_FOLLOWUP' && turn.expectedFollowUp && norm.includes(turn.expectedFollowUp)) {
        turn.phase = 'FOLLOWUP_SENT';
        return turn.turnId;
      }
    }
    return null;
  }

  /** User explicitly revealed a held original answer. */
  onRevealRequested(turnId: string): Effect[] {
    const turn = this.turns.get(turnId);
    if (!turn || turn.phase === 'DONE') return [];
    const closing: Effect[] =
      turn.phase === 'INTERVENING' ? [{ type: 'closeSidebar', turnId }] : [];
    return [...closing, ...this.finish(turn, 'skip')];
  }

  /**
   * URL changed. `/new → /chat/<id>` is Claude assigning an ID to the chat we
   * are in, not navigation. Anything else between chats clears all turns.
   */
  onUrlChange(pathname: string): Effect[] {
    const next = chatIdFromPath(pathname);
    if (next === this.chatId) return [];
    if (this.chatId === NEW_CHAT && next !== NEW_CHAT) {
      for (const turn of this.turns.values()) if (turn.chatId === NEW_CHAT) turn.chatId = next;
      this.chatId = next;
      return [];
    }
    this.chatId = next;
    this.turns.clear();
    return [{ type: 'revealAll', reason: 'navigation' }];
  }

  /** True while any turn still needs the global pending cover. */
  hasPendingClassification(): boolean {
    for (const t of this.turns.values()) if (t.phase === 'CLASSIFYING') return true;
    return false;
  }

  private isExpectedFollowUp(prompt: string): boolean {
    const norm = normalizeText(prompt);
    for (const t of this.turns.values()) {
      if (t.phase === 'SUBMIT_FOLLOWUP' && t.expectedFollowUp === norm) return true;
    }
    return false;
  }

  private finish(turn: Turn, reason: RevealReason): Effect[] {
    turn.phase = 'DONE';
    return [{ type: 'reveal', turnId: turn.turnId, reason }];
  }
}
