import { GraduationCap } from 'lucide-react';

export default function StudentShell({ title, children, wide = false }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <div className="rounded-lg bg-brand-700 p-2">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">University Placement Examination</p>
            <p className="truncate font-semibold text-slate-900">{title || '…'}</p>
          </div>
        </div>
      </header>
      <main className={`mx-auto px-4 py-8 ${wide ? 'max-w-4xl' : 'max-w-xl'}`}>{children}</main>
    </div>
  );
}
