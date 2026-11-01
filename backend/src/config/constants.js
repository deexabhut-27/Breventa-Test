export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
export const DIFFICULTY_LABELS = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard/Tricky' };

export const CATEGORIES = [
  'Quantitative Aptitude',
  'Logical Reasoning',
  'Verbal Ability',
  'Analytical Reasoning',
  'General Aptitude',
];

// Categories that contribute to the "reasoning" score; everything else is "aptitude".
export const REASONING_CATEGORIES = ['Logical Reasoning', 'Analytical Reasoning'];

export const EXAM_STATUS = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', CLOSED: 'CLOSED' };

export const ATTEMPT_STATUS = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  TERMINATED: 'TERMINATED',
};

export const SUBMISSION_TYPES = ['MANUAL', 'AUTO_TIMEOUT', 'TERMINATED', 'ADMIN_FORCED'];

// Violations that count toward the tab-switch policy.
export const COUNTED_VIOLATIONS = ['TAB_SWITCH', 'WINDOW_HIDDEN', 'NAVIGATION'];
// Events that are recorded for monitoring but never terminate an attempt on their own.
export const LOGGED_EVENTS = [
  'WINDOW_BLUR',
  'PAGE_UNLOAD',
  'PAGE_RELOAD',
  'NAVIGATION_BLOCKED',
  'HEARTBEAT_LOST',
  'RECONNECTED',
  'SESSION_REPLACED',
  'FULLSCREEN_EXIT',
  'PASTE_ATTEMPT',
  'CONTEXT_MENU',
];
// Screen capture (screenshot keys, print) terminates the attempt immediately, regardless of policy.
export const INSTANT_TERMINATION_VIOLATIONS = ['SCREENSHOT_ATTEMPT'];
// Copying question content: COPY_WARNINGS_ALLOWED warning(s), then the next copy terminates.
export const COPY_VIOLATIONS = ['COPY_ATTEMPT'];
export const COPY_WARNINGS_ALLOWED = 1;
export const VIOLATION_TYPES = [...COUNTED_VIOLATIONS, ...LOGGED_EVENTS, ...INSTANT_TERMINATION_VIOLATIONS, ...COPY_VIOLATIONS];

export const VIOLATION_MODES = { STRICT: 'STRICT', WARNING: 'WARNING' };

// Modules an ADMIN can be granted. SUPER_ADMIN always has every permission plus admin management.
export const PERMISSIONS = ['exams', 'questions', 'students', 'monitoring', 'results', 'candidates', 'admins'];

// Hiring pipeline after the online test.
export const STAGES = ['ONLINE_TEST', 'ROUND_2', 'FINAL_ROUND', 'SELECTED', 'REJECTED'];
export const STAGE_LABELS = {
  ONLINE_TEST: 'Online test',
  ROUND_2: 'Round 2',
  FINAL_ROUND: 'Final round',
  SELECTED: 'Selected',
  REJECTED: 'Rejected',
};
// Where ADVANCE moves a candidate from each active stage.
export const NEXT_STAGE = { ONLINE_TEST: 'ROUND_2', ROUND_2: 'FINAL_ROUND', FINAL_ROUND: 'SELECTED' };
export const ACTIVE_STAGES = Object.keys(NEXT_STAGE);
