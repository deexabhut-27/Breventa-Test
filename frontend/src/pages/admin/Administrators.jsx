import { KeyRound, Pencil, Save, Trash2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, DataCard, Field, Input, KV, Modal, PageHeader, Spinner, Toggle } from '../../components/ui.jsx';
import { useAdminAuth } from '../../context/AdminAuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, errorMessage } from '../../lib/api.js';
import { fmtDateTime } from '../../lib/format.js';

const EMPTY = { name: '', email: '', password: '', isActive: true };

/** Every administrator has full access, so accounts only have a name, email, password and status. */
export default function Administrators() {
  const { admin } = useAdminAuth();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [form, setForm] = useState(EMPTY);
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

  return (
    <div>
      <PageHeader
        title="Administrators"
        subtitle="Every administrator has full access to the admin panel. New administrators can sign in immediately with the email and password you set."
        actions={
          <Button
            icon={UserPlus}
            onClick={() => {
              setForm(EMPTY);
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
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((a) => {
              const self = a._id === admin._id;
              return (
                <DataCard
                  key={a._id}
                  title={
                    <>
                      {a.name} {self && <span className="text-xs font-normal text-slate-400">(you)</span>}
                    </>
                  }
                  subtitle={a.email}
                  badge={a.isActive ? <Badge color="green">Active</Badge> : <Badge>Disabled</Badge>}
                  actions={
                    self ? (
                      <span className="text-xs text-slate-400">Change your own details in Settings</span>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Pencil}
                          onClick={() => {
                            setForm({ name: a.name, email: a.email, password: '', isActive: a.isActive });
                            setEditing(a);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={KeyRound}
                          onClick={() => {
                            setNewPassword('');
                            setResetting(a);
                          }}
                        >
                          Password
                        </Button>
                        <Button variant="ghost" size="sm" icon={Trash2} className="text-red-600" onClick={() => setRemoving(a)}>
                          Remove
                        </Button>
                      </>
                    )
                  }
                >
                  <KV label="Access">Full access</KV>
                  <KV label="Last sign-in">{fmtDateTime(a.lastLoginAt)}</KV>
                </DataCard>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Add administrator"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => run(() => adminApi.post('/admin/admins', { name: form.name, email: form.email, password: form.password }), 'Administrator created', () => setCreating(false))}>
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
          <Field label="Password" hint="At least 8 characters with a letter and a number. They can change it in Settings.">
            <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.name || ''}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button icon={Save} loading={saving} onClick={() => run(() => adminApi.put(`/admin/admins/${editing._id}`, { name: form.name, email: form.email, isActive: form.isActive }), 'Administrator updated', () => setEditing(null))}>
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
