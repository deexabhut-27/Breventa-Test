import { ExternalLink, Globe, Mail, MapPin, Phone } from 'lucide-react';
import { COMPANY } from '../lib/company.js';
import { Card } from './ui.jsx';

/** Breventa Technologies introduction shown before students register. */
export default function CompanyIntro() {
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-brand-700 to-brand-500 px-5 py-6 text-white sm:px-8 sm:py-8">
        <p className="text-sm font-medium tracking-wide text-brand-100 uppercase">{COMPANY.tagline}</p>
        <h1 className="mt-1 text-xl leading-snug font-semibold sm:text-3xl">Welcome to {COMPANY.name}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/90 sm:text-base">{COMPANY.description}</p>
        <div className="mt-5 grid max-w-lg grid-cols-3 gap-2 sm:mt-6 sm:gap-3">
          {COMPANY.stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-white/10 px-2 py-2.5 text-center sm:px-3">
              <p className="text-xl font-semibold sm:text-2xl">{s.value}</p>
              <p className="text-[11px] leading-tight text-white/80 sm:text-xs">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-5 sm:p-8 md:grid-cols-5">
        <div className="md:col-span-3">
          <h2 className="text-sm font-semibold text-slate-900">What we do</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {COMPANY.services.map((s) => (
              <span key={s} className="rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-700 sm:px-3 sm:text-xs">
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="md:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Contact</h2>
          <ul className="mt-3 space-y-2.5 text-sm text-slate-600">
            <li className="flex gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <span>{COMPANY.address}</span>
            </li>
            <li>
              <a href={COMPANY.phoneHref} className="flex items-center gap-2 hover:text-brand-700">
                <Phone className="h-4 w-4 shrink-0 text-brand-500" /> {COMPANY.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${COMPANY.email}`} className="flex items-center gap-2 break-all hover:text-brand-700">
                <Mail className="h-4 w-4 shrink-0 text-brand-500" /> {COMPANY.email}
              </a>
            </li>
            <li>
              <a href={COMPANY.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-brand-700">
                <Globe className="h-4 w-4 shrink-0 text-brand-500" /> {COMPANY.websiteLabel}
              </a>
            </li>
            <li className="flex gap-4 pl-6 text-xs">
              <a href={COMPANY.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-brand-700 hover:underline">
                LinkedIn <ExternalLink className="h-3 w-3" />
              </a>
              <a href={COMPANY.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-brand-700 hover:underline">
                Instagram <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
