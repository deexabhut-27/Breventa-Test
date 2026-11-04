import { AlertTriangle, Bookmark, ChevronLeft, ChevronRight, CloudOff, CheckCircle2, Eraser, Grid3x3, Loader2, Send, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Modal, Spinner, cx } from '../../components/ui.jsx';
import { SaveQueue } from '../../exam/saveQueue.js';
import { useProctoring } from '../../exam/useProctoring.js';
import { useServerTimer } from '../../exam/useServerTimer.js';
import { useWakeLock } from '../../exam/useWakeLock.js';
import { errorCode, errorMessage, isNetworkError, studentApi, studentStore } from '../../lib/api.js';
import { fmtClock } from '../../lib/format.js';

const CLOSED_CODES = ['ATTEMPT_CLOSED', 'TIME_UP', 'ALREADY_SUBMITTED'];
const COUNTED = ['TAB_SWITCH', 'WINDOW_HIDDEN', 'NAVIGATION'];

const STATUS_STYLE = {
  notVisited: 'border border-slate-300 bg-white text-slate-600',
  notAnswered: 'bg-red-500 text-white',
  answered: 'bg-emerald-500 text-white',
  marked: 'bg-violet-500 text-white',
  answeredMarked: 'bg-violet-500 text-white ring-2 ring-emerald-400 ring-offset-1',
};
const STATUS_LABEL = {
  notVisited: 'Not visited',
  notAnswered: 'Not answered',
  answered: 'Answered',
  marked: 'Marked for review',
  answeredMarked: 'Answered & marked',
};

const hasAnswer = (r) => r?.selectedOption !== null && r?.selectedOption !== undefined;
function statusOf(r) {
  if (!r?.visited) return 'notVisited';
  if (r.markedForReview) return hasAnswer(r) ? 'answeredMarked' : 'marked';
  return hasAnswer(r) ? 'answered' : 'notAnswered';
}

export default function ExamRoom() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const api = useMemo(() => studentApi(slug), [slug]);
  const { remaining, syncTo } = useServerTimer();

  const [phase, setPhase] = useState('loading'); // loading | active | replaced | error
  const [data, setData] = useState(null);
  const [responses, setResponses] = useState({});
  const [current, setCurrent] = useState(0);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [online, setOnline] = useState(true);
  const [warning, setWarning] = useState(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [navNotice, setNavNotice] = useState(false);
  const [copyWarning, setCopyWarning] = useState(null);
  const [shielded, setShielded] = useState(false);

  const queueRef = useRef(null);
  const responsesRef = useRef({});
  const closingRef = useRef(false);
  const submittingRef = useRef(false);
  const reloadReported = useRef(false);

  const finish = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    queueRef.current?.clear();
    studentStore.clearSession(slug);
    sessionStorage.removeItem(`pes.exam.${slug}.current`);
    navigate(`/exam/${slug}/finished`, { replace: true });
  }, [slug, navigate]);

  /** Returns true when the error ended or suspended the session (and was handled). */
  const handleApiError = useCallback(
    (err) => {
      const code = errorCode(err);
      if (CLOSED_CODES.includes(code)) {
        finish();
        return true;
      }
      if (code === 'SESSION_REPLACED') {
        queueRef.current?.stop();
        setPhase('replaced');
        return true;
      }
      if (err?.response?.status === 401) {
        studentStore.clearToken(slug);
        navigate(`/exam/${slug}`, { replace: true });
        return true;
      }
      if (code === 'NO_ATTEMPT') {
        navigate(`/exam/${slug}/instructions`, { replace: true });
        return true;
      }
      return false;
    },
    [finish, slug, navigate],
  );

  const init = useCallback(
    (payload) => {
      queueRef.current?.stop();
      const queue = new SaveQueue({ slug, api, onStatus: setSaveStatus, onFatal: handleApiError });
      queue.setSeqFloor(payload.maxSeq);
      queueRef.current = queue;

      const map = {};
      payload.responses.forEach((r) => {
        map[r.index] = r;
      });
      // Answers that never reached the server (e.g. offline before a refresh) win over server state.
      queue.pendingMap().forEach((p) => {
        map[p.index] = { ...map[p.index], selectedOption: p.selectedOption, markedForReview: p.markedForReview, visited: true };
      });
      const saved = Number(sessionStorage.getItem(`pes.exam.${slug}.current`));
      const start = Number.isInteger(saved) && saved >= 0 && saved < payload.questions.length ? saved : 0;
      responsesRef.current = map;
      setResponses(map);
      setCurrent(start);
      setData(payload);
      syncTo(payload.timer.remainingMs);
      setPhase('active');
      queue.flush();
    },
    [slug, api, handleApiError, syncTo],
  );

  const load = useCallback(async () => {
    if (!studentStore.token(slug)) return navigate(`/exam/${slug}`, { replace: true });
    if (!studentStore.session(slug)) return navigate(`/exam/${slug}/instructions`, { replace: true });
    try {
      const res = await api.get('/student/attempt');
      init(res.data.data);
      const nav = performance.getEntriesByType?.('navigation')?.[0];
      if (nav?.type === 'reload' && !reloadReported.current) {
        reloadReported.current = true;
        api.post('/student/attempt/violations', { type: 'PAGE_RELOAD', reason: 'Examination page was reloaded' }).catch(() => {});
      }
    } catch (err) {
      if (!handleApiError(err)) {
        setErrorText(errorMessage(err));
        setPhase('error');
      }
    }
    return undefined;
  }, [slug, api, init, handleApiError, navigate]);

  useEffect(() => {
    load();
    return () => queueRef.current?.stop();
  }, [load]);

  // ---------- Heartbeat & timer sync ----------
  useEffect(() => {
    if (phase !== 'active' || !data) return undefined;
    const beat = async () => {
      try {
        const res = await api.post('/student/attempt/heartbeat', { visible: document.visibilityState === 'visible' });
        if (res.data.data.terminated) return finish();
        syncTo(res.data.data.remainingMs);
        setOnline(true);
      } catch (err) {
        if (!handleApiError(err)) setOnline(false);
      }
    };
    const t = setInterval(beat, (data.heartbeatIntervalSeconds || 15) * 1000);
    const onOnline = () => {
      setOnline(true);
      beat();
      queueRef.current?.flush();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [phase, data, api, syncTo, handleApiError, finish]);

  // ---------- Submission ----------
  const submit = useCallback(
    async (auto = false) => {
      if (submittingRef.current || closingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError('');
      const tries = auto ? 6 : 4; // retries ride out a burst (e.g. everyone submitting at the time limit)
      let message = '';
      for (let i = 0; i < tries; i += 1) {
        try {
          await api.post('/student/attempt/submit', { pendingResponses: queueRef.current?.snapshot() || [] }, { timeout: 45000 });
          finish();
          return;
        } catch (err) {
          if (handleApiError(err)) return;
          if (!isNetworkError(err) && err.response?.status < 500) {
            message = errorMessage(err);
            break;
          }
          await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        }
      }
      setSubmitError(
        message ||
          (auto
            ? 'Time is up but the server could not be reached. Your saved answers will be submitted automatically by the server.'
            : 'Could not reach the server. Your answers are saved — please check your connection and try again.'),
      );
      submittingRef.current = false;
      setSubmitting(false);
    },
    [api, finish, handleApiError],
  );

  useEffect(() => {
    if (phase === 'active' && remaining === 0) submit(true);
  }, [phase, remaining, submit]);

  // ---------- Proctoring ----------
  const report = useCallback(
    async (event, attempt = 0) => {
      try {
        const res = await api.post('/student/attempt/violations', { ...event, pendingResponses: queueRef.current?.snapshot() || [] });
        const result = res.data.data;
        if (result.terminated) finish();
        else if (event.type === 'COPY_ATTEMPT') setCopyWarning(result);
        else if (COUNTED.includes(event.type) && result.counted) setWarning(result);
      } catch (err) {
        if (handleApiError(err)) return;
        if (isNetworkError(err) && attempt < 5) setTimeout(() => report(event, attempt + 1), 2000 * (attempt + 1));
      }
    },
    [api, finish, handleApiError],
  );
  const log = useCallback((type, reason) => api.post('/student/attempt/violations', { type, reason }).catch(() => {}), [api]);

  // Keep the screen/PC awake during the exam, even with no mouse or keyboard activity.
  useWakeLock(phase === 'active');

  useProctoring({
    enabled: phase === 'active',
    slug,
    token: studentStore.token(slug),
    sessionId: studentStore.session(slug),
    getPending: () => queueRef.current?.snapshot() || [],
    report,
    log,
    onBlockedNavigation: () => setNavNotice(true),
    onShield: setShielded,
  });

  // ---------- Answering ----------
  const update = useCallback((index, patch) => {
    const cur = responsesRef.current[index] || { selectedOption: null, markedForReview: false };
    const next = { ...cur, ...patch, visited: true };
    responsesRef.current = { ...responsesRef.current, [index]: next };
    setResponses(responsesRef.current);
    queueRef.current?.enqueue({ index, selectedOption: next.selectedOption ?? null, markedForReview: !!next.markedForReview });
  }, []);

  const goTo = useCallback(
    (i) => {
      if (!data || i < 0 || i >= data.questions.length) return;
      setCurrent(i);
      setPaletteOpen(false);
      sessionStorage.setItem(`pes.exam.${slug}.current`, String(i));
    },
    [data, slug],
  );

  // Record a visit the first time each question is displayed.
  useEffect(() => {
    if (phase === 'active' && data && !responsesRef.current[current]?.visited) update(current, {});
  }, [phase, data, current, update]);

  // ---------- Render ----------
  if (phase === 'loading') return <Spinner className="h-screen" label="Loading your examination…" />;
  if (phase === 'error')
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-slate-700">{errorText}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  if (phase === 'replaced')
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md rounded-xl bg-white p-6 text-center shadow">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-3 text-lg font-semibold">Examination opened elsewhere</h1>
          <p className="mt-2 text-sm text-slate-600">Your examination is active in another browser window or device. Only one window can be used at a time.</p>
          <Button
            className="mt-5"
            onClick={async () => {
              try {
                const res = await api.post('/student/attempt/start', { acceptInstructions: true });
                studentStore.setSession(slug, res.data.data.sessionId);
                init(res.data.data);
              } catch (err) {
                if (!handleApiError(err)) setErrorText(errorMessage(err));
              }
            }}
          >
            Continue in this window
          </Button>
          {errorText && <p className="mt-3 text-sm text-red-600">{errorText}</p>}
        </div>
      </div>
    );

  const q = data.questions[current];
  const r = responses[current] || {};
  const total = data.questions.length;
  const counts = data.questions.reduce((acc, _q, i) => {
    const st = statusOf(responses[i]);
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {});
  const answeredCount = data.questions.filter((_q, i) => hasAnswer(responses[i])).length;
  const lowTime = remaining !== null && remaining < 5 * 60 * 1000;

  const palette = (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-4 text-xs">
        {Object.keys(STATUS_LABEL).map((k) => (
          <div key={k} className="flex items-center gap-2">
            <span className={cx('flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold', STATUS_STYLE[k])}>{counts[k] || 0}</span>
            <span className="text-slate-600">{STATUS_LABEL[k]}</span>
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-6">
          {data.questions.map((_q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Question ${i + 1}: ${STATUS_LABEL[statusOf(responses[i])]}`}
              className={cx('h-9 rounded-md text-sm font-semibold', STATUS_STYLE[statusOf(responses[i])], i === current && 'outline-2 outline-offset-2 outline-brand-700')}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-200 p-4">
        <Button variant="success" className="w-full" icon={Send} onClick={() => setConfirmSubmit(true)}>
          Submit examination
        </Button>
      </div>
    </div>
  );

  return (
    <div className="exam-no-select flex h-screen flex-col bg-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{data.exam.title}</p>
          <p className="truncate text-xs text-slate-500">{data.student.fullName}</p>
        </div>
        <div className="hidden items-center gap-1.5 text-xs sm:flex" aria-live="polite">
          {!online || saveStatus === 'offline' ? (
            <span className="flex items-center gap-1 text-amber-700">
              <CloudOff className="h-4 w-4" /> Offline — answers kept on this device
            </span>
          ) : saveStatus === 'saving' ? (
            <span className="flex items-center gap-1 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> All answers saved
            </span>
          )}
        </div>
        <div className={cx('rounded-lg px-3 py-1.5 text-center font-mono text-lg font-semibold tabular-nums text-white', lowTime ? 'bg-red-600' : 'bg-slate-900')} role="timer" aria-label="Time remaining">
          {remaining === null ? '--:--' : fmtClock(remaining)}
        </div>
        <Button variant="ghost" className="lg:hidden" icon={Grid3x3} onClick={() => setPaletteOpen(true)} aria-label="Question palette" />
        <Button variant="success" className="hidden sm:inline-flex" icon={Send} onClick={() => setConfirmSubmit(true)}>
          Submit
        </Button>
      </header>
      {(!online || saveStatus === 'offline') && (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900 sm:hidden">Offline — answers are kept on this device and sent when the connection returns.</div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col">
          {shielded && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900 p-6 text-center text-sm text-white">
              Questions are hidden while the examination window is not in focus. Click here to continue.
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            <div className="mx-auto max-w-3xl">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-slate-900">
                  Question {current + 1} of {total}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">{q.category}</span>
                <span className="ml-auto text-xs text-slate-500">
                  +{q.marks} mark{q.marks === 1 ? '' : 's'}
                  {q.negativeMarks ? ` · −${q.negativeMarks} if wrong` : ''}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <p className="text-lg leading-relaxed whitespace-pre-wrap text-slate-900 sm:text-xl">{q.text}</p>
                <div className="mt-6 space-y-3" role="radiogroup" aria-label="Options">
                  {q.options.map((opt, i) => {
                    const selected = r.selectedOption === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => update(current, { selectedOption: i })}
                        className={cx(
                          'flex w-full items-center gap-4 rounded-lg border-2 px-4 py-3.5 text-left text-base transition-colors',
                          selected ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold', selected ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600')}>
                          {'ABCD'[i]}
                        </span>
                        <span className="text-slate-800">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-slate-500">
                {answeredCount} of {total} answered
              </p>
            </div>
          </div>

          <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 py-3">
            <Button variant="secondary" icon={ChevronLeft} disabled={current === 0} onClick={() => goTo(current - 1)}>
              Previous
            </Button>
            <Button variant="ghost" icon={Eraser} disabled={!hasAnswer(r)} onClick={() => update(current, { selectedOption: null })}>
              Clear response
            </Button>
            <Button variant="secondary" icon={Bookmark} className={r.markedForReview ? 'border-violet-400 text-violet-700' : ''} onClick={() => update(current, { markedForReview: !r.markedForReview })}>
              {r.markedForReview ? 'Unmark review' : 'Mark for review'}
            </Button>
            <div className="ml-auto">
              {current < total - 1 ? (
                <Button onClick={() => goTo(current + 1)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="success" icon={Send} onClick={() => setConfirmSubmit(true)}>
                  Submit
                </Button>
              )}
            </div>
          </footer>
        </main>

        <aside className="hidden w-80 border-l border-slate-200 bg-white lg:block">{palette}</aside>
      </div>

      {paletteOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setPaletteOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-80 max-w-full bg-white">
            <button type="button" className="absolute top-3 right-3 text-slate-400" onClick={() => setPaletteOpen(false)} aria-label="Close palette">
              <X className="h-5 w-5" />
            </button>
            <div className="h-full pt-8">{palette}</div>
          </div>
        </div>
      )}

      <Modal
        open={confirmSubmit || submitting}
        onClose={submitting ? undefined : () => setConfirmSubmit(false)}
        title="Submit examination?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={submitting} onClick={() => setConfirmSubmit(false)}>
              Continue examination
            </Button>
            <Button variant="success" loading={submitting} onClick={() => submit(false)}>
              Submit now
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['Answered', answeredCount, 'text-emerald-700'],
            ['Not answered', total - answeredCount, 'text-red-700'],
            ['Marked for review', (counts.marked || 0) + (counts.answeredMarked || 0), 'text-violet-700'],
            ['Not visited', counts.notVisited || 0, 'text-slate-700'],
          ].map(([k, v, c]) => (
            <div key={k} className="rounded-lg bg-slate-50 p-3">
              <p className={cx('text-2xl font-semibold', c)}>{v}</p>
              <p className="text-xs text-slate-500">{k}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-600">You cannot change your answers after submitting.</p>
        {submitError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{submitError}</p>}
      </Modal>

      <Modal open={!!warning} title="Warning: you left the examination" size="sm" footer={<Button onClick={() => setWarning(null)}>I understand</Button>}>
        {warning && (
          <div className="flex gap-3 text-sm text-slate-700">
            <AlertTriangle className="h-6 w-6 shrink-0 text-red-500" />
            <p>
              You were away from the examination page for more than 10 minutes. This was recorded ({warning.violationCount} of {warning.maxViolations - 1} warning{warning.maxViolations - 1 === 1 ? '' : 's'}).{' '}
              <b>
                {warning.remainingBeforeTermination <= 1
                  ? 'If you stay away for 10 minutes again, your examination will be terminated.'
                  : `${warning.remainingBeforeTermination - 1} more warning(s) remain before termination.`}
              </b>
            </p>
          </div>
        )}
      </Modal>

      <Modal open={!!copyWarning} title="Warning: copying is not allowed" size="sm" footer={<Button onClick={() => setCopyWarning(null)}>I understand</Button>}>
        {copyWarning && (
          <div className="flex gap-3 text-sm text-slate-700">
            <AlertTriangle className="h-6 w-6 shrink-0 text-red-500" />
            <p>
              Copying question content was detected and recorded.{' '}
              <b>If you try to copy again, your examination will be terminated.</b>
            </p>
          </div>
        )}
      </Modal>

      <Modal open={navNotice} title="Navigation is disabled" size="sm" footer={<Button onClick={() => setNavNotice(false)}>OK</Button>}>
        <p className="text-sm text-slate-600">Use the Previous/Next buttons or the question palette. Leaving this page during the examination is not allowed.</p>
      </Modal>
    </div>
  );
}
