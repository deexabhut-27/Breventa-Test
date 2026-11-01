import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '../components/ui.jsx';
import { ADMIN_TOKEN_KEY, adminApi } from '../lib/api.js';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem(ADMIN_TOKEN_KEY));

  useEffect(() => {
    if (!localStorage.getItem(ADMIN_TOKEN_KEY)) return;
    adminApi
      .get('/admin/auth/me')
      .then((res) => setAdmin(res.data.data))
      .catch(() => localStorage.removeItem(ADMIN_TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await adminApi.post('/admin/auth/login', { email, password });
    localStorage.setItem(ADMIN_TOKEN_KEY, res.data.data.token);
    setAdmin(res.data.data.admin);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdmin(null);
  }, []);

  const replaceToken = useCallback((token) => localStorage.setItem(ADMIN_TOKEN_KEY, token), []);

  const can = useCallback((permission) => !!admin && (admin.role === 'SUPER_ADMIN' || admin.permissions?.includes(permission)), [admin]);

  const value = useMemo(() => ({ admin, setAdmin, loading, login, logout, replaceToken, can }), [admin, loading, login, logout, replaceToken, can]);
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export const useAdminAuth = () => useContext(AdminAuthContext);

/** Shows a friendly message instead of a page the admin has not been granted. */
export function RequirePermission({ permission, superAdmin, children }) {
  const { admin, can } = useAdminAuth();
  const allowed = superAdmin ? admin?.role === 'SUPER_ADMIN' : can(permission);
  if (allowed) return children;
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <p className="text-lg font-semibold text-slate-800">No access</p>
      <p className="mt-1 max-w-md text-sm text-slate-500">You don't have access to this section. Ask another administrator for help.</p>
    </div>
  );
}

export function RequireAdmin({ children }) {
  const { admin, loading } = useAdminAuth();
  const location = useLocation();
  if (loading) return <Spinner className="h-screen" />;
  if (!admin) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return children;
}
