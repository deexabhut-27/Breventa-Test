import axios from 'axios';

const baseURL = `${import.meta.env.VITE_API_URL || ''}/api`;
export const ADMIN_TOKEN_KEY = 'pes.adminToken';

// Brief outages (database reconnecting, API restarting behind a proxy) are retried quietly
// instead of being shown to the user. Real errors (4xx, 500 with a JSON error) are not retried.
const RETRY_DELAYS = [800, 1600, 3200];
function isTransient(err) {
  const res = err?.response;
  if (!res) return false; // network errors / timeouts are handled by callers that know whether a resend is safe
  if (res.data?.error?.code === 'DB_UNAVAILABLE') return true;
  if ([502, 503, 504].includes(res.status)) return true;
  return res.status >= 500 && !res.data?.error; // proxy error page while the API restarts
}
function withRetry(instance) {
  instance.interceptors.response.use(undefined, async (err) => {
    const config = err?.config;
    if (!config || !isTransient(err)) return Promise.reject(err);
    config.retryCount = (config.retryCount || 0) + 1;
    if (config.retryCount > RETRY_DELAYS.length) return Promise.reject(err);
    await new Promise((r) => setTimeout(r, RETRY_DELAYS[config.retryCount - 1]));
    return instance(config);
  });
  return instance;
}

export const adminApi = withRetry(axios.create({ baseURL, timeout: 30000 }));
adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
adminApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes('/auth/login')) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      // Only admin pages redirect; public pages (e.g. the home page) just treat the visitor as a student.
      const path = window.location.pathname;
      if (path.startsWith('/admin') && !path.startsWith('/admin/login')) window.location.assign('/admin/login');
    }
    return Promise.reject(err);
  },
);

export const publicApi = withRetry(axios.create({ baseURL, timeout: 20000 }));

// ---------- Student storage (per examination slug) ----------
export const studentStore = {
  token: (slug) => localStorage.getItem(`pes.exam.${slug}.token`),
  setToken: (slug, t) => localStorage.setItem(`pes.exam.${slug}.token`, t),
  clearToken: (slug) => localStorage.removeItem(`pes.exam.${slug}.token`),
  // sessionStorage survives a refresh but not a new tab, which is exactly the session boundary we want.
  session: (slug) => sessionStorage.getItem(`pes.exam.${slug}.session`),
  setSession: (slug, s) => sessionStorage.setItem(`pes.exam.${slug}.session`, s),
  clearSession: (slug) => sessionStorage.removeItem(`pes.exam.${slug}.session`),
  /** Stores a login. When a different student logs in on this device, the previous student's unsent answers and session are dropped. */
  login: (slug, token, studentId) => {
    const key = `pes.exam.${slug}.student`;
    if (localStorage.getItem(key) !== String(studentId)) {
      ['pending', 'seq'].forEach((k) => localStorage.removeItem(`pes.exam.${slug}.${k}`));
      ['session', 'current'].forEach((k) => sessionStorage.removeItem(`pes.exam.${slug}.${k}`));
    }
    localStorage.setItem(key, String(studentId));
    localStorage.setItem(`pes.exam.${slug}.token`, token);
  },
};

export function studentApi(slug) {
  const instance = withRetry(axios.create({ baseURL, timeout: 15000 }));
  instance.interceptors.request.use((config) => {
    const token = studentStore.token(slug);
    const session = studentStore.session(slug);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (session) config.headers['X-Exam-Session'] = session;
    return config;
  });
  return instance;
}

export const beaconUrl = `${baseURL}/student/beacon`;

export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err?.response?.data?.error?.message) return err.response.data.error.message;
  if (err?.code === 'ECONNABORTED') return 'The request timed out. Check your connection and try again.';
  if (err?.message === 'Network Error') return 'Unable to reach the server. Check your internet connection.';
  return fallback;
}

export const errorCode = (err) => err?.response?.data?.error?.code;
export const isNetworkError = (err) => !!err && !err.response;

/** Downloads a file from an authenticated admin endpoint. */
export async function downloadFile(url, params, fallbackName) {
  const res = await adminApi.get(url, { params, responseType: 'blob', timeout: 120000 });
  const disposition = res.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const name = match ? match[1] : fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Blob error responses hide the JSON body; unwrap it for a readable message. */
export async function blobErrorMessage(err) {
  try {
    if (err?.response?.data instanceof Blob) {
      const parsed = JSON.parse(await err.response.data.text());
      return parsed?.error?.message || errorMessage(err);
    }
  } catch {
    /* fall through */
  }
  return errorMessage(err);
}
