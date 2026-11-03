import { MessageSquare, Pencil, Search, Trash2, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext.jsx';
import { Badge, Button, Card, ConfirmDialog, DataCard, EmptyState, ErrorState, Field, Input, KV, Modal, PageHeader, Pagination, ResultBadge, Select, Spinner, StatusBadge } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, errorMessage } from '../../lib/api.js';
import { STAGE_COLORS, STAGE_LABELS, fmtDateTime } from '../../lib/format.js';

function StudentModal({ id, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!id) return;
    setData(null);
    adminApi.get(`/admin/students/${id}`).then((res) => setData(res.data.data)).catch(() => setData({ error: true }));
  }, [id]);
  const s = data?.student;
  return (
    <Modal open={!!id} onClose={onClose} title="Student details" size="lg">
      {!data ? (
        <Spinner />
      ) : data.error ? (
        <p className="text-sm text-red-600">Could not load student.</p>
      ) : (
        <div className="space-y-5 text-sm">
          <dl className="grid grid-cols-2 gap-3">
            {[
              ['Name', s.fullName],
              ['University', s.universityName],
              ['Email', s.email],
              ['Phone', s.phone],
              ['Enrollment', s.enrollmentNumber || '—'],
              ['Examination', s.examination?.title],
              ['Registered', fmtDateTime(s.createdAt)],
              ['IP address', s.ipAddress || '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <h4 className="mb-2 font-semibold">Attempts</h4>
            {data.attempts.length === 0 ? (
              <p className="text-slate-500">Not started yet.</p>
            ) : (
              data.attempts.map((a) => {
                const r = data.results.find((x) => x.attempt === a._id);
                return (
                  <div key={a._id} className="mb-2 rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>Attempt {a.attemptNumber}</b> <StatusBadge status={a.status} />
                      {r && <ResultBadge result={r} />}
                      {r && <span className="tabular-nums">{r.totalScore}/{r.maxScore} ({r.percentage}%)</span>}
                      {r && (
                        <Link className="ml-auto text-brand-700 underline" to={`/admin/results/${r._id}`}>
                          Full result
                        </Link>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {fmtDateTime(a.startedAt)} → {fmtDateTime(a.endedAt)} · {a.violationCount} counted violation(s)
                    </p>
                    {a.terminationReason && <p className="mt-1 text-xs text-red-600">{a.terminationReason}</p>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function EditStudentModal({ student, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (student) {
      setForm({
        fullName: student.fullName,
        universityName: student.universityName,
        email: student.email,
        // Older records may be stored as +91XXXXXXXXXX; the form takes the 10-digit number.
        phone: (student.phone || '').replace(/\D/g, '').slice(-10),
        enrollmentNumber: student.enrollmentNumber || '',
      });
    }
  }, [student]);
  if (!student || !form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    setSaving(true);
    try {
      await adminApi.put(`/admin/students/${student._id}`, form);
      toast.success('Student details updated');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit student"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Full name" required>
          <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </Field>
        <Field label="University" required>
          <Input value={form.universityName} onChange={(e) => set('universityName', e.target.value)} />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone" required>
          <Input type="tel" inputMode="numeric" maxLength={10} placeholder="9876543210" value={form.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} />
        </Field>
        <Field label="Enrollment number" hint="Optional">
          <Input value={form.enrollmentNumber} onChange={(e) => set('enrollmentNumber', e.target.value)} />
        </Field>
        <p className="text-xs text-slate-500">Changes also update this student's results and future exports. The student continues with their email and phone as edited here.</p>
      </div>
    </Modal>
  );
}

export default function Students() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAdminAuth();
  const [exams, setExams] = useState([]);
  const [filters, setFilters] = useState({ search: '', exam: '', university: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.get('/admin/exams', { params: { limit: 100 } }).then((res) => setExams(res.data.data)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setError('');
    adminApi
      .get('/admin/students', { params: { ...filters, page, limit: 20 } })
      .then((res) => setData(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, [filters, page]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const setFilter = (k, v) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v }));
  };

  const remove = async () => {
    setBusy(true);
    try {
      await adminApi.delete(`/admin/students/${deleting._id}`);
      toast.success('Student registration deleted');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Students" subtitle={data ? `${data.meta.total} registrations` : ' '} />
      <Card>
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 md:grid-cols-3">
          <div className="relative">
            <Search className="absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder="Name, email, phone, enrollment" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
          </div>
          <Input placeholder="University" value={filters.university} onChange={(e) => setFilter('university', e.target.value)} />
          <Select value={filters.exam} onChange={(e) => setFilter('exam', e.target.value)} aria-label="Examination">
            <option value="">All examinations</option>
            {exams.map((e) => (
              <option key={e._id} value={e._id}>
                {e.title}
              </option>
            ))}
          </Select>
        </div>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !data ? (
          <Spinner />
        ) : !data.data.length ? (
          <EmptyState icon={Users} title="No students found" description="Students appear here after registering through an examination link." />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.data.map((s) => (
                <DataCard
                  key={s._id}
                  title={
                    <button type="button" className="text-left hover:underline" onClick={() => setViewing(s._id)}>
                      {s.fullName}
                    </button>
                  }
                  subtitle={s.enrollmentNumber ? `Enrollment ${s.enrollmentNumber}` : 'No enrollment number'}
                  badge={s.attempt ? <StatusBadge status={s.attempt.status} /> : <Badge>Registered</Badge>}
                  actions={
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setViewing(s._id)}>
                        View
                      </Button>
                      {s.result && can('candidates') && (
                        <Button variant="ghost" size="sm" icon={MessageSquare} onClick={() => navigate(`/admin/selection?exam=${s.examination}&stage=${s.stage && s.stage !== 'ONLINE_TEST' ? s.stage : ''}&candidate=${s._id}`)}>
                          Notes
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(s)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" icon={Trash2} className="text-red-600" onClick={() => setDeleting(s)}>
                        Delete
                      </Button>
                    </>
                  }
                >
                  <KV label="University" full>
                    {s.universityName}
                  </KV>
                  <KV label="Email" full>
                    {s.email}
                  </KV>
                  <KV label="Phone">{s.phone}</KV>
                  <KV label="Score">{s.result ? `${s.result.percentage}%` : '—'}</KV>
                  {s.result && (
                    <KV label="Selection stage" full>
                      <Badge color={STAGE_COLORS[s.stage || 'ONLINE_TEST']}>{STAGE_LABELS[s.stage || 'ONLINE_TEST']}</Badge>
                    </KV>
                  )}
                  <KV label="Examination" full>
                    {s.exam?.title || '—'}
                  </KV>
                  <KV label="Registered" full>
                    {fmtDateTime(s.createdAt)}
                  </KV>
                </DataCard>
              ))}
            </div>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      </Card>
      <StudentModal id={viewing} onClose={() => setViewing(null)} />
      <EditStudentModal
        student={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Delete registration"
        message={`Permanently delete ${deleting?.fullName} from the database, including their registration, attempts, saved answers, results and logs? If they are taking the examination now, they will be signed out. They can register again afterwards. This cannot be undone.`}
        confirmLabel="Delete"
        loading={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
