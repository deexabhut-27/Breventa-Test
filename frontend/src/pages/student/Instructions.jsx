import { AlertTriangle, Award, CalendarClock, Clock, FileCheck, ListChecks, MinusCircle, PlayCircle, ShieldAlert, Target, Wifi } from 'lucide-react';
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
  const strict = exam.violationPolicy.mode === 'STRICT';
  const notStarted = exam.startAt && new Date(exam.startAt) > new Date(data.serverNow);
  const ended = exam.endAt && new Date(exam.endAt) < new Date(data.serverNow);

  const items = [
    [ListChecks, 'Questions', `${exam.totalQuestions} multiple-choice questions — Easy ${exam.distribution.easy}, Medium ${exam.distribution.medium}, Hard/Tricky ${exam.distribution.hard}. Each has four options and one correct answer.`],
    [Clock, 'Duration', `${exam.durationMinutes} minutes. The timer runs on the server: it does not pause if you refresh, close the browser or lose connection.`],
    [FileCheck, 'Marks', exam.totalMarks !== null ? `${exam.marksPerQuestion} mark(s) per question, ${exam.totalMarks} marks in total. Pass mark: ${exam.passPercentage}%.` : `Marks vary per question (shown with each question). Pass mark: ${exam.passPercentage}%.`],
    [MinusCircle, 'Negative marking', exam.negativeMarking.enabled ? (exam.negativeMarking.marks !== null ? `${exam.negativeMarking.marks} mark(s) are deducted for every wrong answer. Unanswered questions carry no penalty.` : 'Marks are deducted for wrong answers as shown with each question. Unanswered questions carry no penalty.') : 'There is no negative marking.'],
    [
      ShieldAlert,
      'Tab switching',
      strict
        ? 'STRICT MODE: every time you leave this page (switch tabs, minimise or open another app) it is recorded. If you stay away for 10 minutes, your examination is terminated. A terminated examination cannot be restarted.'
        : `WARNING MODE: every time you leave this page it is recorded. Staying away for 10 minutes counts as a violation; you will receive ${exam.violationPolicy.maxViolations - 1} warning(s), and the next one terminates your examination. A terminated examination cannot be restarted.`,
    ],
    [ShieldAlert, 'Screenshots & copying', 'Taking a screenshot, screen capture or printing the page terminates your examination immediately. Copying question content is not allowed: the first attempt gives a warning, the next one terminates your examination.'],
    [Wifi, 'Connection', exam.violationPolicy.disconnectAction === 'TERMINATE' ? `Answers are saved automatically. If no connection is detected for ${Math.round(exam.violationPolicy.maxDisconnectSeconds / 60)} minute(s), your examination is terminated.` : 'Answers are saved automatically. Short network interruptions are tolerated; unsaved answers are kept on this device and sent when the connection returns.'],
    [FileCheck, 'Submission', 'Submit when you are done. When the timer reaches zero your examination is submitted automatically with all saved answers. You can only submit once.'],
  ];

  return (
    <StudentShell title={exam.title} wide>
      <StepIndicator current={3} />
      <Card className="mb-6 overflow-hidden">
        <div className="bg-gradient-to-br from-brand-700 to-brand-500 px-5 py-6 text-white sm:px-6">
          <p className="text-xs font-medium tracking-wide text-brand-100 uppercase">Examination details</p>
          <h1 className="mt-1 text-xl font-semibold sm:text-2xl">{exam.title}</h1>
          {exam.description && <p className="mt-2 text-sm text-white/90">{exam.description}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
          {[
            [ListChecks, 'Questions', exam.totalQuestions],
            [Clock, 'Duration', `${exam.durationMinutes} min`],
            [Award, 'Total marks', exam.totalMarks ?? 'Varies'],
            [Target, 'Pass mark', `${exam.passPercentage}%`],
          ].map(([Icon, label, value]) => (
            <div key={label} className="bg-white px-4 py-3">
              <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                <Icon className="h-3.5 w-3.5 text-brand-500" /> {label}
              </dt>
              <dd className="mt-0.5 text-lg font-semibold text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
        {(exam.startAt || exam.endAt) && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 px-5 py-3 text-xs text-slate-600 sm:px-6">
            <CalendarClock className="h-3.5 w-3.5 text-brand-500" />
            {exam.startAt && <span>Opens {fmtDateTime(exam.startAt)}</span>}
            {exam.endAt && <span>· Closes {fmtDateTime(exam.endAt)}</span>}
          </p>
        )}
        <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600 sm:px-6">
          Registered as <b className="text-slate-900">{student.fullName}</b>
          <span className="block text-xs text-slate-500 sm:inline sm:text-sm">
            <span className="hidden sm:inline"> · </span>
            {student.universityName} · {student.email}
          </span>
        </p>
      </Card>

      {!attempts.canStart ? (
        <Card className="p-5 text-center sm:p-6">
          <p className="font-medium text-slate-800">{attempts.blockedReason}</p>
          <Link to={`/exam/${slug}/finished`} className="mt-3 inline-block text-sm text-brand-700 underline">
            View status
          </Link>
        </Card>
      ) : (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">Examination instructions</h2>
          <ul className="space-y-4">
            {items.map(([Icon, title, text]) => (
              <li key={title} className="flex gap-3">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${title === 'Tab switching' ? 'text-red-600' : 'text-brand-600'}`} />
                <div>
                  <p className="font-medium text-slate-900">{title}</p>
                  <p className={`text-sm ${title === 'Tab switching' ? 'font-medium text-red-700' : 'text-slate-600'}`}>{text}</p>
                </div>
              </li>
            ))}
          </ul>
          {exam.instructions && (
            <div className="mt-6 rounded-lg bg-slate-50 p-4">
              <p className="mb-2 text-sm font-semibold">Additional instructions</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {exam.instructions.split('\n').filter(Boolean).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Close other tabs and applications and disable notifications before starting. On mobile devices, locking the screen or receiving a call also counts as leaving the examination.
          </div>

          {attempts.hasActiveAttempt ? (
            <p className="mt-6 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">You have an examination in progress. Resuming continues the same attempt with the remaining time.</p>
          ) : (
            <label className="mt-6 flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand-700" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span className="text-sm font-medium text-slate-800">I have read and agree to the examination instructions.</span>
            </label>
          )}
          {notStarted && <p className="mt-4 text-sm text-amber-700">The examination opens at {fmtDateTime(exam.startAt)}.</p>}
          {ended && <p className="mt-4 text-sm text-red-700">The examination window has closed.</p>}
          {startNotice && <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{startNotice}</p>}
          {startError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{startError}</p>}
          <Button size="lg" className="mt-6 w-full" icon={PlayCircle} loading={starting} disabled={(!agreed && !attempts.hasActiveAttempt) || notStarted || ended} onClick={start}>
            {attempts.hasActiveAttempt ? 'RESUME TEST' : 'START TEST'}
          </Button>
        </Card>
      )}
    </StudentShell>
  );
}
