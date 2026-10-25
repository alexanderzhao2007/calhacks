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
  // Toolbar popup (friends board). New, not in the handoff; needs a copy review.
  friends: {
    title: 'Thought first',
    connecting: 'Connecting…',
    offline: "Can't reach the friends board right now. tot still works on Claude.",
    joinLead: 'See how often you and your friends think first, and keep each other going.',
    privacy:
      "Friends see your name and how many times you answered tot's question. Never what you asked Claude or what you wrote. Skips aren't counted.",
    nameLabel: 'Display name',
    join: 'Join',
    yourStats: 'Your stats',
    dayStreak: 'day streak',
    streakShort: (n: number) => `${n}d`,
    thisWeek: 'this week',
    boardTitle: 'This week',
    boardNote: 'Times each person answered tot’s question in the last 7 days.',
    you: (name: string) => `${name} (you)`,
    noFriends: 'Share your code to add a friend.',
    yourCode: 'Your friend code',
    copy: 'Copy',
    copied: 'Copied',
    friendCodeLabel: "Friend's code",
    friendCodePlaceholder: "Friend's code",
    add: 'Add',
    leave: 'Leave the friends board',
    leaveConfirm: 'Leave the friends board? This deletes your name, friends and streaks.',
    genericError: 'Something went wrong. Try again.',
  },
} as const;
