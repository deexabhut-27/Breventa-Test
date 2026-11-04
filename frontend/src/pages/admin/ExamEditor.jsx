import { AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, errorMessage } from '../../lib/api.js';
import { CATEGORIES, toLocalInput } from '../../lib/format.js';

const DEFAULTS = {
  title: '',
  description: '',
  instructions: '',
  durationMinutes: 60,
  distribution: { easy: 30, medium: 20, hard: 10 },
  categories: [...CATEGORIES],
  markingScheme: 'EXAM',
  marksPerQuestion: 1,
  negativeMarking: { enabled: false, marks: 0.25 },
  startAt: '',
  endAt: '',
  passPercentage: 40,
  violationPolicy: { mode: 'STRICT', warningsAllowed: 1, heartbeatTimeoutSeconds: 45, disconnectAction: 'FLAG', maxDisconnectSeconds: 300 },
  maxAttempts: 1,
};

const PRESETS = [
  [30, 20, 10],
  [10, 10, 10],
  [20, 20, 20],
  [50, 30, 20],
];

export default function ExamEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(id ? null : DEFAULTS);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.get('/admin/questions/stats').then((res) => setStats(res.data.data)).catch(() => {});
    if (!id) return;
    adminApi
      .get(`/admin/exams/${id}`)
      .then((res) => {
        const e = res.data.data;
        setForm({
          ...DEFAULTS,
          ...e,
          violationPolicy: { ...DEFAULTS.violationPolicy, ...e.violationPolicy },
          startAt: toLocalInput(e.startAt),
          endAt: toLocalInput(e.endAt),
        });
      })
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  if (error) return <ErrorState message={error} />;
  if (!form) return <Spinner />;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setNested = (group, k, v) => setForm((f) => ({ ...f, [group]: { ...f[group], [k]: v } }));
  const total = Number(form.distribution.easy || 0) + Number(form.distribution.medium || 0) + Number(form.distribution.hard || 0);

  // Live availability preview from the question bank matrix (active questions only).
  const available = { EASY: 0, MEDIUM: 0, HARD: 0 };
  if (stats) form.categories.forEach((c) => ['EASY', 'MEDIUM', 'HARD'].forEach((d) => (available[d] += stats.matrix[c]?.[d] || 0)));
  const shortfalls = [
    ['Easy', Number(form.distribution.easy || 0), available.EASY],
    ['Medium', Number(form.distribution.medium || 0), available.MEDIUM],
    ['Hard/Tricky', Number(form.distribution.hard || 0), available.HARD],
  ].filter(([, need, have]) => need > have);

  const toggleCategory = (c) => set('categories', form.categories.includes(c) ? form.categories.filter((x) => x !== c) : [...form.categories, c]);

  const save = async () => {
    const errs = {};
    if (form.title.trim().length < 3) errs.title = 'Enter a title (at least 3 characters)';
    if (total < 1) errs.distribution = 'Add at least one question';
    if (!form.categories.length) errs.categories = 'Select at least one category';
    if (form.startAt && form.endAt && new Date(form.endAt) <= new Date(form.startAt)) errs.endAt = 'End must be after start';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    const body = {
      title: form.title,
      description: form.description,
      instructions: form.instructions,
      durationMinutes: Number(form.durationMinutes),
      distribution: { easy: Number(form.distribution.easy || 0), medium: Number(form.distribution.medium || 0), hard: Number(form.distribution.hard || 0) },
      categories: form.categories,
      markingScheme: form.markingScheme,
      marksPerQuestion: Number(form.marksPerQuestion),
      negativeMarking: { enabled: !!form.negativeMarking.enabled, marks: Number(form.negativeMarking.marks || 0) },
      startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
      endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
      passPercentage: Number(form.passPercentage),
      violationPolicy: {
        mode: form.violationPolicy.mode,
        warningsAllowed: Number(form.violationPolicy.warningsAllowed),
        heartbeatTimeoutSeconds: Number(form.violationPolicy.heartbeatTimeoutSeconds),
        disconnectAction: form.violationPolicy.disconnectAction,
        maxDisconnectSeconds: Number(form.violationPolicy.maxDisconnectSeconds),
      },
      maxAttempts: Number(form.maxAttempts),
    };
    try {
      const res = id ? await adminApi.put(`/admin/exams/${id}`, body) : await adminApi.post('/admin/exams', body);
      const pm = res.data.data.passMarkUpdate;
      toast.success(
        pm
          ? `Pass mark set to ${body.passPercentage}%: ${pm.resultsUpdated} result(s) re-marked, ${pm.qualified} moved to Round 2${pm.movedBack ? `, ${pm.movedBack} moved back to Online test` : ''}`
          : id
            ? 'Examination updated'
            : 'Examination created as draft',
      );
      navigate(`/admin/exams/${res.data.data._id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={id ? 'Edit examination' : 'New examination'}
        subtitle={
          id && form.attemptCounts?.IN_PROGRESS
            ? `${form.attemptCounts.IN_PROGRESS} student(s) are taking this examination now. They keep their current questions and timer; your changes apply to everyone who starts after you save.`
            : 'Changes apply to attempts started after saving; running attempts keep their original configuration.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button icon={Save} onClick={save} loading={saving}>
              Save
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader title="General" />
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            <Field label="Title" required error={fieldErrors.title} className="md:col-span-2">
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} invalid={!!fieldErrors.title} />
            </Field>
            <Field label="Description" className="md:col-span-2">
              <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <Field label="Instructions" hint="One instruction per line. Shown to students before they start." className="md:col-span-2">
              <Textarea rows={5} value={form.instructions} onChange={(e) => set('instructions', e.target.value)} />
            </Field>
            <Field label="Start date & time" hint="Optional. Students cannot start before this.">
              <Input type="datetime-local" value={form.startAt} onChange={(e) => set('startAt', e.target.value)} />
            </Field>
            <Field label="End date & time" hint="Optional. Running attempts are submitted at this time." error={fieldErrors.endAt}>
              <Input type="datetime-local" value={form.endAt} onChange={(e) => set('endAt', e.target.value)} />
            </Field>
            <Field label="Duration (minutes)" required>
              <Input type="number" min="1" max="600" value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} />
            </Field>
            <Field label="Maximum attempts">
              <Input type="number" min="1" max="10" value={form.maxAttempts} onChange={(e) => set('maxAttempts', e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Questions" subtitle={`Total questions: ${total}`} />
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              <span className="self-center text-xs text-slate-500">Presets:</span>
              {PRESETS.map(([e, m, h]) => (
                <Button key={`${e}${m}${h}`} variant="secondary" size="sm" onClick={() => set('distribution', { easy: e, medium: m, hard: h })}>
                  {e} / {m} / {h}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                ['easy', 'Easy', 'EASY'],
                ['medium', 'Medium', 'MEDIUM'],
                ['hard', 'Hard/Tricky', 'HARD'],
              ].map(([k, label, d]) => (
                <Field key={k} label={`${label} questions`} hint={stats ? `${available[d]} active available` : ''}>
                  <Input type="number" min="0" value={form.distribution[k]} onChange={(e) => setNested('distribution', k, e.target.value)} />
                </Field>
              ))}
            </div>
            {fieldErrors.distribution && <p className="text-xs text-red-600">{fieldErrors.distribution}</p>}
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Categories</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <label key={c} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${form.categories.includes(c) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'}`}>
                    <input type="checkbox" className="sr-only" checked={form.categories.includes(c)} onChange={() => toggleCategory(c)} />
                    {c}
                  </label>
                ))}
              </div>
              {fieldErrors.categories && <p className="mt-1 text-xs text-red-600">{fieldErrors.categories}</p>}
            </div>
            {stats &&
              (shortfalls.length ? (
                <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    Not enough active questions: {shortfalls.map(([l, n, h]) => `${l} needs ${n}, ${h} available`).join('; ')}. You can save as draft, but publishing will be blocked until the bank is extended.
                  </span>
                </div>
              ) : (
                <div className="flex gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> The question bank has enough eligible questions.
                </div>
              ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Marking" />
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            <Field label="Marking scheme">
              <Select value={form.markingScheme} onChange={(e) => set('markingScheme', e.target.value)}>
                <option value="EXAM">Same marks for every question</option>
                <option value="QUESTION">Use each question's own marks</option>
              </Select>
            </Field>
            {form.markingScheme === 'EXAM' && (
              <Field label="Marks per question">
                <Input type="number" min="0" step="0.25" value={form.marksPerQuestion} onChange={(e) => set('marksPerQuestion', e.target.value)} />
              </Field>
            )}
            <Field label="Negative marking">
              <Select value={form.negativeMarking.enabled ? 'yes' : 'no'} onChange={(e) => setNested('negativeMarking', 'enabled', e.target.value === 'yes')}>
                <option value="no">Disabled</option>
                <option value="yes">Enabled</option>
              </Select>
            </Field>
            {form.negativeMarking.enabled && form.markingScheme === 'EXAM' && (
              <Field label="Marks deducted per wrong answer">
                <Input type="number" min="0" step="0.25" value={form.negativeMarking.marks} onChange={(e) => setNested('negativeMarking', 'marks', e.target.value)} />
              </Field>
            )}
            {form.negativeMarking.enabled && form.markingScheme === 'QUESTION' && <p className="self-end text-xs text-slate-500">Each question's own negative marks will be deducted.</p>}
            <Field
              label="Pass percentage"
              hint="Can be changed any time, even after the test: results are re-marked Pass/Fail and students who now pass move to Round 2 and Round 2 students who now fail move back to Online test. Final round, Selected and Rejected candidates are not changed."
            >
              <Input type="number" min="0" max="100" value={form.passPercentage} onChange={(e) => set('passPercentage', e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Monitoring policy" subtitle="Shown to students before they start" />
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            <Field label="Tab-switch policy">
              <Select value={form.violationPolicy.mode} onChange={(e) => setNested('violationPolicy', 'mode', e.target.value)}>
                <option value="STRICT">Strict — terminate on first tab switch</option>
                <option value="WARNING">Warning — allow warnings, then terminate</option>
              </Select>
            </Field>
            {form.violationPolicy.mode === 'WARNING' && (
              <Field label="Warnings allowed" hint="The examination terminates on the next violation after these warnings.">
                <Input type="number" min="1" max="10" value={form.violationPolicy.warningsAllowed} onChange={(e) => setNested('violationPolicy', 'warningsAllowed', e.target.value)} />
              </Field>
            )}
            <Field label="Heartbeat timeout (seconds)" hint="After this silence the attempt is flagged as disconnected (not terminated).">
              <Input type="number" min="15" max="600" value={form.violationPolicy.heartbeatTimeoutSeconds} onChange={(e) => setNested('violationPolicy', 'heartbeatTimeoutSeconds', e.target.value)} />
            </Field>
            <Field label="Prolonged disconnection">
              <Select value={form.violationPolicy.disconnectAction} onChange={(e) => setNested('violationPolicy', 'disconnectAction', e.target.value)}>
                <option value="FLAG">Flag only (recommended)</option>
                <option value="TERMINATE">Terminate after a limit</option>
              </Select>
            </Field>
            {form.violationPolicy.disconnectAction === 'TERMINATE' && (
              <Field label="Terminate after (seconds without heartbeat)">
                <Input type="number" min="30" max="7200" value={form.violationPolicy.maxDisconnectSeconds} onChange={(e) => setNested('violationPolicy', 'maxDisconnectSeconds', e.target.value)} />
              </Field>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
