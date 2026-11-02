import {
  Accessibility,
  AppWindow,
  ArrowUpRight,
  CodeXml,
  Gauge,
  Globe,
  Layers,
  LifeBuoy,
  Mail,
  MapPin,
  Phone,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { COMPANY } from '../lib/company.js';

const SERVICE_ICONS = {
  'Website Development': Globe,
  'E-commerce Development': ShoppingBag,
  'Web Application Development': AppWindow,
  'Headless CMS Development': Layers,
  'Custom Software Development': CodeXml,
  'AI Solutions': Sparkles,
  'Performance & Optimization': Gauge,
  'Accessibility (WCAG 2.2)': Accessibility,
  'Support & Maintenance': LifeBuoy,
};

/** Breventa Technologies introduction shown before students register. */
export default function CompanyIntro() {
  const contacts = [
    { icon: Phone, label: 'Call us', value: COMPANY.phone, href: COMPANY.phoneHref },
    { icon: Mail, label: 'Email', value: COMPANY.email, href: `mailto:${COMPANY.email}` },
    { icon: Globe, label: 'Website', value: COMPANY.websiteLabel, href: COMPANY.website, external: true },
  ];

  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-24px_rgba(0,44,135,0.25)] ring-1 ring-slate-200/70">
      {/* Hero */}
      <div className="relative isolate overflow-hidden bg-brand-900 px-6 py-10 text-white sm:px-10 sm:py-14">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-brand-500/50 blur-3xl" />
          <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-brand-700 blur-3xl" />
          <div className="absolute top-1/3 left-1/2 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />
          <div className="intro-grid absolute inset-0 opacity-[0.18]" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        </div>

        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-sky-100 uppercase backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_8px_2px_rgba(125,211,252,0.7)]" />
              {COMPANY.tagline}
            </span>
            <h1 className="mt-5 text-3xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
              Welcome to{' '}
              <span className="bg-gradient-to-r from-white via-sky-200 to-brand-100 bg-clip-text text-transparent">{COMPANY.name}</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">{COMPANY.description}</p>
          </div>

          <div className="hidden shrink-0 md:block">
            <div className="relative grid h-36 w-36 place-items-center rounded-[2rem] border border-white/15 bg-white/10 shadow-2xl backdrop-blur-md">
              <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-white/20 to-transparent" />
              <img src={COMPANY.mark} alt="" className="relative h-20 w-20 object-contain drop-shadow-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Services */}
      <div className="px-6 pt-8 sm:px-10 sm:pt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-brand-500 uppercase">Expertise</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">What we do</h2>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COMPANY.services.map((s) => {
            const Icon = SERVICE_ICONS[s] ?? Sparkles;
            return (
              <div
                key={s}
                className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/60 p-3.5 transition duration-300 hover:-translate-y-0.5 hover:border-brand-100 hover:shadow-[0_12px_24px_-12px_rgba(32,105,243,0.35)]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 transition duration-300 group-hover:bg-brand-500 group-hover:text-white group-hover:ring-brand-500">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{s}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contact */}
      <div className="px-6 pt-8 pb-8 sm:px-10 sm:pb-10">
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-3 lg:max-w-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-sm ring-1 ring-slate-200">
                <MapPin className="h-[18px] w-[18px]" />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Visit us</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{COMPANY.address}</p>
              </div>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-2xl">
              {contacts.map(({ icon: Icon, label, value, href, external }) => (
                <a
                  key={label}
                  href={href}
                  {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                  className="group flex min-w-0 items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-500/40"
                >
                  <Icon className="h-4 w-4 shrink-0 text-brand-500" />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-medium text-slate-500">{label}</span>
                    <span className="block truncate text-sm font-medium text-slate-800 group-hover:text-brand-700">{value}</span>
                  </span>
                </a>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            {[
              ['LinkedIn', COMPANY.linkedin],
              ['Instagram', COMPANY.instagram],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-brand-900 hover:text-white hover:ring-brand-900"
              >
                {label} <ArrowUpRight className="h-3 w-3" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
