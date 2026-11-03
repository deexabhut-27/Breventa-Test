// Install-to-home-screen support. Chrome/Edge/Android fire `beforeinstallprompt` once, early, so it
// is captured here (imported before React renders) and replayed to whichever component asks.
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canPrompt = () => !!deferred;
export const isAndroid = () => /android/i.test(navigator.userAgent);
export const isMobile = () => isIos() || isAndroid();
/** WhatsApp, Instagram, Facebook, LinkedIn, Telegram… open links in their own browser, which cannot install apps. */
export const isInAppBrowser = () => /FBAN|FBAV|Instagram|WhatsApp|LinkedInApp|Line\/|Telegram|Snapchat|; wv\)/i.test(navigator.userAgent);

/** Which set of install steps to show on this device. */
export function installPlatform() {
  if (isInAppBrowser()) return 'in-app';
  if (isIos()) return 'ios';
  if (isAndroid()) return 'android';
  return 'desktop';
}

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Shows the browser's install dialog. Resolves true if the user accepted. */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  notify();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
