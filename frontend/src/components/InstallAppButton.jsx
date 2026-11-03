import { Download, Share, SquarePlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { canPrompt, isIos, isStandalone, onInstallChange, promptInstall } from '../pwa/install.js';

/** "Install app" button: the browser's install dialog on Android/desktop, step-by-step help on iPhone/iPad. */
export default function InstallAppButton({ className = '' }) {
  const [, rerender] = useState(0);
  const [iosHelp, setIosHelp] = useState(false);
  useEffect(() => onInstallChange(() => rerender((n) => n + 1)), []);

  if (isStandalone()) return null;
  const ios = isIos();
  if (!ios && !canPrompt()) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => (ios ? setIosHelp(true) : promptInstall())}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100 transition hover:bg-brand-500 hover:text-white hover:ring-brand-500 ${className}`}
      >
        <Download className="h-3.5 w-3.5" /> Install app
      </button>

      {iosHelp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onClick={() => setIosHelp(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src="/icon-192.png" alt="" className="h-11 w-11 rounded-xl ring-1 ring-slate-200" />
                <div>
                  <p className="font-semibold text-slate-900">Install Breventa Exam</p>
                  <p className="text-xs text-slate-500">Add it to your Home Screen</p>
                </div>
              </div>
              <button type="button" onClick={() => setIosHelp(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ol className="mt-5 space-y-3 text-sm text-slate-700">
              <li className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><Share className="h-4 w-4" /></span>
                Tap the <b>Share</b> button in Safari’s toolbar.
              </li>
              <li className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><SquarePlus className="h-4 w-4" /></span>
                Choose <b>Add to Home Screen</b>, then tap <b>Add</b>.
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
