import { describe, expect, it } from 'vitest';
import { formatFollowUp } from './followUpText';

describe('formatFollowUp', () => {
  it('formats one round', () => {
    expect(formatFollowUp([{ question: 'Q1?', answer: ' maybe the product rule. ' }])).toBe(
      'My initial approach is: maybe the product rule. Please assess whether this reasoning is on track, point out any misconception, and guide the next step without immediately restating the whole solution.',
    );
  });

  it('adds each later round in order and keeps the student\'s words', () => {
    const text = formatFollowUp([
      { question: 'Q1?', answer: 'idk' },
      { question: 'What is the first piece?', answer: 'x^2...' },
      { question: 'And the second?', answer: 'sin(x) i thinkk' },
    ]);
    expect(text).toBe(
      'My initial approach is: idk. When asked "What is the first piece?", I added: x^2. When asked "And the second?", I added: sin(x) i thinkk. Please assess whether this reasoning is on track, point out any misconception, and guide the next step without immediately restating the whole solution.',
    );
  });
});
