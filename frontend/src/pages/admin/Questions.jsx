import { BookOpen, Download, FileSpreadsheet, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
  Textarea,
  Th,
  Toggle,
} from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, blobErrorMessage, downloadFile, errorCode, errorMessage } from '../../lib/api.js';
import { CATEGORIES, DIFFICULTIES, DIFFICULTY_LABELS } from '../../lib/format.js';

const DIFF_COLOR = { EASY: 'green', MEDIUM: 'amber', HARD: 'red' };
const EMPTY = { text: '', options: ['', '', '', ''], correctOptionIndex: null, category: CATEGORIES[0], difficulty: 'EASY', marks: 1, negativeMarks: 0, explanation: '', isActive: true };

function QuestionModal({ open, initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...EMPTY, ...initial, options: [...initial.options] } : EMPTY);
      setErrors({});
    }
  }, [open, initial]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setOption = (i, v) => setForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) }));

  const validate = () => {
    const e = {};
    if (form.text.trim().length < 5) e.text = 'Enter the question text (at least 5 characters)';
    if (form.options.some((o) => !o.trim())) e.options = 'All four options are required';
    else if (new Set(form.options.map((o) => o.trim().toLowerCase())).size !== 4) e.options = 'Options must be unique';
    if (form.correctOptionIndex === null) e.correct = 'Select the correct answer';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    const body = {
      text: form.text,
      options: form.options,
      correctOptionIndex: form.correctOptionIndex,
      category: form.category,
      difficulty: form.difficulty,
      marks: Number(form.marks),
      negativeMarks: Number(form.negativeMarks),
      explanation: form.explanation,
      isActive: form.isActive,
    };
    try {
      if (initial?._id) await adminApi.put(`/admin/questions/${initial._id}`, body);
      else await adminApi.post('/admin/questions', body);
      toast.success(initial?._id ? 'Question updated' : 'Question added');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={initial?._id ? 'Edit question' : 'Add question'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save question
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Question" required error={errors.text}>
          <Textarea rows={3} value={form.text} onChange={(e) => set('text', e.target.value)} invalid={!!errors.text} />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            Options <span className="text-red-500">*</span> <span className="font-normal text-slate-500">— select the radio button next to the correct answer</span>
          </p>
          <div className="space-y-2">
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  className="h-4 w-4 accent-emerald-600"
                  checked={form.correctOptionIndex === i}
                  onChange={() => set('correctOptionIndex', i)}
                  aria-label={`Mark option ${'ABCD'[i]} correct`}
                />
                <span className="w-5 text-sm font-semibold text-slate-500">{'ABCD'[i]}</span>
                <Input value={opt} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${'ABCD'[i]}`} className={form.correctOptionIndex === i ? 'border-emerald-400 bg-emerald-50' : ''} />
              </div>
            ))}
          </div>
          {(errors.options || errors.correct) && <p className="mt-1 text-xs text-red-600">{errors.options || errors.correct}</p>}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Category" required>
            <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Difficulty" required>
            <Select value={form.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Marks" hint="Used when the examination uses per-question marking">
            <Input type="number" min="0" step="0.25" value={form.marks} onChange={(e) => set('marks', e.target.value)} />
          </Field>
          <Field label="Negative marks" hint="Deducted for a wrong answer (per-question marking)">
            <Input type="number" min="0" step="0.25" value={form.negativeMarks} onChange={(e) => set('negativeMarks', e.target.value)} />
          </Field>
        </div>
        <Field label="Explanation" hint="Visible to administrators only">
          <Textarea rows={2} value={form.explanation} onChange={(e) => set('explanation', e.target.value)} />
        </Field>
        <label className="flex items-center gap-3 text-sm">
          <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Active" /> Active (eligible for examinations)
        </label>
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setReport(null);
    }
  }, [open]);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await adminApi.post('/admin/questions/import', fd, { timeout: 120000 });
      setReport(res.data.data);
      toast.success(`${res.data.data.inserted} questions imported`);
      onDone();
    } catch (err) {
      if (err.response?.data?.data) setReport(err.response.data.data);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import questions"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button icon={Upload} onClick={upload} loading={busy} disabled={!file}>
            Import
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          Upload an Excel (.xlsx) or CSV file with the columns <b>Question, Option A–D, Correct Option (A–D), Category, Difficulty (Easy/Medium/Hard)</b> and optionally Marks, Negative Marks, Explanation, Active.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={FileSpreadsheet} onClick={() => downloadFile('/admin/questions/import-template', { format: 'xlsx' }, 'template.xlsx')}>
            Excel template
          </Button>
          <Button variant="secondary" size="sm" icon={FileSpreadsheet} onClick={() => downloadFile('/admin/questions/import-template', { format: 'csv' }, 'template.csv')}>
            CSV template
          </Button>
        </div>
        <input type="file" accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-700" />
        {report && (
          <div className="rounded-lg border border-slate-200 p-3">
            <p>
              Imported <b className="text-emerald-700">{report.inserted}</b>, skipped <b className="text-red-700">{report.failed}</b>.
            </p>
            {report.errors?.length > 0 && (
              <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5 text-xs text-red-700">
                {report.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function Questions() {
  const toast = useToast();
  const [filters, setFilters] = useState({ search: '', category: '', difficulty: '', status: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [inUse, setInUse] = useState(null); // { question, message } when the question appears in attempts
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError('');
    adminApi
      .get('/admin/questions', { params: { ...filters, page, limit: 20 } })
      .then((res) => setData(res.data))
      .catch((err) => setError(errorMessage(err)));
    adminApi.get('/admin/questions/stats').then((res) => setStats(res.data.data)).catch(() => {});
  }, [filters, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const setFilter = (k, v) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v }));
  };

  const toggleActive = async (q) => {
    try {
      await adminApi.patch(`/admin/questions/${q._id}/status`, { isActive: !q.isActive });
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async (question, force = false) => {
    setBusy(true);
    try {
      await adminApi.delete(`/admin/questions/${question._id}`, { params: force ? { force: 'true' } : {} });
      toast.success('Question deleted permanently');
      setDeleting(null);
      setInUse(null);
      load();
    } catch (err) {
      if (errorCode(err) === 'QUESTION_IN_USE') {
        setDeleting(null);
        setInUse({ question, message: errorMessage(err) });
      } else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const exportBank = async (format) => {
    try {
      await downloadFile('/admin/questions/export', { ...filters, format }, `question-bank.${format}`);
    } catch (err) {
      toast.error(await blobErrorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Question Bank"
        subtitle={stats ? `${stats.total} questions · ${stats.active} active · Easy ${stats.byDifficulty.EASY} · Medium ${stats.byDifficulty.MEDIUM} · Hard ${stats.byDifficulty.HARD} (active)` : ' '}
        actions={
          <>
            <Button variant="secondary" icon={Upload} onClick={() => setImportOpen(true)}>
              Import
            </Button>
            <Button variant="secondary" icon={Download} onClick={() => exportBank('xlsx')}>
              Excel
            </Button>
            <Button variant="secondary" icon={Download} onClick={() => exportBank('csv')}>
              CSV
            </Button>
            <Button icon={Plus} onClick={() => setEditing({})}>
              Add question
            </Button>
          </>
        }
      />

      {stats && (
        <Card className="mb-6 overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Category (active questions)</Th>
                {DIFFICULTIES.map((d) => (
                  <Th key={d} className="text-right">
                    {DIFFICULTY_LABELS[d]}
                  </Th>
                ))}
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CATEGORIES.map((c) => {
                const row = stats.matrix[c] || { EASY: 0, MEDIUM: 0, HARD: 0 };
                return (
                  <tr key={c}>
                    <Td>{c}</Td>
                    {DIFFICULTIES.map((d) => (
                      <Td key={d} className="text-right tabular-nums">
                        {row[d]}
                      </Td>
                    ))}
                    <Td className="text-right font-medium tabular-nums">{row.EASY + row.MEDIUM + row.HARD}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      <Card>
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 md:grid-cols-4">
          <div className="relative">
            <Search className="absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder="Search question text" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
          </div>
          <Select value={filters.category} onChange={(e) => setFilter('category', e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Select value={filters.difficulty} onChange={(e) => setFilter('difficulty', e.target.value)} aria-label="Difficulty">
            <option value="">All difficulties</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </Select>
          <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
            <option value="">Active and inactive</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </Select>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !data ? (
          <Spinner />
        ) : data.data.length === 0 ? (
          <EmptyState icon={BookOpen} title="No questions found" description="Adjust the filters or add a new question." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th className="w-1/2">Question</Th>
                  <Th>Category</Th>
                  <Th>Difficulty</Th>
                  <Th className="text-right">Marks</Th>
                  <Th>Active</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((q) => (
                  <tr key={q._id} className="align-top hover:bg-slate-50">
                    <Td>
                      <p className="font-medium text-slate-900">{q.text}</p>
                      <ol className="mt-1 grid grid-cols-1 gap-x-4 text-xs text-slate-500 sm:grid-cols-2">
                        {q.options.map((o, i) => (
                          <li key={i} className={i === q.correctOptionIndex ? 'font-semibold text-emerald-700' : ''}>
                            {'ABCD'[i]}. {o}
                          </li>
                        ))}
                      </ol>
                    </Td>
                    <Td className="text-xs">{q.category}</Td>
                    <Td>
                      <Badge color={DIFF_COLOR[q.difficulty]}>{DIFFICULTY_LABELS[q.difficulty]}</Badge>
                    </Td>
                    <Td className="text-right text-xs tabular-nums">
                      +{q.marks} / −{q.negativeMarks}
                    </Td>
                    <Td>
                      <Toggle checked={q.isActive} onChange={() => toggleActive(q)} label="Active" />
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(q)} aria-label="Edit" />
                      <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDeleting(q)} aria-label="Delete" className="text-red-600" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <QuestionModal
        open={!!editing}
        initial={editing?._id ? editing : null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
      <ConfirmDialog
        open={!!deleting}
        title="Delete question"
        message="This permanently removes the question from the database."
        confirmLabel="Delete"
        loading={busy}
        onConfirm={() => remove(deleting)}
        onClose={() => setDeleting(null)}
      />
      <ConfirmDialog
        open={!!inUse}
        title="Question already used by students"
        message={inUse?.message}
        confirmLabel="Delete anyway"
        loading={busy}
        onConfirm={() => remove(inUse.question, true)}
        onClose={() => setInUse(null)}
      >
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={async () => {
            await toggleActive({ ...inUse.question, isActive: true });
            setInUse(null);
          }}
        >
          Deactivate instead
        </Button>
      </ConfirmDialog>
    </div>
  );
}
