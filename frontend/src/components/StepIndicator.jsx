import { Check } from 'lucide-react';
import { cx } from './ui.jsx';

const STEPS = ['Company', 'Your details', 'Exam & instructions'];

/** Progress through the student flow: 1 company → 2 student details → 3 exam details & instructions. */
export default function StepIndicator({ current }) {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          // On phones the active step gets the extra width so its label is never cut off.
          <li key={label} className={cx('flex min-w-0 items-center gap-2', active ? 'flex-[3] sm:flex-1' : 'flex-1')} aria-current={active ? 'step' : undefined}>
            <span
              className={cx(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                done && 'bg-brand-500 text-white',
                active && 'bg-brand-700 text-white ring-4 ring-brand-100',
                !done && !active && 'bg-slate-200 text-slate-500',
              )}
            >
              {done ? <Check className="h-4 w-4" /> : step}
            </span>
            {/* Labels: only the active step on phones, all steps from small screens up */}
            <span className={cx('text-xs font-medium whitespace-nowrap sm:text-sm', active ? 'text-slate-900' : 'hidden text-slate-500 sm:inline')}>{label}</span>
            {step < STEPS.length && <span className={cx('h-px min-w-3 flex-1', done ? 'bg-brand-500' : 'bg-slate-300')} />}
          </li>
        );
      })}
    </ol>
  );
}
