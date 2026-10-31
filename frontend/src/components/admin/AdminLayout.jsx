import {
  Activity,
  BarChart3,
  BookOpen,
  ClipboardList,
  FileWarning,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext.jsx';
import { cx } from '../ui.jsx';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/exams', label: 'Examinations', icon: ClipboardList, permission: 'exams' },
  { to: '/admin/questions', label: 'Question Bank', icon: BookOpen, permission: 'questions' },
  { to: '/admin/students', label: 'Students', icon: Users, permission: 'students' },
  { to: '/admin/monitoring', label: 'Live Monitoring', icon: Activity, permission: 'monitoring' },
  { to: '/admin/results', label: 'Results', icon: BarChart3, permission: 'results' },
  { to: '/admin/terminated', label: 'Terminated', icon: FileWarning, permission: 'results' },
  { to: '/admin/administrators', label: 'Administrators', icon: ShieldCheck, superAdmin: true },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout() {
  const { admin, logout, can } = useAdminAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-900 text-slate-200">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="rounded-lg bg-white/10 p-2">
          <GraduationCap className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Placement Exam</p>
          <p className="text-xs text-slate-400">Administration</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.filter((n) => (n.superAdmin ? admin?.role === 'SUPER_ADMIN' : !n.permission || can(n.permission))).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors', isActive ? 'bg-white/15 font-medium text-white' : 'hover:bg-white/5 hover:text-white')
            }
          >
            <Icon className="h-4 w-4" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-medium text-white">{admin?.name}</p>
        <p className="truncate text-xs text-slate-400">{admin?.email}</p>
        <p className="mt-1 text-[11px] tracking-wide text-slate-400 uppercase">{admin?.role === 'SUPER_ADMIN' ? 'Super admin' : 'Admin'}</p>
        <button
          type="button"
          onClick={() => {
            logout();
            navigate('/admin/login');
          }}
          className="mt-3 flex items-center gap-2 text-xs text-slate-300 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
          <button type="button" className="absolute top-4 left-68 text-white" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-6 w-6" />
          </button>
          <span className="ml-3 font-semibold">Placement Exam Admin</span>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
