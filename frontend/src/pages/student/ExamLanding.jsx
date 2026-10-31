import { CalendarClock, Clock, ListChecks, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Field, Input, Spinner } from '../../components/ui.jsx';
import { errorCode, errorMessage, publicApi, studentApi, studentStore } from '../../lib/api.js';
import { fmtDateTime } from '../../lib/format.js';
import StudentShell from './StudentShell.jsx';

const EMPTY = { fullName: '', universityName: '', phone: '', email: '', enrollmentNumber: '' };

function validate(f) {
  const e = {};
  if (f.fullName.trim().length < 2) e.fullName = 'Enter your full name';
  else if (!/^[\p{L}][\p{L}\s.'-]*$/u.test(f.fullName.trim())) e.fullName = 'Use letters, spaces, dots, apostrophes and hyphens only';
  if (f.universityName.trim().length < 2) e.universityName = 'Enter your university name';
  if (!/^\+?[0-9]{10,15}$/.test(f.phone.replace(/[\s\-().]/g, ''))) e.phone = 'Enter a valid phone number (10–15 digits)';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (f.enrollmentNumber && !/^[A-Za-z0-9/_-]+$/.test(f.enrollmentNumber.trim())) e.enrollmentNumber = 'Use letters, digits, /, _ and - only';
  return e;
}

export default function ExamLanding() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState('register');
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    publicApi
      .get(`/public/exams/${slug}`)
      .then((res) => setExam(res.data.data))
      .catch((err) => setLoadError(errorMessage(err, 'This examination link is invalid.')));
    // Already registered on this device? Skip straight to the instructions.
    if (studentStore.token(slug)) {
      studentApi(slug)
        .get('/student/me')
        .then(() => navigate(`/exam/${slug}/instructions`, { replace: true }))
        .catch(() => studentStore.clearToken(slug));
    }
  }, [slug, navigate]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    const errs = mode === 'register' ? validate(form) : validate({ ...EMPTY, fullName: 'x x', universityName: 'xx', phone: form.phone, email: form.email });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const body =
        mode === 'register'
          ? { ...form, fullName: form.fullName.trim(), universityName: form.universityName.trim(), email: form.email.trim(), enrollmentNumber: form.enrollmentNumber.trim() }
          : { email: form.email.trim(), phone: form.phone };
      const res = await publicApi.post(`/public/exams/${slug}/${mode === 'register' ? 'register' : 'continue'}`, body);
      studentStore.setToken(slug, res.data.data.token);
      navigate(`/exam/${slug}/instructions`);
    } catch (err) {
      setSubmitError(errorMessage(err));
      if (errorCode(err) === 'ALREADY_REGISTERED') setMode('continue');
    } finally {
      setBusy(false);
    }
  };

  if (loadError)
    return (
      <StudentShell title="Examination">
        <Card className="p-6 text-center text-slate-600">{loadError}</Card>
      </StudentShell>
    );
  if (!exam) return <Spinner className="h-screen" />;
  const closed = exam.status !== 'PUBLISHED' || (exam.endAt && new Date(exam.endAt) < new Date());

  return (
    <StudentShell title={exam.title}>
      <Card className="mb-6 p-6">
        <h1 className="text-xl font-semibold">{exam.title}</h1>
        {exam.description && <p className="mt-2 text-sm text-slate-600">{exam.description}</p>}
        <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <span className="flex items-center gap-2 text-slate-700">
            <ListChecks className="h-4 w-4 text-brand-600" /> {exam.totalQuestions} questions
          </span>
          <span className="flex items-center gap-2 text-slate-700">
            <Clock className="h-4 w-4 text-brand-600" /> {exam.durationMinutes} minutes
          </span>
          {(exam.startAt || exam.endAt) && (
            <span className="flex items-center gap-2 text-slate-700">
              <CalendarClock className="h-4 w-4 text-brand-600" /> {exam.startAt ? fmtDateTime(exam.startAt) : 'Open'}
            </span>
          )}
        </div>
      </Card>

      {closed ? (
        <Card className="p-6 text-center text-slate-600">Registration for this examination is closed.</Card>
      ) : (
        <Card className="p-6">
          <div className="mb-5 flex rounded-lg bg-slate-100 p-1 text-sm">
            {[
              ['register', 'New registration'],
              ['continue', 'Already registered? Continue'],
            ].map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setErrors({});
                  setSubmitError('');
                }}
                className={`flex-1 rounded-md px-3 py-2 font-medium ${mode === m ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4" noValidate>
            {mode === 'register' && (
              <>
                <Field label="Full name" required error={errors.fullName}>
                  <Input autoComplete="name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} invalid={!!errors.fullName} />
                </Field>
                <Field label="University name" required error={errors.universityName}>
                  <Input autoComplete="organization" value={form.universityName} onChange={(e) => set('universityName', e.target.value)} invalid={!!errors.universityName} />
                </Field>
              </>
            )}
            <Field label="Email address" required error={errors.email}>
              <Input type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} />
            </Field>
            <Field label="Phone number" required error={errors.phone}>
              <Input type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => set('phone', e.target.value)} invalid={!!errors.phone} />
            </Field>
            {mode === 'register' && (
              <Field label="Enrollment number" hint="Optional" error={errors.enrollmentNumber}>
                <Input value={form.enrollmentNumber} onChange={(e) => set('enrollmentNumber', e.target.value)} invalid={!!errors.enrollmentNumber} />
              </Field>
            )}
            {submitError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{submitError}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy} icon={UserPlus}>
              {mode === 'register' ? 'Register' : 'Continue'}
            </Button>
          </form>
        </Card>
      )}
    </StudentShell>
  );
}
