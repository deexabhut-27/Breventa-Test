import { ArrowDown, ArrowUp, BarChart3, FileDown, FileSpreadsheet, FileText, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, ResultBadge, Select, Spinner, StatCard, StatusBadge, Table, Td, Th } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, blobErrorMessage, downloadFile, errorMessage } from '../../lib/api.js';
import { fmtDateTime, fmtDuration } from '../../lib/format.js';

const FILTER_KEYS = ['search', 'exam', 'university', 'email', 'phone', 'from', 'to', 'difficulty', 'minScore', 'maxScore', 'status', 'passed'];

export default function Results({ terminatedOnly = false }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [exams, setExams] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ''])), [params]);
  const page = Number(params.get('page') || 1);
  const sortBy = params.get('sortBy') || 'endedAt';
  const sortOrder = params.get('sortOrder') || 'desc';

  // Everything the server needs to reproduce this exact view — shared by the table and every export.
  const query = useMemo(() => {
    const q = { ...filters, sortBy, sortOrder };
    if (terminatedOnly) q.status = 'TERMINATED';
    return Object.fromEntries(Object.entries(q).filter(([, v]) => v !== ''));
  }, [filters, sortBy, sortOrder, terminatedOnly]);

  const update = (changes, resetPage = true) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v === '' || v === undefined ? next.delete(k) : next.set(k, v)));
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    adminApi.get('/admin/exams', { params: { limit: 100 } }).then((res) => setExams(res.data.data)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setError('');
    adminApi
      .get('/admin/results', { params: { ...query, page, limit: 20 } })
      .then((res) => setData(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, [query, page]);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const sort = (field) => update({ sortBy: field, sortOrder: sortBy === field && sortOrder === 'desc' ? 'asc' : 'desc' }, false);
  const SortTh = ({ field, children, className }) => (
    <Th className={className}>
      <button type="button" className="inline-flex items-center gap-1 uppercase" onClick={() => sort(field)}>
        {children}
        {sortBy === field && (sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </Th>
  );

  const exportFile = async (kind, extra, name) => {
    setExporting(kind);
    try {
      await downloadFile(kind.startsWith('pdf') ? '/admin/results/export/pdf' : '/admin/results/export/excel', { ...query, ...extra }, name);
    } catch (err) {
      toast.error(await blobErrorMessage(err));
    } finally {
      setExporting('');
    }
  };

  const s = data?.summary;

  return (
    <div>
      <PageHeader
        title={terminatedOnly ? 'Terminated Examinations' : 'Student Results'}
        subtitle={terminatedOnly ? 'Attempts ended by the monitoring policy or an administrator' : 'Evaluated attempts. Exports always match the filters below.'}
        actions={
          <>
            <Button variant="secondary" icon={FileText} loading={exporting === 'pdf'} onClick={() => exportFile('pdf', { mode: 'filtered' }, 'results.pdf')}>
              PDF
            </Button>
            <Button variant="secondary" icon={FileText} loading={exporting === 'pdf-uni'} onClick={() => exportFile('pdf-uni', { mode: 'university' }, 'results-by-university.pdf')}>
              PDF by university
            </Button>
            <Button variant="secondary" icon={FileSpreadsheet} loading={exporting === 'xlsx'} onClick={() => exportFile('xlsx', { format: 'xlsx' }, 'results.xlsx')}>
              Excel
            </Button>
            <Button variant="secondary" icon={FileSpreadsheet} loading={exporting === 'xlsx-uni'} onClick={() => exportFile('xlsx-uni', { format: 'xlsx', mode: 'university' }, 'results-by-university.xlsx')}>
              Excel by university
            </Button>
            <Button variant="secondary" icon={FileDown} loading={exporting === 'csv'} onClick={() => exportFile('csv', { format: 'csv' }, 'results.csv')}>
              CSV
            </Button>
          </>
        }
      />

      <Card className="mb-6 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Field label="Search" className="md:col-span-2">
            <div className="relative">
              <Search className="absolute top-3 left-3 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Name, email, phone, university…" value={filters.search} onChange={(e) => update({ search: e.target.value })} />
            </div>
          </Field>
          <Field label="Examination">
            <Select value={filters.exam} onChange={(e) => update({ exam: e.target.value })}>
              <option value="">All</option>
              {exams.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="University">
            <Input value={filters.university} onChange={(e) => update({ university: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={filters.email} onChange={(e) => update({ email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={filters.phone} onChange={(e) => update({ phone: e.target.value })} />
          </Field>
          <Field label="From date">
            <Input type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} />
          </Field>
          <Field label="To date">
            <Input type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} />
          </Field>
          <Field label="Score of">
            <Select value={filters.difficulty} onChange={(e) => update({ difficulty: e.target.value })}>
              <option value="">Total score</option>
              <option value="easy">Easy section</option>
              <option value="medium">Medium section</option>
              <option value="hard">Hard section</option>
            </Select>
          </Field>
          <Field label="Min score">
            <Input type="number" value={filters.minScore} onChange={(e) => update({ minScore: e.target.value })} />
          </Field>
          <Field label="Max score">
            <Input type="number" value={filters.maxScore} onChange={(e) => update({ maxScore: e.target.value })} />
          </Field>
          {!terminatedOnly && (
            <Field label="Status">
              <Select value={filters.status} onChange={(e) => update({ status: e.target.value })}>
                <option value="">Completed & terminated</option>
                <option value="COMPLETED">Completed</option>
                <option value="TERMINATED">Terminated</option>
              </Select>
            </Field>
          )}
          <Field label="Result">
            <Select value={filters.passed} onChange={(e) => update({ passed: e.target.value })}>
              <option value="">Passed & failed</option>
              <option value="true">Passed</option>
              <option value="false">Failed</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button variant="ghost" icon={RotateCcw} onClick={() => setParams({}, { replace: true })}>
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {s && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Matching results" value={s.count} />
          <StatCard label="Average score" value={s.averageScore} tone="purple" />
          <StatCard label="Highest score" value={s.highestScore} tone="amber" />
          <StatCard label="Average %" value={`${s.averagePercentage}%`} tone="blue" />
          <StatCard label="Pass rate" value={`${s.passRate}%`} tone="green" />
        </div>
      )}

      <Card>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !data ? (
          <Spinner />
        ) : !data.data.length ? (
          <EmptyState icon={BarChart3} title="No results match these filters" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <SortTh field="studentName">Student</SortTh>
                  <SortTh field="universityName">University</SortTh>
                  <Th>Contact</Th>
                  <SortTh field="examTitle">Examination</SortTh>
                  <SortTh field="startedAt">Start / End</SortTh>
                  <SortTh field="durationUsedSeconds" className="text-right">Time</SortTh>
                  <SortTh field="easy" className="text-right">Easy</SortTh>
                  <SortTh field="medium" className="text-right">Med</SortTh>
                  <SortTh field="hard" className="text-right">Hard</SortTh>
                  <SortTh field="aptitude" className="text-right">Apt.</SortTh>
                  <SortTh field="reasoning" className="text-right">Reas.</SortTh>
                  <SortTh field="correct" className="text-right">C / I / U</SortTh>
                  <SortTh field="totalScore" className="text-right">Score</SortTh>
                  <SortTh field="percentage" className="text-right">%</SortTh>
                  <Th>Result</Th>
                  <Th>Status</Th>
                  {terminatedOnly && <Th>Termination reason</Th>}
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50">
                    <Td>
                      <Link to={`/admin/results/${r._id}`} className="font-medium text-slate-900 hover:underline">
                        {r.studentName}
                      </Link>
                      {r.enrollmentNumber && <p className="text-xs text-slate-500">{r.enrollmentNumber}</p>}
                    </Td>
                    <Td className="text-xs">{r.universityName}</Td>
                    <Td className="text-xs">
                      {r.email}
                      <br />
                      {r.phone}
                    </Td>
                    <Td className="text-xs">{r.examTitle}</Td>
                    <Td className="text-xs whitespace-nowrap">
                      {fmtDateTime(r.startedAt)}
                      <br />
                      {fmtDateTime(r.endedAt)}
                    </Td>
                    <Td className="text-right text-xs tabular-nums">{fmtDuration(r.durationUsedSeconds)}</Td>
                    <Td className="text-right tabular-nums">{r.scores?.easy?.score ?? 0}</Td>
                    <Td className="text-right tabular-nums">{r.scores?.medium?.score ?? 0}</Td>
                    <Td className="text-right tabular-nums">{r.scores?.hard?.score ?? 0}</Td>
                    <Td className="text-right tabular-nums">{r.scores?.aptitude?.score ?? 0}</Td>
                    <Td className="text-right tabular-nums">{r.scores?.reasoning?.score ?? 0}</Td>
                    <Td className="text-right text-xs tabular-nums whitespace-nowrap">
                      {r.correct} / {r.incorrect} / {r.unanswered}
                    </Td>
                    <Td className="text-right font-medium tabular-nums whitespace-nowrap">
                      {r.totalScore} / {r.maxScore}
                    </Td>
                    <Td className="text-right tabular-nums">{r.percentage}%</Td>
                    <Td>
                      <ResultBadge result={r} />
                    </Td>
                    <Td>
                      <StatusBadge status={r.status} />
                    </Td>
                    {terminatedOnly && <Td className="max-w-xs text-xs text-red-700">{r.terminationReason}</Td>}
                    <Td>
                      <Button variant="ghost" size="sm" icon={Trash2} className="text-red-600" onClick={() => setDeleting(r)} aria-label="Delete result" title="Delete result" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination meta={data.meta} onPage={(p) => update({ page: String(p) }, false)} />
          </>
        )}
      </Card>
      <ConfirmDialog
        open={!!deleting}
        title="Delete result permanently"
        message={`Delete ${deleting?.studentName}'s result for "${deleting?.examTitle}"? Their attempt, saved answers and monitoring log are removed from the database, and they can take the examination again. This cannot be undone.`}
        confirmLabel="Delete"
        loading={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await adminApi.delete(`/admin/results/${deleting._id}`);
            toast.success('Result deleted');
            setDeleting(null);
            load();
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
