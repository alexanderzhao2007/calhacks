// Pure follow-up formatting (CLAUDE.md §4 example). Uses the student's exact words.

export function formatFollowUp(studentReasoning: string): string {
  return [
    'I want to work through my earlier question rather than just receive a finished solution.',
    '',
    'My initial approach (my own words):',
    `"${studentReasoning.trim()}"`,
    '',
    'Please evaluate whether this reasoning is on track, point out any misconception, and help me identify the next step with a hint or question. Avoid immediately restating the complete solution unless I explicitly ask for it.',
  ].join('\n');
}
