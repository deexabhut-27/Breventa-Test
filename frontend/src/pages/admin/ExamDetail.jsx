import { AlertTriangle, CheckCircle2, Copy, CopyPlus, ExternalLink, Lock, Pencil, Rocket, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DeleteExamDialog from '../../components/admin/DeleteExamDialog.jsx';
import { Button, Card, CardHeader, ConfirmDialog, ErrorState, PageHeader, Spinner, StatCard, StatusBadge, Table, Td, Th } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, errorMessage } from '../../lib/api.js';
import { examLink, fmtDateTime } from '../../lib/format.js';

export default function ExamDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [exam, setExam] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(() => {
    adminApi
      .get(`/admin/exams/${id}`)
      .then((res) => setExam(res.data.data))
      .catch((err) => setError(errorMessage(err)));
  }, [id]);
  useEffect(load, [load]);

  const action = async (name, fn, success) => {
    setBusy(name);
    try {
      await fn();
      if (success) toast.success(success);
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy('');
    }
  };

  if (error) return <ErrorState message={error} />;
  if (!exam) return <Spinner />;
  const link = examLink(exam.slug);
  const a = exam.attemptCounts || {};

  return (
    <div>
      <PageHeader
        title={exam.title}
        subtitle={<span className="inline-flex items-center gap-2"><StatusBadge status={exam.status} /> Created {fmtDateTime(exam.createdAt)}</span>}
        actions={
          <>
            <Link to={`/admin/exams/${id}/edit`}>
              <Button variant="secondary" icon={Pencil}>
                Edit
              </Button>
            </Link>
            <Button variant="secondary" icon={CopyPlus} loading={busy === 'dup'} onClick={() => action('dup', async () => {
              const res = await adminApi.post(`/admin/exams/${id}/duplicate`);
              navigate(`/admin/exams/${res.data.data._id}`);
            }, 'Examination duplicated')}>
              Duplicate
            </Button>
            {exam.status !== 'PUBLISHED' && (
              <Button variant="success" icon={Rocket} loading={busy === 'publish'} disabled={!exam.availability.ok} onClick={() => action('publish', () => adminApi.post(`/admin/exams/${id}/publish`), 'Examination published')}>
                Publish
              </Button>
            )}
            {exam.status === 'PUBLISHED' && (
              <>
                <Button variant="secondary" icon={Undo2} onClick={() => setConfirm('unpublish')}>
                  Unpublish
                </Button>
                <Button variant="secondary" icon={Lock} onClick={() => setConfirm('close')}>
                  Close
                </Button>
              </>
            )}
            <Button variant="danger" icon={Trash2} onClick={() => setConfirm('delete')}>
              Delete
            </Button>
          </>
        }
      />

      {exam.status === 'PUBLISHED' && (
        <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
          <span className="text-sm font-medium text-slate-700">Student link:</span>
          <code className="flex-1 truncate rounded bg-slate-100 px-3 py-1.5 text-sm">{link}</code>
          <Button
            variant="secondary"
            size="sm"
            icon={Copy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                toast.success('Link copied');
              } catch {
                toast.info(link);
              }
            }}
          >
            Copy
          </Button>
          <a href={link} target="_blank" rel="noreferrer">
            <Button variant="ghost" size="sm" icon={ExternalLink}>
              Open
            </Button>
          </a>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Registered" value={exam.registrations} />
        <StatCard label="In progress" value={a.IN_PROGRESS || 0} tone="blue" />
        <StatCard label="Completed" value={a.COMPLETED || 0} tone="green" />
        <StatCard label="Terminated" value={a.TERMINATED || 0} tone="red" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Question availability" subtitle="Active questions in the selected categories" />
          <Table>
            <thead>
              <tr>
                <Th>Difficulty</Th>
                <Th className="text-right">Required</Th>
                <Th className="text-right">Available</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exam.availability.items.map((i) => (
                <tr key={i.difficulty}>
                  <Td>{i.label}</Td>
                  <Td className="text-right tabular-nums">{i.required}</Td>
                  <Td className="text-right tabular-nums">{i.available}</Td>
                  <Td>{i.shortfall ? <span className="text-red-600">Short by {i.shortfall}</span> : <span className="text-emerald-600">OK</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className={`m-4 flex gap-2 rounded-lg p-3 text-sm ${exam.availability.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            {exam.availability.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            {exam.availability.message}
          </div>
        </Card>

        <Card>
          <CardHeader title="Configuration" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm">
            {[
              ['Duration', `${exam.durationMinutes} minutes`],
              ['Total questions', exam.totalQuestions],
              ['Distribution', `${exam.distribution.easy} / ${exam.distribution.medium} / ${exam.distribution.hard}`],
              ['Marking', exam.markingScheme === 'EXAM' ? `${exam.marksPerQuestion} per question` : 'Per-question marks'],
              ['Negative marking', exam.negativeMarking.enabled ? (exam.markingScheme === 'EXAM' ? `−${exam.negativeMarking.marks}` : 'Per question') : 'Disabled'],
              ['Pass percentage', `${exam.passPercentage}%`],
              ['Tab-switch policy', exam.violationPolicy.mode === 'STRICT' ? 'Strict (terminate on first)' : `Warning (${exam.violationPolicy.warningsAllowed} warning(s))`],
              ['Disconnection', exam.violationPolicy.disconnectAction === 'FLAG' ? `Flag after ${exam.violationPolicy.heartbeatTimeoutSeconds}s` : `Terminate after ${exam.violationPolicy.maxDisconnectSeconds}s`],
              ['Max attempts', exam.maxAttempts],
              ['Window', exam.startAt || exam.endAt ? `${fmtDateTime(exam.startAt)} → ${fmtDateTime(exam.endAt)}` : 'Always open'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-800">{v}</dd>
              </div>
            ))}
            <div className="col-span-2">
              <dt className="text-xs text-slate-500">Categories</dt>
              <dd className="font-medium text-slate-800">{exam.categories.join(', ')}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="mt-6 flex gap-3">
        <Link to={`/admin/results?exam=${id}`}>
          <Button variant="secondary">View results</Button>
        </Link>
        <Link to={`/admin/monitoring?exam=${id}`}>
          <Button variant="secondary">Live monitoring</Button>
        </Link>
      </div>

      <ConfirmDialog
        open={confirm === 'unpublish'}
        title="Unpublish examination"
        message="Students will no longer be able to register or start. Running attempts continue until submitted or expired."
        confirmLabel="Unpublish"
        variant="primary"
        loading={busy === 'unpublish'}
        onClose={() => setConfirm(null)}
        onConfirm={() => action('unpublish', () => adminApi.post(`/admin/exams/${id}/unpublish`), 'Examination moved to draft')}
      />
      <ConfirmDialog
        open={confirm === 'close'}
        title="Close examination"
        message="Closing stops new registrations and new attempts. Running attempts continue until submitted or expired."
        confirmLabel="Close examination"
        variant="primary"
        loading={busy === 'close'}
        onClose={() => setConfirm(null)}
        onConfirm={() => action('close', () => adminApi.post(`/admin/exams/${id}/close`), 'Examination closed')}
      />
      {confirm === 'delete' && <DeleteExamDialog exam={exam} onClose={() => setConfirm(null)} onDeleted={() => navigate('/admin/exams')} />}
    </div>
  );
}
