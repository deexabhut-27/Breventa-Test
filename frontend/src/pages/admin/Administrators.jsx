import { KeyRound, Pencil, Save, Trash2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, Toggle } from '../../components/ui.jsx';
import { useAdminAuth } from '../../context/AdminAuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, errorMessage } from '../../lib/api.js';
import { fmtDateTime } from '../../lib/format.js';

const MODULES = [
  ['exams', 'Examinations', 'Create, edit, publish and close examinations'],
  ['questions', 'Question bank', 'Add, edit, import and export questions'],
  ['students', 'Students', 'View, edit and delete registrations'],
  ['monitoring', 'Live monitoring', 'Watch running exams, terminate or force-submit'],
  ['results', 'Results & reports', 'Results, terminated records, PDF / Excel exports'],
];
const ALL = MODULES.map(([k]) => k);
const EMPTY_ADMIN = { name: '', email: '', password: '', role: 'ADMIN', permissions: ALL, isActive: true };

function AccessEditor({ form, setForm }) {
  const toggle = (k) => setForm({ ...form, permissions: form.permissions.includes(k) ? form.permissions.filter((p) => p !== k) : [...form.permissions, k] });
  return (
    <div className="space-y-3">
      <Field label="Role">
        <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="ADMIN">Admin — only the sections selected below</option>
          <option value="SUPER_ADMIN">Super admin — everything, including managing administrators</option>
        </Select>
      </Field>
      {form.role === 'ADMIN' ? (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Access</p>
          <div className="space-y-2">
            {MODULES.map(([key, label, hint]) => (
              <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-700" checked={form.permissions.includes(key)} onChange={() => toggle(key)} />
                <span>
                  <span className="block text-sm font-medium text-slate-800">{label}</span>
                  <span className="block text-xs text-slate-500">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Every admin can see the dashboard and their own profile.</p>
        </div>
      ) : (
        <p className="rounded-lg bg-violet-50 p-3 text-xs text-violet-800">Super admins have full access, including adding, editing and removing administrators.</p>
      )}
    </div>
  );
}

export default function Administrators() {
  const { admin } = useAdminAuth();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [form, setForm] = useState(EMPTY_ADMIN);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => adminApi.get('/admin/admins').then((res) => setList(res.data.data)).catch(() => setList([])), []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn, message, close) => {
    setSaving(true);
    try {
      await fn();
      toast.success(message);
      close();
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const openEdit = (a) => {
    setForm({ name: a.name, email: a.email, role: a.role, permissions: a.permissions || [], isActive: a.isActive });
    setEditing(a);
  };
  const label = (k) => MODULES.find(([m]) => m === k)?.[1] || k;

  return (
    <div>
      <PageHeader
        title="Administrators"
        subtitle="Create admin accounts and choose which sections each one can access. New admins can sign in immediately with the email and password you set."
        actions={
          <Button
            icon={UserPlus}
            onClick={() => {
              setForm(EMPTY_ADMIN);
              setCreating(true);
            }}
          >
            Add administrator
          </Button>
        }
      />
      <Card>
      {!list ? (
        <Spinner />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Access</Th>
              <Th>Last sign-in</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((a) => {
              const self = a._id === admin._id;
              return (
                <tr key={a._id}>
                  <Td>
                    <p className="font-medium">
                      {a.name} {self && <span className="text-xs text-slate-400">(you)</span>}
                    </p>
                    <p className="text-xs text-slate-500">{a.email}</p>
                  </Td>
                  <Td>
                    <Badge color={a.role === 'SUPER_ADMIN' ? 'purple' : 'blue'}>{a.role === 'SUPER_ADMIN' ? 'Super admin' : 'Admin'}</Badge>
                  </Td>
                  <Td className="max-w-xs text-xs">
                    {a.role === 'SUPER_ADMIN' ? 'Everything' : a.permissions?.length ? a.permissions.map(label).join(', ') : <span className="text-red-600">No sections</span>}
                  </Td>
                  <Td className="text-xs">{fmtDateTime(a.lastLoginAt)}</Td>
                  <Td>{a.isActive ? <Badge color="green">Active</Badge> : <Badge>Disabled</Badge>}</Td>
                  <Td className="text-right whitespace-nowrap">
                    {!self && (
                      <>
                        <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(a)} aria-label="Edit access" title="Edit role & access" />
                        <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => { setNewPassword(''); setResetting(a); }} aria-label="Reset password" title="Reset password" />
                        <Button variant="ghost" size="sm" icon={Trash2} className="text-red-600" onClick={() => setRemoving(a)} aria-label="Remove" title="Remove" />
                      </>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Add administrator"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              loading={saving}
              onClick={() => run(() => adminApi.post('/admin/admins', { name: form.name, email: form.email, password: form.password, role: form.role, permissions: form.permissions }), 'Administrator created', () => setCreating(false))}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Temporary password" hint="At least 8 characters with a letter and a number. Share it securely; they can change it in Settings.">
            <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <AccessEditor form={form} setForm={setForm} />
        </div>
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.name || ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button icon={Save} loading={saving} onClick={() => run(() => adminApi.put(`/admin/admins/${editing._id}`, form), 'Access updated', () => setEditing(null))}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <AccessEditor form={form} setForm={setForm} />
          <label className="flex items-center gap-3 text-sm">
            <Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Active" /> Account active (disabled accounts cannot sign in)
          </label>
        </div>
      </Modal>

      <Modal
        open={!!resetting}
        onClose={() => setResetting(null)}
        title={`Reset password for ${resetting?.name || ''}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetting(null)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => run(() => adminApi.post(`/admin/admins/${resetting._id}/reset-password`, { password: newPassword }), 'Password reset', () => setResetting(null))}>
              Reset password
            </Button>
          </>
        }
      >
        <Field label="New password" hint="At least 8 characters with a letter and a number">
          <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!removing}
        title="Remove administrator"
        message={`Remove ${removing?.name} (${removing?.email})? They will no longer be able to sign in.`}
        confirmLabel="Remove"
        loading={saving}
        onClose={() => setRemoving(null)}
        onConfirm={() => run(() => adminApi.delete(`/admin/admins/${removing._id}`), 'Administrator removed', () => setRemoving(null))}
      />
    </div>
  );
}

