import { Activity, Ban, Send, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, CardHeader, ConfirmDialog, DataCard, EmptyState, ErrorState, Field, Input, KV, PageHeader, ResponsiveList, Select, Spinner, StatCard, Table, Td, Th } from '../../components/ui.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, errorMessage } from '../../lib/api.js';
import { fmtClock, fmtTime, humanize } from '../../lib/format.js';

const REFRESH_MS = 5000;
const EVENT_COLOR = { TAB_SWITCH: 'red', WINDOW_HIDDEN: 'red', NAVIGATION: 'red', HEARTBEAT_LOST: 'amber', SESSION_REPLACED: 'purple', PAGE_UNLOAD: 'amber', PAGE_RELOAD: 'blue', SCREENSHOT_ATTEMPT: 'red', COPY_ATTEMPT: 'red' };

export default function Monitoring() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const exam = params.get('exam') || '';
  const [exams, setExams] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [terminating, setTerminating] = useState(null);
  const [submitting, setSubmitting] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    adminApi.get('/admin/exams', { params: { limit: 100 } }).then((res) => setExams(res.data.data)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    // Skip while a request is still running, or while this tab is in the background.
    if (inFlight.current || document.visibilityState === 'hidden') return;
    inFlight.current = true;
    try {
      const res = await adminApi.get('/admin/monitoring', { params: { exam: exam || undefined } });
      setData(res.data.data);
      setUpdatedAt(new Date());
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      inFlight.current = false;
    }
  }, [exam]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const terminate = async () => {
    setBusy(true);
    try {
      await adminApi.post(`/admin/attempts/${terminating._id}/terminate`, { reason });
      toast.success('Attempt terminated');
      setTerminating(null);
      setReason('');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const forceSubmit = async () => {
    setBusy(true);
    try {
      await adminApi.post(`/admin/attempts/${submitting._id}/force-submit`);
      toast.success('Attempt submitted');
      setSubmitting(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Live Monitoring"
        subtitle={updatedAt ? `Auto-refreshes every ${REFRESH_MS / 1000}s · last update ${fmtTime(updatedAt)}` : 'Loading…'}
        actions={
          <Select value={exam} onChange={(e) => setParams(e.target.value ? { exam: e.target.value } : {})} className="w-full sm:w-64" aria-label="Examination">
            <option value="">All examinations</option>
            {exams.map((e) => (
              <option key={e._id} value={e._id}>
                {e.title}
              </option>
            ))}
          </Select>
        }
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {!data ? (
        !error && <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label="In progress" value={data.stats.inProgress} icon={Activity} tone="blue" />
            <StatCard label="Disconnected" value={data.stats.disconnected} icon={WifiOff} tone="amber" />
            <StatCard label="With violations" value={data.stats.withViolations} tone="purple" />
            <StatCard label="Terminated (1h)" value={data.stats.terminatedLastHour} tone="red" />
            <StatCard label="Completed (1h)" value={data.stats.completedLastHour} tone="green" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-3">
            <Card className="2xl:col-span-2">
              <CardHeader title="Active attempts" />
              {!data.attempts.length ? (
                <EmptyState icon={Activity} title="No examinations in progress" />
              ) : (
                <ResponsiveList
                  breakpoint="lg"
                  table={
                <Table>
                  <thead>
                    <tr>
                      <Th>Student</Th>
                      <Th>Progress</Th>
                      <Th className="text-right">Time left</Th>
                      <Th>Connection</Th>
                      <Th className="text-right">Violations</Th>
                      <Th>Last event</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.attempts.map((a) => {
                      const pct = Math.round((a.answered / a.questionCount) * 100);
                      return (
                        <tr key={a._id} className={a.connectionState === 'DISCONNECTED' ? 'bg-amber-50/50' : ''}>
                          <Td>
                            <p className="font-medium">{a.student?.fullName}</p>
                            <p className="text-xs text-slate-500">{a.student?.universityName}</p>
                            {!exam && <p className="text-xs text-slate-400">{a.examination?.title}</p>}
                          </Td>
                          <Td>
                            <div className="w-32">
                              <div className="h-1.5 rounded-full bg-slate-100">
                                <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {a.answered} / {a.questionCount} answered
                              </p>
                            </div>
                          </Td>
                          <Td className="text-right font-mono tabular-nums">{fmtClock(a.remainingMs)}</Td>
                          <Td>
                            {a.connectionState === 'ONLINE' ? (
                              <Badge color="green">
                                <Wifi className="h-3 w-3" /> Online
                              </Badge>
                            ) : (
                              <Badge color="amber">
                                <WifiOff className="h-3 w-3" /> Lost
                              </Badge>
                            )}
                            <p className="mt-0.5 text-xs text-slate-400">{a.secondsSinceHeartbeat}s ago</p>
                          </Td>
                          <Td className="text-right tabular-nums">
                            <span className={a.violationCount ? 'font-semibold text-red-600' : ''}>
                              {a.violationCount}/{a.policy.maxViolations}
                            </span>
                          </Td>
                          <Td className="text-xs">{a.lastEvent ? `${humanize(a.lastEvent.type)} · ${fmtTime(a.lastEvent.at)}` : '—'}</Td>
                          <Td className="text-right whitespace-nowrap">
                            <Button variant="ghost" size="sm" icon={Send} onClick={() => setSubmitting(a)} aria-label="Force submit" title="Force submit" />
                            <Button variant="ghost" size="sm" icon={Ban} className="text-red-600" onClick={() => setTerminating(a)} aria-label="Terminate" title="Terminate" />
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
                  }
                  cards={
                    data.attempts.map((a) => {
                      const pct = Math.round((a.answered / a.questionCount) * 100);
                      return (
                        <DataCard
                          key={a._id}
                          className={a.connectionState === 'DISCONNECTED' ? 'border-amber-300 bg-amber-50/40' : ''}
                          title={a.student?.fullName}
                          subtitle={`${a.student?.universityName || ''}${!exam && a.examination?.title ? ` · ${a.examination.title}` : ''}`}
                          badge={
                            a.connectionState === 'ONLINE' ? (
                              <Badge color="green">
                                <Wifi className="h-3 w-3" /> Online
                              </Badge>
                            ) : (
                              <Badge color="amber">
                                <WifiOff className="h-3 w-3" /> Lost
                              </Badge>
                            )
                          }
                          actions={
                            <>
                              <Button variant="ghost" size="sm" icon={Send} onClick={() => setSubmitting(a)}>
                                Submit
                              </Button>
                              <Button variant="ghost" size="sm" icon={Ban} className="text-red-600" onClick={() => setTerminating(a)}>
                                Terminate
                              </Button>
                            </>
                          }
                        >
                          <KV label="Progress" full>
                            <div className="h-1.5 rounded-full bg-slate-100">
                              <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-slate-500">
                              {a.answered} / {a.questionCount} answered
                            </span>
                          </KV>
                          <KV label="Time left">
                            <span className="font-mono">{fmtClock(a.remainingMs)}</span>
                          </KV>
                          <KV label="Violations">
                            <span className={a.violationCount ? 'font-semibold text-red-600' : ''}>
                              {a.violationCount}/{a.policy.maxViolations}
                            </span>
                          </KV>
                          <KV label="Last heartbeat">{a.secondsSinceHeartbeat}s ago</KV>
                          <KV label="Last event">{a.lastEvent ? `${humanize(a.lastEvent.type)} · ${fmtTime(a.lastEvent.at)}` : '—'}</KV>
                        </DataCard>
                      );
                    })
                  }
                />
              )}
            </Card>

            <Card>
              <CardHeader title="Recent events" subtitle="Last hour" />
              {!data.recentEvents.length ? (
                <p className="p-5 text-sm text-slate-500">No events.</p>
              ) : (
                <ul className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
                  {data.recentEvents.map((e, i) => (
                    <li key={`${e._id}-${i}`} className="px-5 py-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{e.student?.fullName || 'Student'}</span>
                        <span className="text-xs text-slate-400">{fmtTime(e.event.at)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge color={EVENT_COLOR[e.event.type] || 'gray'}>{humanize(e.event.type)}</Badge>
                        {e.event.counted && <span className="text-xs font-medium text-red-600">counted</span>}
                      </div>
                      {e.event.reason && <p className="mt-1 text-xs text-slate-500">{e.event.reason}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!terminating}
        title="Terminate attempt"
        message={`Terminate ${terminating?.student?.fullName}'s examination? Saved answers are evaluated and the attempt is marked as terminated.`}
        confirmLabel="Terminate"
        loading={busy}
        onConfirm={() => (reason.trim().length >= 3 ? terminate() : toast.error('Enter a reason (at least 3 characters)'))}
        onClose={() => setTerminating(null)}
      >
        <Field label="Reason" className="mt-4" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Impersonation reported by invigilator" />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={!!submitting}
        title="Submit attempt"
        message={`Submit ${submitting?.student?.fullName}'s examination now? It will be evaluated as a normal completed attempt.`}
        confirmLabel="Submit now"
        variant="primary"
        loading={busy}
        onConfirm={forceSubmit}
        onClose={() => setSubmitting(null)}
      />
    </div>
  );
}
