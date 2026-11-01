export const CATEGORIES = ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 'Analytical Reasoning', 'General Aptitude'];
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
export const DIFFICULTY_LABELS = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard/Tricky' };

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');

export function fmtDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${m}m` : `${m}m ${String(sec).padStart(2, '0')}s`;
}

export function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export const toLocalInput = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 16);
};

export const humanize = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export const examLink = (slug) => `${window.location.origin}/exam/${slug}`;

// ---------- Selection pipeline ----------
export const STAGES = ['ONLINE_TEST', 'ROUND_2', 'FINAL_ROUND', 'SELECTED', 'REJECTED'];
export const STAGE_LABELS = { ONLINE_TEST: 'Online test', ROUND_2: 'Round 2', FINAL_ROUND: 'Final round', SELECTED: 'Selected', REJECTED: 'Rejected' };
export const STAGE_COLORS = { ONLINE_TEST: 'gray', ROUND_2: 'blue', FINAL_ROUND: 'purple', SELECTED: 'green', REJECTED: 'red' };
// Label of the "move forward" decision in each active stage.
export const ADVANCE_LABELS = { ONLINE_TEST: 'Shortlist for Round 2', ROUND_2: 'Qualified for final round', FINAL_ROUND: 'Mark as selected' };

export function fmtAgo(d) {
  if (!d) return '—';
  const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtDateTime(d);
}
