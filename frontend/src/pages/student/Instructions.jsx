import { AlertTriangle, Award, CalendarClock, Camera, Clock, Info, ListChecks, PlayCircle, Send, ShieldAlert, Target, UserRound, Wifi } from 'lucide-react';
import StepIndicator from '../../components/StepIndicator.jsx';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Spinner } from '../../components/ui.jsx';
import { errorMessage, isNetworkError, studentApi, studentStore } from '../../lib/api.js';
import { fmtDateTime } from '../../lib/format.js';
import StudentShell from './StudentShell.jsx';

export default function Instructions() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [startNotice, setStartNotice] = useState('');

  useEffect(() => {
    if (!studentStore.token(slug)) {
      navigate(`/exam/${slug}`, { replace: true });
      return;
    }
    studentApi(slug)
      .get('/student/me')
      .then((res) => setData(res.data.data))
      .catch((err) => {
        if (err.response?.status === 401) {
          studentStore.clearToken(slug);
          navigate(`/exam/${slug}`, { replace: true });
        } else setError(errorMessage(err));
      });
  }, [slug, navigate]);

  // Starting is safe to repeat (it resumes the same attempt), so when many students press START
  // together and the server is slow, the browser quietly retries instead of showing an error.
  const start = async () => {
    setStarting(true);
    setStartError('');
    setStartNotice('');
    const api = studentApi(slug);
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        const res = await api.post('/student/attempt/start', { acceptInstructions: true }, { timeout: 45000 });
        studentStore.setSession(slug, res.data.data.sessionId);
        navigate(`/exam/${slug}/test`, { replace: true });
        return;
      } catch (err) {
        const status = err.response?.status;
        const busy = isNetworkError(err) || status === 429 || status >= 500;
        if (!busy || attempt === 6) {
          setStartError(errorMessage(err));
          break;
        }
        setStartNotice('Many students are starting at the same time. Please wait, your examination is being prepared…');
        await new Promise((r) => setTimeout(r, 1500 * attempt + Math.random() * 1500));
      }
    }
    setStartNotice('');
    setStarting(false);
  };

  if (error)
    return (
      <StudentShell title="Examination">
        <Card className="p-6 text-center text-red-700">{error}</Card>
      </StudentShell>
    );
  if (!data) return <Spinner className="h-screen" />;
  const { exam, student, attempts } = data;
  const notStarted = exam.startAt && new Date(exam.startAt) > new Date(data.serverNow);
  const ended = exam.endAt && new Date(exam.endAt) < new Date(data.serverNow);

  const neg = exam.negativeMarking;
  const rules = [
    {
      icon: ListChecks,
      title: 'Questions',
      text: `${exam.totalQuestions} multiple-choice questions (Easy ${exam.distribution.easy} · Medium ${exam.distribution.medium} · Hard ${exam.distribution.hard}). One correct answer each.`,
    },
    {
      icon: Clock,
      title: 'Timer',
      text: `${exam.durationMinutes} minutes. The timer keeps running if you refresh, close the browser or go offline.`,
    },
    {
      icon: Award,
      title: 'Marking',
      text:
        (exam.totalMarks !== null ? `${exam.marksPerQuestion} mark(s) per question.` : 'Marks are shown with each question.') +
        ' ' +
        (neg.enabled ? (neg.marks !== null ? `−${neg.marks} for each wrong answer; unanswered = 0.` : 'Wrong answers lose marks; unanswered = 0.') : 'No negative marking.'),
    },
    {
      icon: Wifi,
      title: 'Auto-save',
      text:
        exam.violationPolicy.disconnectAction === 'TERMINATE'
          ? `Answers save automatically. Offline for ${Math.round(exam.violationPolicy.maxDisconnectSeconds / 60)} min ends the exam.`
          : 'Answers save automatically, even through short network drops.',
    },
    {
      icon: Send,
      title: 'Submission',
      text: 'Submit once when done. At 00:00 your saved answers are submitted automatically.',
    },
  ];
  const critical = [
    {
      icon: ShieldAlert,
      title: 'Stay on this window',
      text: 'Switching tabs, browsers or apps, minimising or locking the screen ends your exam immediately. Moving the mouse outside the window is fine — just don’t click elsewhere.',
    },
    {
      icon: Camera,
      title: 'No screenshots or copying',
      text: 'A screenshot, screen recording or print ends the exam instantly. Copying gives one warning.',
    },
  ];
  const stats = [
    [ListChecks, 'Questions', exam.totalQuestions],
    [Clock, 'Duration', `${exam.durationMinutes} min`],
    [Award, 'Total marks', exam.totalMarks ?? 'Varies'],
    [Target, 'Pass mark', `${exam.passPercentage}%`],
  ];
  const extra = (exam.instructions || '').split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <StudentShell title={exam.title} wide>
      <StepIndicator current={3} />

      {/* Exam overview */}
      <section className="mb-6 overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-24px_rgba(0,44,135,0.25)] ring-1 ring-slate-200/70">
        <div className="relative isolate overflow-hidden bg-brand-900 px-6 py-8 text-white sm:px-10 sm:py-10">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-32 -right-24 h-72 w-72 rounded-full bg-brand-500/50 blur-3xl" />
            <div className="absolute -bottom-40 -left-20 h-80 w-80 rounded-full bg-brand-700 blur-3xl" />
            <div className="intro-grid absolute inset-0 opacity-[0.18]" />
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-sky-100 uppercase backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_8px_2px_rgba(125,211,252,0.7)]" />
            Examination
          </span>
          <h1 className="mt-4 text-2xl leading-tight font-semibold tracking-tight sm:text-4xl">{exam.title}</h1>
          {exam.description && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">{exam.description}</p>}

          <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(([Icon, label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-sm">
                <dt className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-white/60 uppercase">
                  <Icon className="h-3.5 w-3.5 text-sky-300" /> {label}
                </dt>
                <dd className="mt-1 text-xl font-semibold sm:text-2xl">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-3 px-6 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100">
              <UserRound className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{student.fullName}</p>
              <p className="truncate text-xs text-slate-500">
                {student.universityName} · {student.email}
              </p>
            </div>
          </div>
          {(exam.startAt || exam.endAt) && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
              <CalendarClock className="h-3.5 w-3.5 text-brand-500" />
              {exam.startAt && <span>Opens {fmtDateTime(exam.startAt)}</span>}
              {exam.endAt && <span>· Closes {fmtDateTime(exam.endAt)}</span>}
            </p>
          )}
        </div>
      </section>

      {!attempts.canStart ? (
        <Card className="rounded-3xl p-6 text-center sm:p-8">
          <p className="font-medium text-slate-800">{attempts.blockedReason}</p>
          <Link to={`/exam/${slug}/finished`} className="mt-3 inline-block text-sm font-medium text-brand-700 underline">
            View status
          </Link>
        </Card>
      ) : (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70 sm:p-10">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-500 uppercase">Before you begin</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">Examination instructions</h2>

          {/* Rules that end the exam */}
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {critical.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-3 rounded-2xl border border-red-200 bg-gradient-to-b from-red-50 to-white p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-600 text-white shadow-[0_8px_16px_-8px_rgba(220,38,38,0.6)]">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <p className="font-semibold text-red-800">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-red-700/90">{text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* General rules */}
          <ol className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rules.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/60 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <p className="font-semibold text-slate-900">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{text}</p>
                </div>
              </li>
            ))}
          </ol>

          {extra.length > 0 && (
            <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/60 p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-brand-900">
                <Info className="h-4 w-4 text-brand-500" /> From your examiner
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {extra.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <b>Get ready:</b> close other tabs and apps, turn off notifications and keep your device charged. On phones, a call or screen lock also counts as leaving.
            </span>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-6">
            {attempts.hasActiveAttempt ? (
              <p className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800 ring-1 ring-blue-100">You have an examination in progress. Resuming continues the same attempt with the remaining time.</p>
            ) : (
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-2xl p-4 ring-1 transition ${agreed ? 'bg-brand-50 ring-brand-500/40' : 'bg-slate-50 ring-slate-200 hover:ring-slate-300'}`}
              >
                <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand-700" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span className="text-sm font-medium text-slate-800">I have read and agree to the examination instructions.</span>
              </label>
            )}
            {notStarted && <p className="mt-4 text-sm text-amber-700">The examination opens at {fmtDateTime(exam.startAt)}.</p>}
            {ended && <p className="mt-4 text-sm text-red-700">The examination window has closed.</p>}
            {startNotice && <p className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">{startNotice}</p>}
            {startError && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{startError}</p>}
            <Button
              size="lg"
              className="mt-5 w-full rounded-2xl shadow-[0_12px_24px_-12px_rgba(0,44,135,0.6)]"
              icon={PlayCircle}
              loading={starting}
              disabled={(!agreed && !attempts.hasActiveAttempt) || notStarted || ended}
              onClick={start}
            >
              {attempts.hasActiveAttempt ? 'RESUME TEST' : 'START TEST'}
            </Button>
          </div>
        </section>
      )}
    </StudentShell>
  );
}
