import { ArrowLeft, Check, FileText, RefreshCw, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, CardHeader, ConfirmDialog, ErrorState, PageHeader, ResultBadge, Select, Spinner, StatusBadge, Table, Td, Th } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, blobErrorMessage, downloadFile, errorMessage } from '../../lib/api.js';
import { DIFFICULTY_LABELS, fmtDateTime, fmtDuration, humanize } from '../../lib/format.js';

const OUTCOME = { CORRECT: ['green', 'Correct'], INCORRECT: ['red', 'Incorrect'], UNANSWERED: ['gray', 'Unanswered'] };

export default function ResultDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [result, setResult] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await adminApi.get(`/admin/results/${id}`);
      setResult(r.data.data);
      const d = await adminApi.get(`/admin/attempts/${r.data.data.attempt}`);
      setDetail(d.data.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState message={error} />;
  if (!result) return <Spinner />;
  const s = result.scores || {};
  const buckets = [
    ['Easy', s.easy],
    ['Medium', s.medium],
    ['Hard/Tricky', s.hard],
    ['Aptitude', s.aptitude],
    ['Reasoning', s.reasoning],
    ...(result.categoryScores || []).map((c) => [c.category, c]),
  ];
  const review = detail?.review.filter((q) => !filter || q.outcome === filter) || [];

  return (
    <div>
      <Link to="/admin/results" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Results
      </Link>
      <PageHeader
        title={result.studentName}
        subtitle={`${result.universityName} · ${result.examTitle}`}
        actions={
          <>
            <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
            <Button
              variant="secondary"
              icon={RefreshCw}
              loading={busy === 're'}
              onClick={async () => {
                setBusy('re');
                try {
                  await adminApi.post(`/admin/results/${id}/reevaluate`);
                  toast.success('Re-evaluated with the current answer key');
                  load();
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setBusy('');
                }
              }}
            >
              Re-evaluate
            </Button>
            <Button
              icon={FileText}
              loading={busy === 'pdf'}
              onClick={async () => {
                setBusy('pdf');
                try {
                  await downloadFile(`/admin/results/${id}/pdf`, {}, 'result.pdf');
                } catch (err) {
                  toast.error(await blobErrorMessage(err));
                } finally {
                  setBusy('');
                }
              }}
            >
              PDF report
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Final score</span>
            <ResultBadge result={result} />
          </div>
          <p className="mt-2 text-4xl font-semibold tabular-nums">{result.percentage}%</p>
          <p className="text-sm text-slate-600">
            {result.totalScore} / {result.maxScore} marks · pass mark {result.passPercentage}%
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-emerald-50 p-2">
              <p className="text-lg font-semibold text-emerald-700">{result.correct}</p>
              <p className="text-xs text-emerald-700">Correct</p>
            </div>
            <div className="rounded-lg bg-red-50 p-2">
              <p className="text-lg font-semibold text-red-700">{result.incorrect}</p>
              <p className="text-xs text-red-700">Incorrect</p>
            </div>
            <div className="rounded-lg bg-slate-100 p-2">
              <p className="text-lg font-semibold text-slate-700">{result.unanswered}</p>
              <p className="text-xs text-slate-600">Unanswered</p>
            </div>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            {[
              ['Status', <StatusBadge key="s" status={result.status} />],
              ['Submission', humanize(result.submissionType)],
              ['Started', fmtDateTime(result.startedAt)],
              ['Ended', fmtDateTime(result.endedAt)],
              ['Time used', fmtDuration(result.durationUsedSeconds)],
              ['Email', result.email],
              ['Phone', result.phone],
              ['Enrollment', result.enrollmentNumber || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {result.terminationReason && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{result.terminationReason}</p>}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Marks breakdown" />
          <Table>
            <thead>
              <tr>
                <Th>Section</Th>
                <Th className="text-right">Questions</Th>
                <Th className="text-right">Correct</Th>
                <Th className="text-right">Incorrect</Th>
                <Th className="text-right">Unanswered</Th>
                <Th className="text-right">Score</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {buckets.map(([label, b], i) => (
                <tr key={label} className={i === 5 ? 'border-t-2 border-slate-200' : ''}>
                  <Td className="font-medium">{label}</Td>
                  <Td className="text-right tabular-nums">{b?.total ?? 0}</Td>
                  <Td className="text-right tabular-nums">{b?.correct ?? 0}</Td>
                  <Td className="text-right tabular-nums">{b?.incorrect ?? 0}</Td>
                  <Td className="text-right tabular-nums">{b?.unanswered ?? 0}</Td>
                  <Td className="text-right font-medium tabular-nums">
                    {b?.score ?? 0} / {b?.maxScore ?? 0}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      {detail?.attempt.violations?.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Monitoring timeline" subtitle={`${detail.attempt.violationCount} counted violation(s) · policy ${detail.attempt.policy.mode}`} />
          <ul className="divide-y divide-slate-100">
            {detail.attempt.violations.map((v, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                <span className="w-44 text-xs text-slate-500">{fmtDateTime(v.at)}</span>
                <Badge color={v.counted ? 'red' : 'gray'}>{humanize(v.type)}</Badge>
                <span className="text-slate-600">{v.reason}</span>
                <span className="ml-auto text-xs text-slate-400">{v.source}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader
          title="Answer review"
          subtitle="Options are shown in their original order; the student saw a shuffled order."
          actions={
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-44" aria-label="Filter answers">
              <option value="">All questions</option>
              <option value="CORRECT">Correct</option>
              <option value="INCORRECT">Incorrect</option>
              <option value="UNANSWERED">Unanswered</option>
            </Select>
          }
        />
        {!detail ? (
          <Spinner />
        ) : (
          <ol className="divide-y divide-slate-100">
            {review.map((q) => (
              <li key={q.index} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-500">Q{q.index + 1}</span>
                  <Badge color={OUTCOME[q.outcome][0]}>{OUTCOME[q.outcome][1]}</Badge>
                  <Badge>{DIFFICULTY_LABELS[q.difficulty]}</Badge>
                  <Badge>{q.category}</Badge>
                  {q.markedForReview && <Badge color="purple">Marked for review</Badge>}
                  <span className="ml-auto text-slate-500">
                    +{q.marks} / −{q.negativeMarks}
                  </span>
                </div>
                <p className="mt-2 font-medium text-slate-900">{q.text}</p>
                <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {q.options.map((o, i) => {
                    const isCorrect = i === q.correctOptionIndex;
                    const isSelected = i === q.selectedOption;
                    return (
                      <li
                        key={i}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isCorrect ? 'border-emerald-300 bg-emerald-50' : isSelected ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
                      >
                        <span className="font-semibold text-slate-500">{'ABCD'[i]}</span> {o}
                        {isCorrect && <Check className="ml-auto h-4 w-4 text-emerald-600" />}
                        {isSelected && !isCorrect && <X className="ml-auto h-4 w-4 text-red-600" />}
                        {isSelected && <span className="text-xs text-slate-500">(selected)</span>}
                      </li>
                    );
                  })}
                </ul>
                {q.explanation && <p className="mt-2 text-xs text-slate-500">Explanation: {q.explanation}</p>}
              </li>
            ))}
          </ol>
        )}
      </Card>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete result permanently"
        message={`Delete ${result.studentName}'s result? Their attempt, saved answers and monitoring log are removed from the database, and they can take the examination again. This cannot be undone.`}
        confirmLabel="Delete"
        loading={busy === 'delete'}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setBusy('delete');
          try {
            await adminApi.delete(`/admin/results/${id}`);
            toast.success('Result deleted');
            navigate('/admin/results', { replace: true });
          } catch (err) {
            toast.error(errorMessage(err));
            setBusy('');
          }
        }}
      />
    </div>
  );
}
