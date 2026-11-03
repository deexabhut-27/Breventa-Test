import { ArrowUpRight, Globe, Mail, MapPin, Phone } from 'lucide-react';
import { COMPANY } from '../lib/company.js';

/** Breventa Technologies introduction shown before students register. */
export default function CompanyIntro() {
  const contacts = [
    { icon: Phone, label: 'Call us', value: COMPANY.phone, href: COMPANY.phoneHref },
    { icon: Mail, label: 'Email', value: COMPANY.email, href: `mailto:${COMPANY.email}` },
    { icon: Globe, label: 'Website', value: COMPANY.websiteLabel, href: COMPANY.website, external: true },
  ];

  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-24px_rgba(0,44,135,0.22)] ring-1 ring-slate-200/70">
      {/* Hero */}
      <div className="relative isolate overflow-hidden px-6 py-10 sm:px-10 sm:py-14">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-white via-brand-50/60 to-sky-50">
          <div className="intro-blob absolute -top-24 -right-16 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
          <div className="intro-blob intro-blob-2 absolute -bottom-28 left-1/4 h-72 w-72 rounded-full bg-sky-300/30 blur-3xl" />
          <div className="intro-blob intro-blob-3 absolute top-10 -left-20 h-56 w-56 rounded-full bg-indigo-300/25 blur-3xl" />
          <div className="intro-dots absolute inset-0" />
        </div>

        <div className="flex flex-col-reverse items-center gap-10 md:flex-row md:justify-between">
          <div className="max-w-xl text-center md:text-left">
            <span className="intro-rise inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-brand-700 uppercase shadow-sm ring-1 ring-brand-100 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
              </span>
              {COMPANY.tagline}
            </span>
            <h1 className="intro-rise intro-delay-1 mt-5 text-3xl leading-[1.1] font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Welcome to <span className="intro-gradient-text">{COMPANY.name}</span>
            </h1>
            <p className="intro-rise intro-delay-2 mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">{COMPANY.description}</p>
          </div>

          {/* Brand logo */}
          <div className="intro-rise intro-delay-1 shrink-0 rounded-2xl bg-white/90 px-6 py-5 shadow-[0_12px_32px_-16px_rgba(0,44,135,0.35)] ring-1 ring-brand-100 backdrop-blur">
            <img src={COMPANY.logo} alt={COMPANY.legalName} className="h-10 w-auto sm:h-12" />
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="border-t border-slate-100 px-6 py-8 sm:px-10 sm:py-10">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <MapPin className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Visit us</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{COMPANY.address}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {contacts.map(({ icon: Icon, label, value, href, external }) => (
            <a
              key={label}
              href={href}
              {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
              className="group flex min-w-0 items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-slate-200 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-12px_rgba(32,105,243,0.35)] hover:ring-brand-500/40"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 transition duration-300 group-hover:bg-brand-500 group-hover:text-white">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-medium text-slate-500">{label}</span>
                <span className="block text-[13px] font-medium whitespace-nowrap text-slate-800 group-hover:text-brand-700 sm:text-sm">{value}</span>
              </span>
            </a>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ['LinkedIn', COMPANY.linkedin],
            ['Instagram', COMPANY.instagram],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-brand-500 hover:text-white hover:ring-brand-500"
            >
              {label} <ArrowUpRight className="h-3 w-3" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
