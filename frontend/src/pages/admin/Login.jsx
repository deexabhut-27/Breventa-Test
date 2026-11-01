import { Lock } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Field, Input } from '../../components/ui.jsx';
import { useAdminAuth } from '../../context/AdminAuthContext.jsx';
import { errorMessage } from '../../lib/api.js';

export default function Login() {
  const { admin, login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (admin) return <Navigate to="/admin" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email.trim(), form.password);
      navigate(location.state?.from || '/admin', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Unable to sign in'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/breventa-logo.png" alt="Breventa Technologies Pvt. Ltd." className="mb-5 h-10 w-auto" />
          <h1 className="text-xl font-semibold">Administrator Sign In</h1>
          <p className="mt-1 text-sm text-slate-500">Online Examination System</p>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email">
            <Input type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </Field>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Button type="submit" className="w-full" loading={loading} icon={Lock} disabled={!form.email || !form.password}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
