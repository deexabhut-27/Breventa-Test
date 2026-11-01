import { Check, Filter, MessageSquare, Radio, Search, Trophy, Undo2, X } from 'lucide-react';
import { RichTextEditor } from '../../components/RichText.jsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, DataCard, EmptyState, Field, Input, KV, Modal, PageHeader, Pagination, ResultBadge, Select, Spinner, Textarea, cx } from '../../components/ui.jsx';
import { useAdminAuth } from '../../context/AdminAuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, errorCode, errorMessage } from '../../lib/api.js';
import { ADVANCE_LABELS, STAGE_COLORS, STAGE_LABELS, STAGES, fmtAgo, fmtDateTime, fmtTime } from '../../lib/format.js';
import { useLivePoll } from '../../lib/useLivePoll.js';

const LIVE_MS = 5000;
const isActive = (stage) => Boolean(ADVANCE_LABELS[stage]);
const NEXT_STAGE = { ONLINE_TEST: 'ROUND_2', ROUND_2: 'FINAL_ROUND', FINAL_ROUND: 'SELECTED' };
const PREVIOUS_STAGE = { ROUND_2: 'ONLINE_TEST', FINAL_ROUND: 'ROUND_2', SELECTED: 'FINAL_ROUND' };

const StageBadge = ({ stage }) => <Badge color={STAGE_COLORS[stage]}>{STAGE_LABELS[stage]}</Badge>;

/** Confirms a decision and lets the admin attach a note (recommended when rejecting). */
function DecisionDialog({ pending, onClose, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setNote(''), [pending]);
  if (!pending) return null;
  const { candidate, decision } = pending;
  const title =
    decision === 'ADVANCE' ? ADVANCE_LABELS[candidate.stage] : decision === 'REJECT' ? 'Reject candidate' : 'Undo last decision';
  const variant = decision === 'REJECT' ? 'danger' : decision === 'ADVANCE' ? 'success' : 'primary';

  const submit = async () => {
    setBusy(true);
    try {
      const res = await adminApi.post(`/admin/candidates/${candidate._id}/decision`, { decision, expectedStage: candidate.stage, note: note.trim() || undefined });
      toast.success(`${candidate.fullName} → ${STAGE_LABELS[res.data.data.stage]}`);
      onDone(res.data.data.stage);
    } catch (err) {
      toast.error(errorMessage(err));
      if (errorCode(err) === 'STAGE_CHANGED') onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={variant} loading={busy} onClick={submit}>
            Confirm
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        <b className="text-slate-900">{candidate.fullName}</b> · currently in <StageBadge stage={candidate.stage} />
      </p>
      <Field label={decision === 'REJECT' ? 'Reason (optional)' : 'Note (optional)'} className="mt-4" hint="Saved in the candidate's notes with your name.">
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus placeholder={decision === 'REJECT' ? 'e.g. Weak problem-solving in the technical round' : ''} />
      </Field>
    </Modal>
  );
}

const SAVE_DELAY_MS = 1000;

/**
 * Candidate window: who they are, one shared note that saves itself as you type, then the round
 * decision buttons. A colleague's newer note is picked up live; if you were both typing, you choose
 * whose version to keep instead of losing text silently.
 */
function CandidateModal({ id, version, acting, onClose, onDecide, onChanged }) {
  const toast = useToast();
  const { admin } = useAdminAuth();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState('');
  const [syncKey, setSyncKey] = useState(0);
  const [status, setStatus] = useState({ kind: 'idle' }); // idle | saving | saved | error | conflict
  const draftRef = useRef('');
  const baseRef = useRef(null); // version of the note the editor content is based on
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const timerRef = useRef(null);

  const showRemote = useCallback((notes) => {
    draftRef.current = notes.html || '';
    baseRef.current = notes.version || 0;
    dirtyRef.current = false;
    setDraft(notes.html || '');
    setSyncKey((k) => k + 1);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await adminApi.get(`/admin/candidates/${id}`);
      const d = res.data.data;
      setData(d);
      // First load, or a colleague saved a newer note while we have nothing unsaved: show it.
      if (baseRef.current === null || (!dirtyRef.current && !savingRef.current && d.notes.version !== baseRef.current)) showRemote(d.notes);
    } catch (err) {
      toast.error(errorMessage(err));
      onClose();
    }
  }, [id, toast, onClose, showRemote]);

  const save = useCallback(
    async (force = false) => {
      clearTimeout(timerRef.current);
      if (!id || savingRef.current || (!dirtyRef.current && !force)) return;
      savingRef.current = true;
      const sent = draftRef.current;
      setStatus({ kind: 'saving' });
      try {
        const res = await adminApi.put(`/admin/candidates/${id}/notes`, { html: sent, baseVersion: baseRef.current || 0, force });
        baseRef.current = res.data.data.notes.version;
        if (draftRef.current === sent) dirtyRef.current = false;
        setStatus({ kind: 'saved', at: new Date() });
        setData((d) => (d ? { ...d, notes: res.data.data.notes } : d));
        onChanged();
      } catch (err) {
        if (errorCode(err) === 'NOTES_CHANGED') setStatus({ kind: 'conflict', message: errorMessage(err), theirs: err.response.data.data.notes });
        else {
          setStatus({ kind: 'error', message: errorMessage(err) });
          timerRef.current = setTimeout(() => save(), 3000); // retry, e.g. after a network blip
        }
      } finally {
        savingRef.current = false;
        // Typing continued while saving: save again shortly.
        if (dirtyRef.current && draftRef.current !== sent) timerRef.current = setTimeout(() => save(), SAVE_DELAY_MS);
      }
    },
    [id, onChanged],
  );

  const onType = (html) => {
    draftRef.current = html;
    dirtyRef.current = true;
    setDraft(html);
    setStatus((st) => (st.kind === 'conflict' ? st : { kind: 'typing' }));
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(), SAVE_DELAY_MS);
  };

  useEffect(() => {
    setData(null);
    setDraft('');
    setStatus({ kind: 'idle' });
    baseRef.current = null;
    dirtyRef.current = false;
    return () => clearTimeout(timerRef.current);
  }, [id]);
  useLivePoll(load, LIVE_MS, [id, version]);

  // Closing the window saves anything still pending.
  const close = () => {
    if (dirtyRef.current && status.kind !== 'conflict') save();
    onClose();
  };

  if (!id) return null;
  const s = data?.student;
  const r = data?.results?.[0];
  const n = data?.notes;
  const byOther = n?.updatedBy?.name && String(n.updatedBy.id) !== String(admin._id);

  let statusText = null;
  if (status.kind === 'saving' || status.kind === 'typing') statusText = <span className="text-slate-500">Saving…</span>;
  else if (status.kind === 'saved') statusText = <span className="text-emerald-700">✓ Saved {fmtTime(status.at)}</span>;
  else if (status.kind === 'error') statusText = <span className="text-amber-700">Couldn't save ({status.message}). Retrying…</span>;
  else if (n?.updatedAt && status.kind !== 'conflict') statusText = <span className="text-slate-500">Last edited by {byOther ? n.updatedBy.name : 'you'}, {fmtAgo(n.updatedAt)}</span>;

  return (
    <Modal open onClose={close} title={s ? s.fullName : 'Candidate'} size="lg">
      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="font-medium text-slate-800">{s.universityName}</p>
              <p className="text-xs break-all text-slate-500">
                {s.email} · {s.phone}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {r && (
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm">
                  Test <b>{r.percentage}%</b>
                </span>
              )}
              {r && <ResultBadge result={r} />}
              <StageBadge stage={s.stage} />
              {s.autoQualified && <Badge color="green">Auto · passed</Badge>}
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Notes</h3>
              <p className="text-xs">{statusText}</p>
            </div>
            {status.kind === 'conflict' && (
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <span className="flex-1">{status.message}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    showRemote(status.theirs);
                    setStatus({ kind: 'idle' });
                  }}
                >
                  Load their version
                </Button>
                <Button size="sm" onClick={() => save(true)}>
                  Keep mine
                </Button>
              </div>
            )}
            <RichTextEditor value={draft} syncKey={syncKey} onChange={onType} onSubmitShortcut={() => save()} placeholder="Type notes here: they save automatically." />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {isActive(s.stage) && (
              <>
                <Button variant="success" icon={Check} loading={acting === s._id} onClick={() => onDecide(s, 'ADVANCE')}>
                  {ADVANCE_LABELS[s.stage]}
                </Button>
                <Button variant="danger" icon={X} onClick={() => onDecide(s, 'REJECT')}>
                  Reject
                </Button>
              </>
            )}
            {s.stage !== 'ONLINE_TEST' && (
              <Button variant="secondary" icon={Undo2} loading={acting === s._id} onClick={() => onDecide(s, 'REVERT')}>
                Undo
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Bulk-moves Online-test candidates to Round 2 by cut-off, after a preview. */
function ShortlistModal({ open, exam, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ minPercentage: '', topN: '', includeTerminated: false, note: '' });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ minPercentage: exam?.passPercentage ?? 40, topN: '', includeTerminated: false, note: '' });
      setPreview(null);
    }
  }, [open, exam]);
  if (!open || !exam) return null;

  const body = () => ({
    exam: exam._id,
    minPercentage: Number(form.minPercentage),
    topN: form.topN ? Number(form.topN) : undefined,
    includeTerminated: form.includeTerminated,
    note: form.note.trim() || undefined,
  });
  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setPreview(null);
  };
  const doPreview = async () => {
    setBusy('preview');
    try {
      setPreview((await adminApi.post('/admin/candidates/shortlist/preview', body())).data.data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy('');
    }
  };
  const apply = async () => {
    setBusy('apply');
    try {
      const res = await adminApi.post('/admin/candidates/shortlist', body());
      const { moved, skipped } = res.data.data;
      toast.success(`${moved} candidate(s) moved to Round 2${skipped ? ` (${skipped} already moved by someone else)` : ''}`);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title="Shortlist for Round 2"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={!!busy}>
            Cancel
          </Button>
          {preview ? (
            <Button variant="success" loading={busy === 'apply'} disabled={!preview.count} onClick={apply}>
              Move {preview.count} to Round 2
            </Button>
          ) : (
            <Button icon={Filter} loading={busy === 'preview'} onClick={doPreview}>
              Preview
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          Candidates of <b>{exam.title}</b> still in <b>Online test</b> who meet the cut-off move to Round 2. Nobody is moved until you confirm.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Minimum online-test score (%)" required>
            <Input type="number" min="0" max="100" value={form.minPercentage} onChange={(e) => set('minPercentage', e.target.value)} />
          </Field>
          <Field label="Only the top N (optional)" hint="Highest scores first">
            <Input type="number" min="1" value={form.topN} onChange={(e) => set('topN', e.target.value)} placeholder="All who qualify" />
          </Field>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={form.includeTerminated} onChange={(e) => set('includeTerminated', e.target.checked)} />
          Include candidates whose test was terminated
        </label>
        <Field label="Note (optional)" hint="Added to every shortlisted candidate's notes.">
          <Input value={form.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
        {preview && (
          <div className="rounded-lg border border-slate-200">
            <p className="border-b border-slate-100 px-3 py-2 font-medium">{preview.count} candidate(s) qualify</p>
            <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
              {preview.candidates.map((c) => (
                <li key={c._id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.fullName}</span>
                    <span className="block truncate text-xs text-slate-500">{c.universityName}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{c.result.percentage}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function Selection() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const examId = params.get('exam') || '';
  const stage = params.get('stage') || 'ONLINE_TEST';
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exams, setExams] = useState([]);
  const [list, setList] = useState(null);
  const [summary, setSummary] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [openId, setOpenId] = useState(params.get('candidate')); // deep link from Students / Results
  const [pending, setPending] = useState(null);
  const [shortlisting, setShortlisting] = useState(false);
  const [version, setVersion] = useState(0); // bumps after a decision so the open candidate reloads at once

  useEffect(() => {
    adminApi.get('/admin/exams', { params: { limit: 100 } }).then((res) => setExams(res.data.data)).catch(() => {});
  }, []);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setPage(1);
  };

  const refresh = useCallback(async () => {
    try {
      const res = await adminApi.get('/admin/candidates/live', {
        params: { exam: examId || undefined, stage, search: search || undefined, page, limit: 30, sort: stage === 'ONLINE_TEST' ? 'score' : 'recent' },
      });
      const { candidates, meta, summary: counts } = res.data.data;
      setList({ data: candidates, meta });
      setSummary(counts);
      setUpdatedAt(new Date());
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [examId, stage, search, page, toast]);

  useLivePoll(refresh, LIVE_MS, [refresh]);

  const exam = exams.find((e) => e._id === examId);
  const [acting, setActing] = useState(null); // candidate id while a one-click decision is saving

  // Show a decision on screen at once (card leaves this round, counts update); the server
  // confirms in the background and the next refresh corrects anything it refused.
  const moveLocally = (candidate, to) => {
    setList((l) => (l ? { ...l, data: l.data.filter((x) => x._id !== candidate._id), meta: { ...l.meta, total: Math.max(0, l.meta.total - 1) } } : l));
    setSummary((sm) => (sm ? { ...sm, [candidate.stage]: Math.max(0, (sm[candidate.stage] || 0) - 1), [to]: (sm[to] || 0) + 1 } : sm));
  };

  // Qualify / select / undo happen in one click; only Reject asks for confirmation (and a reason).
  const decide = async (candidate, decision) => {
    if (decision === 'REJECT') {
      setPending({ candidate, decision });
      return;
    }
    const to = decision === 'ADVANCE' ? NEXT_STAGE[candidate.stage] : candidate.stage === 'REJECTED' ? candidate.rejectedAtStage || 'ONLINE_TEST' : PREVIOUS_STAGE[candidate.stage];
    if (to) {
      moveLocally(candidate, to);
      toast.success(`${candidate.fullName} → ${STAGE_LABELS[to]}`);
    }
    setActing(candidate._id);
    try {
      await adminApi.post(`/admin/candidates/${candidate._id}/decision`, { decision, expectedStage: candidate.stage });
    } catch (err) {
      toast.error(errorMessage(err)); // the refresh below puts the card back where it really is
    } finally {
      setActing(null);
      setVersion((v) => v + 1);
      refresh();
    }
  };

  return (
    <div>
      <PageHeader
        title="Selection rounds"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 text-emerald-600" /> Live · updates every {LIVE_MS / 1000}s{updatedAt ? ` · last ${fmtTime(updatedAt)}` : ''}
          </span>
        }
        actions={
          <>
            <Select value={examId} onChange={(e) => setParam('exam', e.target.value)} className="w-full sm:w-64" aria-label="Examination">
              <option value="">All examinations</option>
              {exams.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.title}
                </option>
              ))}
            </Select>
            <Button icon={Trophy} disabled={!exam} title={exam ? '' : 'Choose an examination first'} onClick={() => setShortlisting(true)} className="w-full sm:w-auto">
              Shortlist for Round 2
            </Button>
          </>
        }
      />
      {!exam && <p className="-mt-3 mb-4 text-xs text-slate-500">Choose an examination to shortlist candidates by cut-off.</p>}

      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {STAGES.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setParam('stage', st === 'ONLINE_TEST' ? '' : st)}
            className={cx(
              'rounded-xl border px-3 py-2.5 text-left transition-colors',
              stage === st ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 bg-white hover:bg-slate-50',
            )}
          >
            <p className="truncate text-xs text-slate-500">{STAGE_LABELS[st]}</p>
            <p className="text-xl font-semibold tabular-nums text-slate-900">{summary ? summary[st] : '–'}</p>
          </button>
        ))}
      </div>

      <div>
        <Card>
          <div className="border-b border-slate-100 p-3 sm:p-4">
            <div className="relative">
              <Search className="absolute top-3 left-3 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9"
                placeholder={`Search ${STAGE_LABELS[stage]} candidates`}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          {!list ? (
            <Spinner />
          ) : !list.data.length ? (
            <EmptyState icon={Trophy} title={`No candidates in ${STAGE_LABELS[stage]}`} description={stage === 'ONLINE_TEST' ? 'Students appear here after they finish the online test.' : 'Move candidates here using the decision buttons.'} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
                {list.data.map((c) => (
                  <DataCard
                    key={c._id}
                    title={
                      <button type="button" className="text-left hover:underline" onClick={() => setOpenId(c._id)}>
                        {c.fullName}
                      </button>
                    }
                    subtitle={c.universityName}
                    badge={
                      <span className="flex flex-col items-end gap-1">
                        <StageBadge stage={c.stage} />
                        {c.autoQualified && <Badge color="green">Auto · passed</Badge>}
                      </span>
                    }
                    actions={
                      <>
                        <Button variant="ghost" size="sm" icon={MessageSquare} onClick={() => setOpenId(c._id)} className="mr-auto">
                          Notes
                        </Button>
                        {isActive(c.stage) ? (
                          <>
                            <Button variant="ghost" size="sm" icon={X} className="text-red-600" onClick={() => decide(c, 'REJECT')}>
                              Reject
                            </Button>
                            <Button variant="success" size="sm" icon={Check} loading={acting === c._id} onClick={() => decide(c, 'ADVANCE')}>
                              {c.stage === 'ROUND_2' ? 'Final round' : c.stage === 'FINAL_ROUND' ? 'Select' : 'Round 2'}
                            </Button>
                          </>
                        ) : (
                          <Button variant="ghost" size="sm" icon={Undo2} loading={acting === c._id} onClick={() => decide(c, 'REVERT')}>
                            Undo
                          </Button>
                        )}
                      </>
                    }
                  >
                    <KV label="Online test">
                      <b>{c.result.percentage}%</b> <span className="text-xs text-slate-500">({c.result.totalScore}/{c.result.maxScore})</span>
                    </KV>
                    <KV label="Result">
                      <ResultBadge result={c.result} />
                    </KV>
                    {!examId && (
                      <KV label="Examination" full>
                        {c.exam?.title}
                      </KV>
                    )}
                    <KV label="Notes" full>
                      {c.notes?.plain ? (
                        <span className="line-clamp-2 text-sm">
                          {c.notes.plain} <span className="text-xs text-slate-400">· {c.notes.updatedBy?.name}, {fmtAgo(c.notes.updatedAt)}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">No notes yet</span>
                      )}
                    </KV>
                  </DataCard>
                ))}
              </div>
              <Pagination meta={list.meta} onPage={setPage} />
            </>
          )}
        </Card>

      </div>

      <CandidateModal
        id={openId}
        version={version}
        acting={acting}
        onClose={() => {
          setOpenId(null);
          if (params.get('candidate')) setParam('candidate', '');
        }}
        onDecide={decide}
        onChanged={refresh}
      />
      <DecisionDialog
        pending={pending}
        onClose={() => setPending(null)}
        onDone={(newStage) => {
          if (newStage && pending) moveLocally(pending.candidate, newStage);
          setPending(null);
          setVersion((v) => v + 1);
          refresh();
        }}
      />
      <ShortlistModal
        open={shortlisting}
        exam={exam}
        onClose={() => setShortlisting(false)}
        onDone={() => {
          setShortlisting(false);
          refresh();
        }}
      />
    </div>
  );
}
