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
  // Toolbar popup (social train). New, not in the handoff; needs a copy review.
  train: {
    title: 'Thought train',
    connecting: 'Connecting…',
    offline: "Can't reach the train right now. tot still works on Claude.",
    joinLead: 'Ride one train with your friends. Every time you answer tot’s question, your group moves closer to its weekly goal.',
    privacy:
      "Your group sees your name and the miles you earn. Never what you asked Claude or what you wrote. Skips aren't counted.",
    nameLabel: 'Display name',
    startGroup: 'Start a group',
    joinGroup: 'Join with code',
    groupNameLabel: 'Group name',
    goalLabel: 'Weekly goal',
    codeLabel: 'Group code',
    codePlaceholder: '6 characters',
    startCta: 'Start the train',
    joinCta: 'Hop on',
    miles: (n: number) => `${n} mi`,
    thisWeek: 'this week',
    resetsMonday: 'Resets Monday',
    progressLabel: (miles: number, goal: number) => `${miles} of ${goal} miles this week`,
    arrived: (goal: number) => `Arrived! Your group thought its way through ${goal} miles this week.`,
    conductor: (name: string) => `Today's conductor 🎩 ${name}`,
    noConductor: 'No conductor yet today. Answer a tot question to take the hat.',
    onBoard: (names: string[]) => `On board: ${names.join(', ')}`,
    you: (name: string) => `${name} (you)`,
    codeTitle: 'Invite friends',
    codeNote: 'Up to 8 people per train.',
    copy: 'Copy',
    copied: 'Copied',
    leaveGroup: 'Leave this group',
    leaveGroupConfirm: 'Leave this group? Your miles stay yours.',
    leave: 'Leave the train',
    leaveConfirm: 'Leave the train? This deletes your name, group membership and counts.',
    genericError: 'Something went wrong. Try again.',
    activityTitle: 'Your activity (only you see this)',
    today: 'Today',
    last7: '7 days',
    activity: { prompts: 'Prompts sent', questions: 'tot questions', answers: 'Answered', miles: 'Miles' },
  },
} as const;
