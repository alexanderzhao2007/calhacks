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
    composing: 'Turning your thinking into a message for Claude…',
    pasting: "Next, your thinking goes into Claude's message box. Press Send when you want Claude to build on it.",
    nothing: "Claude's answer is ready.",
    close: 'Close',
    closingIn: (s: number) => `Closing in ${s}s`,
  },
} as const;
