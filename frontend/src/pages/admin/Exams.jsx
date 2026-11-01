import { ClipboardList, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import DeleteExamDialog from '../../components/admin/DeleteExamDialog.jsx';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, DataCard, EmptyState, ErrorState, KV, PageHeader, ResponsiveList, Select, Spinner, StatusBadge, Table, Td, Th } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, errorMessage } from '../../lib/api.js';
import { examLink, fmtDateTime } from '../../lib/format.js';

export default function Exams() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [exams, setExams] = useState(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(() => {
    setError('');
    adminApi
      .get('/admin/exams', { params: { status: status || undefined, limit: 100 } })
      .then((res) => setExams(res.data.data))
      .catch((err) => setError(errorMessage(err)));
  }, [status]);
  useEffect(load, [load]);

  const copy = async (slug) => {
    try {
      await navigator.clipboard.writeText(examLink(slug));
      toast.success('Student link copied');
    } catch {
      toast.info(examLink(slug));
    }
  };

  return (
    <div>
      <PageHeader
        title="Examinations"
        subtitle="Create, configure and publish examinations"
        actions={
          <>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40" aria-label="Status">
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="CLOSED">Closed</option>
            </Select>
            <Link to="/admin/exams/new">
              <Button icon={Plus}>New examination</Button>
            </Link>
          </>
        }
      />
      <Card>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !exams ? (
          <Spinner />
        ) : !exams.length ? (
          <EmptyState icon={ClipboardList} title="No examinations yet" action={<Link to="/admin/exams/new"><Button icon={Plus}>Create examination</Button></Link>} />
        ) : (
          <ResponsiveList
            breakpoint="lg"
            table={
          <Table>
            <thead>
              <tr>
                <Th>Examination</Th>
                <Th>Status</Th>
                <Th className="text-right">Questions</Th>
                <Th className="text-right">Duration</Th>
                <Th>Window</Th>
                <Th className="text-right">Registered</Th>
                <Th className="text-right">Done / Live / Term.</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exams.map((e) => (
                <tr key={e._id} className="hover:bg-slate-50">
                  <Td>
                    <Link to={`/admin/exams/${e._id}`} className="font-medium text-slate-900 hover:underline">
                      {e.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      Easy {e.distribution.easy} · Medium {e.distribution.medium} · Hard {e.distribution.hard}
                    </p>
                  </Td>
                  <Td>
                    <StatusBadge status={e.status} />
                  </Td>
                  <Td className="text-right tabular-nums">{e.totalQuestions}</Td>
                  <Td className="text-right tabular-nums">{e.durationMinutes} min</Td>
                  <Td className="text-xs whitespace-nowrap">
                    {e.startAt || e.endAt ? (
                      <>
                        {fmtDateTime(e.startAt)}
                        <br />→ {fmtDateTime(e.endAt)}
                      </>
                    ) : (
                      'Always open'
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{e.registrations}</Td>
                  <Td className="text-right tabular-nums">
                    {e.attemptCounts.COMPLETED || 0} / {e.attemptCounts.IN_PROGRESS || 0} / {e.attemptCounts.TERMINATED || 0}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <Link to={`/admin/exams/${e._id}/edit`}>
                      <Button variant="ghost" size="sm" icon={Pencil}>
                        Edit
                      </Button>
                    </Link>
                    {e.status === 'PUBLISHED' && (
                      <Button variant="ghost" size="sm" icon={Copy} onClick={() => copy(e.slug)}>
                        Link
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" icon={Trash2} className="text-red-600" onClick={() => setDeleting(e)} aria-label="Delete" title="Delete permanently" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
            }
            cards={
            exams.map((e) => (
              <DataCard
                key={e._id}
                title={
                  <Link to={`/admin/exams/${e._id}`} className="hover:underline">
                    {e.title}
                  </Link>
                }
                subtitle={`Easy ${e.distribution.easy} · Medium ${e.distribution.medium} · Hard ${e.distribution.hard}`}
                badge={<StatusBadge status={e.status} />}
                actions={
                  <>
                    <Link to={`/admin/exams/${e._id}/edit`}>
                      <Button variant="ghost" size="sm" icon={Pencil}>
                        Edit
                      </Button>
                    </Link>
                    {e.status === 'PUBLISHED' && (
                      <Button variant="ghost" size="sm" icon={Copy} onClick={() => copy(e.slug)}>
                        Link
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" icon={Trash2} className="text-red-600" onClick={() => setDeleting(e)}>
                      Delete
                    </Button>
                  </>
                }
              >
                <KV label="Questions">{e.totalQuestions}</KV>
                <KV label="Duration">{e.durationMinutes} min</KV>
                <KV label="Registered">{e.registrations}</KV>
                <KV label="Done / Live / Term.">
                  {e.attemptCounts.COMPLETED || 0} / {e.attemptCounts.IN_PROGRESS || 0} / {e.attemptCounts.TERMINATED || 0}
                </KV>
                <KV label="Window" full>
                  {e.startAt || e.endAt ? `${fmtDateTime(e.startAt)} → ${fmtDateTime(e.endAt)}` : 'Always open'}
                </KV>
              </DataCard>
            ))
            }
          />
        )}
      </Card>
      <DeleteExamDialog
        exam={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          load();
        }}
      />
    </div>
  );
}
