import { GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Spinner, Table, Td, Th, Toggle } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, errorMessage } from '../../lib/api.js';

/** The universities students choose from on the registration form. */
export default function Universities() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // {} = new, {_id,...} = edit
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => adminApi.get('/admin/universities').then((res) => setList(res.data.data)).catch(() => setList([])), []);
  useEffect(() => {
    load();
  }, [load]);

  const open = (u) => {
    setEditing(u);
    setName(u.name || '');
  };

  const save = async (e) => {
    e?.preventDefault();
    if (name.trim().length < 2) return toast.error('Enter the university name');
    setSaving(true);
    try {
      if (editing._id) await adminApi.put(`/admin/universities/${editing._id}`, { name: name.trim() });
      else await adminApi.post('/admin/universities', { name: name.trim() });
      toast.success(editing._id ? 'University updated' : 'University added');
      if (editing._id) setEditing(null);
      else setName(''); // keep the dialog open to add the next one quickly
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (u, isActive) => {
    try {
      await adminApi.put(`/admin/universities/${u._id}`, { isActive });
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await adminApi.delete(`/admin/universities/${removing._id}`);
      toast.success('University removed');
      setRemoving(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const shown = (list || []).filter((u) => u.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Universities"
        subtitle="Students select their university from this list when registering. Hidden universities stay on existing records but can't be selected."
        actions={
          <Button icon={Plus} onClick={() => open({})}>
            Add university
          </Button>
        }
      />
      <Card>
        {!list ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No universities yet"
            description="Until you add at least one, students type their university name freely."
            action={<Button icon={Plus} onClick={() => open({})}>Add university</Button>}
          />
        ) : (
          <>
            <div className="border-b border-slate-100 p-4">
              <Input placeholder="Search universities…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>University</Th>
                  <Th>Students</Th>
                  <Th>Shown to students</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((u) => (
                  <tr key={u._id}>
                    <Td className="font-medium text-slate-900">
                      {u.name} {!u.isActive && <Badge className="ml-2">Hidden</Badge>}
                    </Td>
                    <Td>{u.students}</Td>
                    <Td>
                      <Toggle checked={u.isActive} onChange={(v) => toggle(u, v)} label={`Show ${u.name}`} />
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => open(u)} aria-label="Edit" />
                      <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setRemoving(u)} aria-label="Delete" className="text-red-600" />
                    </Td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <Td colSpan={4} className="py-8 text-center text-slate-500">
                      No university matches “{search}”.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </>
        )}
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?._id ? 'Edit university' : 'Add university'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
              {editing?._id ? 'Cancel' : 'Done'}
            </Button>
            <Button onClick={save} loading={saving}>
              {editing?._id ? 'Save' : 'Add'}
            </Button>
          </>
        }
      >
        <form onSubmit={save}>
          <Field label="University name" required hint={editing?._id ? 'Existing student records keep the name they registered with.' : undefined}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!removing}
        title="Delete university"
        message={`Remove “${removing?.name}” from the list? Students already registered keep this name on their records.`}
        confirmLabel="Delete"
        loading={saving}
        onConfirm={remove}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
