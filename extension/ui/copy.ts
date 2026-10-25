// Every UI string. Most come from tot-handoff content/copy.json; `thanks` is new
// (not in the handoff yet) and needs a copy review.

export const COPY = {
  popup: {
    fieldPlaceholder: 'Type your thinking',
    fieldAriaLabel: 'Your thinking',
    submit: 'Submit',
    submitHint: 'or press Enter',
    skip: 'Skip',
    reason: 'Try thinking yourself on this one.', // why tot is asking; not in the handoff copy yet
  },
  skipConfirm: {
    title: 'See the response now?',
    stay: 'Keep thinking',
    leave: 'Show answer',
  },
  followUp: {
    historyAriaLabel: 'Previous questions and answers',
  },
  thanks: {
    title: 'Thanks for thinking it through.',
    composing: 'Turning your answers into a short note for Claude, so it knows how you approached this…',
    pasting: 'Your answers are now a short note for Claude in your message box. Edit it if you like, then press Send.',
    nothing: 'Not enough to pass on to Claude this time, so your message box stays empty.',
    close: 'Close',
    closingIn: (s: number) => `Closing in ${s}s`,
  },
} as const;
