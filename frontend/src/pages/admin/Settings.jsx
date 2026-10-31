import { KeyRound, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Pagination, Spinner, Table, Td, Th } from '../../components/ui.jsx';
import { useAdminAuth } from '../../context/AdminAuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, errorMessage } from '../../lib/api.js';
import { fmtDateTime, humanize } from '../../lib/format.js';

function Profile() {
  const { admin, setAdmin } = useAdminAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: admin.name, email: admin.email });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const res = await adminApi.put('/admin/auth/profile', form);
      setAdmin(res.data.data);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader title="Profile" subtitle={`Role: ${humanize(admin.role)} · last sign-in ${fmtDateTime(admin.lastLoginAt)}`} />
      <div className="space-y-4 p-5">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Button icon={Save} onClick={save} loading={saving}>
          Save profile
        </Button>
      </div>
    </Card>
  );
}

function Password() {
  const { replaceToken } = useAdminAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (form.newPassword !== form.confirm) return toast.error('New passwords do not match');
    setSaving(true);
    try {
      const res = await adminApi.put('/admin/auth/password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      replaceToken(res.data.data.token);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed. Other sessions have been signed out.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
    return undefined;
  };
  return (
    <Card>
      <CardHeader title="Change password" subtitle="At least 8 characters with a letter and a number" />
      <div className="space-y-4 p-5">
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
        </Field>
        <Field label="New password">
          <Input type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </Field>
        <Button icon={KeyRound} onClick={save} loading={saving} disabled={!form.currentPassword || !form.newPassword}>
          Change password
        </Button>
      </div>
    </Card>
  );
}

function AuditLog() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  useEffect(() => {
    adminApi.get('/admin/audit-logs', { params: { page, limit: 15 } }).then((res) => setData(res.data)).catch(() => setData({ data: [], meta: null }));
  }, [page]);
  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Audit log" subtitle="Security-relevant actions across the system" />
      {!data ? (
        <Spinner />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Action</Th>
                <Th>Actor</Th>
                <Th>Details</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.data.map((l) => (
                <tr key={l._id}>
                  <Td className="text-xs whitespace-nowrap">{fmtDateTime(l.createdAt)}</Td>
                  <Td>
                    <Badge>{humanize(l.action)}</Badge>
                  </Td>
                  <Td className="text-xs">{humanize(l.actorType)}</Td>
                  <Td className="max-w-md truncate text-xs text-slate-500">{l.details ? JSON.stringify(l.details) : '—'}</Td>
                  <Td className="text-xs">{l.ip || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination meta={data.meta} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

export default function Settings() {
  const { admin } = useAdminAuth();
  return (
    <div>
      <PageHeader title="Settings" subtitle="Your profile and password" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Profile />
        <Password />
        {admin.role === 'SUPER_ADMIN' && <AuditLog />}
      </div>
    </div>
  );
}
