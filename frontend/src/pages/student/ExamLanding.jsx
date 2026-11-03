import { ArrowLeft, ArrowRight, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import CompanyIntro from '../../components/CompanyIntro.jsx';
import StepIndicator from '../../components/StepIndicator.jsx';
import { Button, Card, Field, Input, Select, Spinner } from '../../components/ui.jsx';
import { errorMessage, publicApi, studentStore } from '../../lib/api.js';
import StudentShell from './StudentShell.jsx';

const EMPTY = { fullName: '', universityName: '', phone: '', email: '', enrollmentNumber: '' };

function validate(f) {
  const e = {};
  if (f.fullName.trim().length < 2) e.fullName = 'Enter your full name';
  else if (!/^[\p{L}][\p{L}\s.'-]*$/u.test(f.fullName.trim())) e.fullName = 'Use letters, spaces, dots, apostrophes and hyphens only';
  if (f.universityName.trim().length < 2) e.universityName = 'Select your university';
  if (!/^[0-9]{10}$/.test(f.phone)) e.phone = 'Enter a valid 10-digit phone number';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (!f.enrollmentNumber.trim()) e.enrollmentNumber = 'Enter your enrollment number';
  else if (!/^[A-Za-z0-9/_-]+$/.test(f.enrollmentNumber.trim())) e.enrollmentNumber = 'Use letters, digits, /, _ and - only';
  return e;
}

export default function ExamLanding() {
  const { slug } = useParams();
  const navigate = useNavigate();
  // Step 1: company introduction + exam summary. Step 2 (?step=register): student details.
  const [params, setParams] = useSearchParams();
  const onForm = params.get('step') === 'register';
  const goToForm = () => {
    setParams({ step: 'register' });
    window.scrollTo(0, 0);
  };
  const [exam, setExam] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [universities, setUniversities] = useState(null); // empty list = free-text field

  useEffect(() => {
    publicApi
      .get('/public/universities')
      .then((res) => setUniversities(res.data.data))
      .catch(() => setUniversities([]));
  }, []);

  useEffect(() => {
    publicApi
      .get(`/public/exams/${slug}`)
      .then((res) => setExam(res.data.data))
      .catch((err) => setLoadError(errorMessage(err, 'This examination link is invalid.')));
  }, [slug]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const closed = !!exam && (exam.status !== 'PUBLISHED' || (exam.endAt && new Date(exam.endAt) < new Date()));

  // One form for everyone: if the email + phone are already registered, the server logs the
  // student in to that profile (any number of times, even after a terminated attempt).
  const submit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const body = { ...form, fullName: form.fullName.trim(), universityName: form.universityName.trim(), email: form.email.trim(), enrollmentNumber: form.enrollmentNumber.trim() };
      const res = await publicApi.post(`/public/exams/${slug}/register`, body);
      studentStore.login(slug, res.data.data.token, res.data.data.student.id);
      navigate(`/exam/${slug}/instructions`);
    } catch (err) {
      setSubmitError(errorMessage(err));
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

  if (!onForm) {
    return (
      <StudentShell title={exam.title} wide>
        <StepIndicator current={1} />
        <CompanyIntro />
        {closed && <Card className="mt-6 p-6 text-center text-slate-600">Registration for this examination is closed. Students who already registered can still log in.</Card>}
        <div className="mt-6 flex justify-end">
          <Button size="lg" onClick={goToForm} className="w-full sm:w-auto">
            {closed ? 'Log in' : 'Next'} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </StudentShell>
    );
  }

  return (
    <StudentShell title={exam.title} wide>
      <StepIndicator current={2} />
      <button type="button" onClick={() => setParams({})} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back to company details
      </button>
      <section className="rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-24px_rgba(0,44,135,0.22)] ring-1 ring-slate-200/70 sm:p-8">
        <p className="text-xs font-semibold tracking-[0.18em] text-brand-500 uppercase">Step 2 of 3</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Student details</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          Enter your details as they appear in your university records. Registered before? Use the same email address and phone number to continue with your profile.
        </p>
        <form onSubmit={submit} className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2" noValidate>
          <Field label="Full name" required error={errors.fullName}>
            <Input autoComplete="name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} invalid={!!errors.fullName} />
          </Field>
          <Field label="University name" required error={errors.universityName}>
            {universities?.length ? (
              <Select value={form.universityName} onChange={(e) => set('universityName', e.target.value)} className={errors.universityName ? '[&_select]:border-red-400' : ''}>
                <option value="">Select your university</option>
                {universities.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            ) : (
              <Input autoComplete="organization" value={form.universityName} onChange={(e) => set('universityName', e.target.value)} invalid={!!errors.universityName} />
            )}
          </Field>
          <Field label="Email address" required error={errors.email}>
            <Input type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} />
          </Field>
          <Field label="Phone number" required error={errors.phone}>
            <Input type="tel" autoComplete="tel-national" inputMode="numeric" maxLength={10} placeholder="9876543210" value={form.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} invalid={!!errors.phone} />
          </Field>
          <Field label="Enrollment number" required error={errors.enrollmentNumber}>
            <Input value={form.enrollmentNumber} onChange={(e) => set('enrollmentNumber', e.target.value)} invalid={!!errors.enrollmentNumber} />
          </Field>
          {submitError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 md:col-span-2">{submitError}</p>}
          <div className="flex justify-end border-t border-slate-100 pt-5 md:col-span-2">
            <Button type="submit" size="lg" className="w-full sm:w-auto sm:min-w-48" loading={busy} icon={UserPlus}>
              Continue
            </Button>
          </div>
        </form>
      </section>
    </StudentShell>
  );
}
