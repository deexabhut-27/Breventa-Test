import { ChevronDown, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { useEffect } from 'react';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

const BUTTON_VARIANTS = {
  primary: 'bg-brand-700 text-white hover:bg-brand-900 disabled:bg-slate-300',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
};

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...props }) {
  const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' };
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, error, hint, required, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      )}
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

const inputBase =
  'w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100';

export function Input({ className, invalid, ...props }) {
  return <input className={cx(inputBase, 'h-10', invalid ? 'border-red-400' : 'border-slate-300', className)} {...props} />;
}

export function Textarea({ className, invalid, ...props }) {
  return <textarea className={cx(inputBase, 'py-2', invalid ? 'border-red-400' : 'border-slate-300', className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  // The native arrow ignores padding and sits flush against the border, so it is hidden
  // (appearance-none) and replaced by an icon with consistent spacing. The control keeps
  // native behaviour: the system picker opens on click, tap and keyboard.
  return (
    <div className={cx('relative', className)}>
      <select className={cx(inputBase, 'h-10 cursor-pointer appearance-none border-slate-300 pr-10 text-ellipsis')} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
    </div>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

const BADGE = {
  gray: 'bg-slate-100 text-slate-700',
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  purple: 'bg-violet-50 text-violet-700',
};
export function Badge({ color = 'gray', children, className }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', BADGE[color], className)}>{children}</span>;
}

export const statusBadge = {
  DRAFT: ['gray', 'Draft'],
  PUBLISHED: ['green', 'Published'],
  CLOSED: ['amber', 'Closed'],
  IN_PROGRESS: ['blue', 'In progress'],
  COMPLETED: ['green', 'Completed'],
  TERMINATED: ['red', 'Terminated'],
};
export function StatusBadge({ status }) {
  const [color, label] = statusBadge[status] || ['gray', status || '—'];
  return <Badge color={color}>{label}</Badge>;
}
export function ResultBadge({ result }) {
  if (!result) return <Badge>—</Badge>;
  if (result.status === 'TERMINATED') {
    return (
      <span className="inline-flex flex-wrap gap-1">
        <Badge color="red">Terminated</Badge>
        {result.passed ? <Badge color="green">Pass</Badge> : <Badge color="amber">Fail</Badge>}
      </span>
    );
  }
  return result.passed ? <Badge color="green">Pass</Badge> : <Badge color="amber">Fail</Badge>;
}

export function Spinner({ className, label }) {
  return (
    <div className={cx('flex items-center justify-center gap-2 py-10 text-sm text-slate-500', className)}>
      <Loader2 className="h-5 w-5 animate-spin" /> {label || 'Loading…'}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && <Icon className="mb-3 h-10 w-10 text-slate-300" />}
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {message}
      {onRetry && (
        <button type="button" onClick={onRetry} className="ml-3 font-medium underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = 'brand', hint }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-sky-50 text-sky-700',
    purple: 'bg-violet-50 text-violet-700',
  };
  // Compact on phones so stat boxes fit two per row.
  return (
    <Card className="p-3 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs leading-snug text-slate-500 sm:text-sm">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
          {hint && <p className="mt-1 text-[11px] leading-snug text-slate-500 sm:text-xs">{hint}</p>}
        </div>
        {Icon && (
          <div className={cx('shrink-0 rounded-lg p-1.5 sm:p-2.5', tones[tone])}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        )}
      </div>
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className={cx('w-full rounded-xl bg-white shadow-xl', widths[size])}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          {onClose && (
            <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', variant = 'danger', loading, onConfirm, onClose, children }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
      {children}
    </Modal>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.total, meta.page * meta.limit);
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
      <span>
        Showing <b>{from}</b>–<b>{to}</b> of <b>{meta.total}</b>
      </span>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          Prev
        </Button>
        <span className="px-2">
          {meta.page} / {meta.totalPages}
        </span>
        <Button variant="secondary" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function Table({ children }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100 text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, className, ...p }) => (
  <th className={cx('whitespace-nowrap bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500', className)} {...p}>
    {children}
  </th>
);
export const Td = ({ children, className, ...p }) => (
  <td className={cx('px-4 py-3 align-middle text-slate-700', className)} {...p}>
    {children}
  </td>
);

export function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-emerald-500' : 'bg-slate-300')}
    >
      <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  );
}

// ---------- Responsive lists: full table on wide screens, cards on phones/tablets ----------
const SHOW_TABLE = { sm: 'hidden sm:block', md: 'hidden md:block', lg: 'hidden lg:block', xl: 'hidden xl:block' };
const SHOW_CARDS = { sm: 'sm:hidden', md: 'md:hidden', lg: 'lg:hidden', xl: 'xl:hidden' };

/** Renders `table` from the breakpoint up and `cards` below it, so nothing scrolls sideways on phones. */
export function ResponsiveList({ breakpoint = 'lg', table, cards }) {
  return (
    <>
      <div className={SHOW_TABLE[breakpoint]}>{table}</div>
      <div className={cx('space-y-3 p-3 sm:p-4', SHOW_CARDS[breakpoint])}>{cards}</div>
    </>
  );
}

/** A record shown as a card: title row with optional badge, key/value grid, and an action row. */
export function DataCard({ title, subtitle, badge, children, actions, className }) {
  return (
    <div className={cx('rounded-xl border border-slate-200 bg-white p-4 shadow-sm', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold break-words text-slate-900">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs break-words text-slate-500">{subtitle}</div>}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      {children && <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">{children}</dl>}
      {actions && <div className="mt-3 flex flex-wrap items-center justify-end gap-1 border-t border-slate-100 pt-3">{actions}</div>}
    </div>
  );
}

/** One label/value pair inside a DataCard. `full` spans both columns. */
export function KV({ label, children, full = false }) {
  return (
    <div className={cx('min-w-0', full && 'col-span-2')}>
      <dt className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-800">{children}</dd>
    </div>
  );
}
