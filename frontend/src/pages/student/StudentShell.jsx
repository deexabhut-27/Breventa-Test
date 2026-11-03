import { Globe, Mail, Phone } from 'lucide-react';
import { COMPANY } from '../../lib/company.js';

export default function StudentShell({ title, children, wide = false, hideFooter = false }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-50 to-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-8 lg:px-12">
          <a href={COMPANY.website} target="_blank" rel="noreferrer" className="shrink-0" aria-label={COMPANY.legalName}>
            <img src={COMPANY.logo} alt={COMPANY.legalName} className="h-8 w-auto sm:h-10" />
          </a>
          {title && <p className="hidden min-w-0 truncate text-right text-sm font-medium text-slate-600 sm:block">{title}</p>}
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 py-5 sm:py-8 ${wide ? 'px-4 sm:px-8 lg:px-12' : 'max-w-xl px-4'}`}>{children}</main>
      {!hideFooter && (
        <footer className="border-t border-slate-200 bg-white">
          <div className="flex w-full flex-col items-center justify-between gap-2 px-4 py-4 sm:px-8 lg:px-12 text-center text-xs text-slate-500 sm:flex-row sm:text-left">
            <p>
              © {new Date().getFullYear()} {COMPANY.legalName}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
              <a href={`mailto:${COMPANY.email}`} className="flex items-center gap-1 hover:text-brand-700">
                <Mail className="h-3.5 w-3.5" /> {COMPANY.email}
              </a>
              <a href={COMPANY.phoneHref} className="flex items-center gap-1 hover:text-brand-700">
                <Phone className="h-3.5 w-3.5" /> {COMPANY.phone}
              </a>
              <a href={COMPANY.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-brand-700">
                <Globe className="h-3.5 w-3.5" /> {COMPANY.websiteLabel}
              </a>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
