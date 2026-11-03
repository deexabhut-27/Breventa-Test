import { Check, Copy, Download, EllipsisVertical, MonitorDown, Share, Smartphone, SquarePlus, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { canPrompt, installPlatform, isMobile, isStandalone, onInstallChange, promptInstall } from '../pwa/install.js';

const DISMISS_KEY = 'pes.install.dismissedAt';
const DISMISS_DAYS = 3;

function useInstallState() {
  const [, rerender] = useState(0);
  useEffect(() => onInstallChange(() => rerender((n) => n + 1)), []);
  return { installed: isStandalone(), oneTap: canPrompt() };
}

/** Starts the install: the browser's own dialog when it offers one, otherwise the step-by-step guide. */
async function startInstall(openHelp) {
  if (canPrompt()) {
    await promptInstall();
    return;
  }
  openHelp();
}

/** Small "Install app" button for the page header. */
export default function InstallAppButton({ className = '' }) {
  const { installed } = useInstallState();
  const [help, setHelp] = useState(false);
  if (installed) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => startInstall(() => setHelp(true))}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 ${className}`}
      >
        <Download className="h-3.5 w-3.5" /> Install app
      </button>
      {help && <InstallHelp onClose={() => setHelp(false)} />}
    </>
  );
}

/** Friendly banner that invites students to install the app. "Not now" hides it for a few days. */
export function InstallBanner() {
  const { installed, oneTap } = useInstallState();
  const [help, setHelp] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (Date.now() - at < DISMISS_DAYS * 864e5) return undefined;
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, []);

  if (installed || (!visible && !help)) return help ? <InstallHelp onClose={() => setHelp(false)} /> : null;
  // On computers only show the banner when the browser supports one-tap install.
  if (!isMobile() && !oneTap) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  return (
    <>
      {visible && (
        <div className="install-pop fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="rounded-3xl bg-white p-4 shadow-[0_20px_50px_-12px_rgba(0,44,135,0.35)] ring-1 ring-slate-200">
            <div className="flex items-start gap-3">
              <img src="/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-2xl ring-1 ring-slate-200" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">Get the Breventa Exam app</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">Open your exam in one tap from your home screen. Free, no app store, takes 5 seconds.</p>
              </div>
              <button type="button" onClick={dismiss} className="-mt-1 -mr-1 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={dismiss} className="flex-1 rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                Not now
              </button>
              <button
                type="button"
                onClick={() =>
                  startInstall(() => {
                    setVisible(false);
                    setHelp(true);
                  })
                }
                className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_-10px_rgba(32,105,243,0.8)] hover:bg-brand-700"
              >
                {oneTap ? <Zap className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                {oneTap ? 'Install now' : 'Show me how'}
              </button>
            </div>
          </div>
        </div>
      )}
      {help && <InstallHelp onClose={() => setHelp(false)} />}
    </>
  );
}

function Step({ n, icon: Icon, children }) {
  return (
    <li className="flex items-start gap-3">
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <Icon className="h-[18px] w-[18px]" />
        <span className="absolute -top-1.5 -left-1.5 grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-[10px] font-bold text-white">{n}</span>
      </span>
      <span className="pt-2 text-sm leading-relaxed text-slate-700">{children}</span>
    </li>
  );
}

/** Step-by-step install guide for the student's own phone or browser. */
export function InstallHelp({ onClose }) {
  const platform = installPlatform();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard not available */
    }
  };

  const steps = {
    ios: [
      [Share, <>Tap the <b>Share</b> button <span className="text-slate-500">(the square with an arrow, at the bottom or top of Safari)</span>.</>],
      [SquarePlus, <>Scroll down and tap <b>Add to Home Screen</b>.</>],
      [Check, <>Tap <b>Add</b>. The Breventa app appears on your home screen.</>],
    ],
    android: [
      [EllipsisVertical, <>Tap the <b>⋮ menu</b> at the top right of Chrome.</>],
      [Smartphone, <>Tap <b>Install app</b> or <b>Add to Home screen</b>.</>],
      [Check, <>Tap <b>Install</b>. The Breventa app appears on your home screen.</>],
    ],
    desktop: [
      [MonitorDown, <>Click the <b>install icon</b> at the right end of the address bar, or open the browser menu.</>],
      [Download, <>Choose <b>Install Breventa Exam</b>.</>],
      [Check, <>The app opens in its own window and is added to your apps.</>],
    ],
    'in-app': [
      [Copy, <>This page is open inside another app (WhatsApp, Instagram…), which cannot install apps. <b>Copy the link</b> below.</>],
      [Smartphone, <>Open <b>Chrome</b> (Android) or <b>Safari</b> (iPhone) and paste the link.</>],
      [Download, <>Tap <b>Install app</b> at the top of the page.</>],
    ],
  }[platform];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 backdrop-blur-[2px] sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Install the app">
      <div className="install-pop w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl" style={{ marginBottom: 'env(safe-area-inset-bottom)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/icon-192.png" alt="" className="h-12 w-12 rounded-2xl ring-1 ring-slate-200" />
            <div>
              <p className="font-semibold text-slate-900">Install Breventa Exam</p>
              <p className="text-xs text-slate-500">3 quick steps</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <ol className="mt-6 space-y-4">
          {steps.map(([icon, text], i) => (
            <Step key={i} n={i + 1} icon={icon}>
              {text}
            </Step>
          ))}
        </ol>

        {platform === 'in-app' ? (
          <button type="button" onClick={copyLink} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        ) : (
          <button type="button" onClick={onClose} className="mt-6 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
            Got it
          </button>
        )}
      </div>
    </div>
  );
}
