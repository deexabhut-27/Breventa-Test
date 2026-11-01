import { Activity, Award, CheckCircle2, FileWarning, Percent, TrendingUp, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader, DataCard, ErrorState, KV, PageHeader, ResponsiveList, ResultBadge, Select, Spinner, StatCard, Table, Td, Th } from '../../components/ui.jsx';
import { adminApi, errorMessage } from '../../lib/api.js';
import { useLivePoll } from '../../lib/useLivePoll.js';
import { useAdminAuth } from '../../context/AdminAuthContext.jsx';
import { DIFFICULTY_LABELS, STAGE_LABELS, STAGES, fmtDateTime } from '../../lib/format.js';

// Single-series charts: one hue, muted grid/axes, tooltip on hover (no legend needed).
const SERIES = '#2a78d6';
const AXIS = { fontSize: 12, fill: '#64748b' };

function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{label}</p>
      <p className="text-slate-600">
        {payload[0].value} {unit}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const [exams, setExams] = useState([]);
  const [exam, setExam] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    adminApi
      .get('/admin/dashboard', { params: { exam: exam || undefined } })
      .then((res) => setData(res.data.data))
      .catch((err) => setError(errorMessage(err)));
  }, [exam]);

  // Keep the dashboard current while it is open (pipeline moves, new results, live tests).
  useLivePoll(load, 15000, [load]);
  const { can } = useAdminAuth();
  useEffect(() => {
    adminApi.get('/admin/exams', { params: { limit: 100 } }).then((res) => setExams(res.data.data)).catch(() => {});
  }, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Spinner />;
  const s = data.stats;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of registrations, examinations and performance"
        actions={
          <Select value={exam} onChange={(e) => setExam(e.target.value)} className="w-full sm:w-64" aria-label="Filter by examination">
            <option value="">All examinations</option>
            {exams.map((e) => (
              <option key={e._id} value={e._id}>
                {e.title}
              </option>
            ))}
          </Select>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Registered students" value={s.totalStudents} icon={Users} />
        <StatCard label="Completed tests" value={s.completed} icon={CheckCircle2} tone="green" />
        <StatCard label="Ongoing tests" value={s.ongoing} icon={Activity} tone="blue" hint={s.ongoing ? <Link className="underline" to="/admin/monitoring">Open live monitor</Link> : null} />
        <StatCard label="Terminated tests" value={s.terminated} icon={FileWarning} tone="red" />
        <StatCard label="Average score" value={s.averageScore} icon={TrendingUp} tone="purple" hint={`Average ${s.averagePercentage}%`} />
        <StatCard label="Highest score" value={s.highestScore} icon={Award} tone="amber" hint={`Best ${s.highestPercentage}%`} />
        <StatCard label="Pass percentage" value={`${s.passPercentage}%`} icon={Percent} tone="green" hint={`${s.passed} of ${s.evaluated} evaluated`} />
        <StatCard
          label="Active question bank"
          value={Object.values(data.questionBank).reduce((a, b) => a + b, 0)}
          icon={Award}
          hint={['EASY', 'MEDIUM', 'HARD'].map((d) => `${DIFFICULTY_LABELS[d]} ${data.questionBank[d] || 0}`).join(' · ')}
        />
      </div>

      {data.pipeline && (
        <Card className="mt-4 sm:mt-6">
          <CardHeader
            title="Selection pipeline"
            subtitle="Candidates who finished the online test, by round"
            actions={can('candidates') ? <Link to={`/admin/selection${exam ? `?exam=${exam}` : ''}`} className="text-sm font-medium text-brand-700">Manage rounds</Link> : null}
          />
          <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-5 sm:p-4">
            {STAGES.map((st) => (
              <div key={st} className="rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="truncate text-xs text-slate-500">{STAGE_LABELS[st]}</p>
                <p className="text-xl font-semibold tabular-nums">{data.pipeline[st]}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Score distribution" subtitle="Number of students by percentage band" />
          <div className="h-52 p-3 sm:h-72 sm:p-4">
            <ResponsiveContainer>
              <BarChart data={data.scoreDistribution} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="range" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip unit="students" />} />
                <Bar dataKey="count" fill={SERIES} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Attempts started" subtitle="Last 14 days" />
          <div className="h-52 p-3 sm:h-72 sm:p-4">
            {data.dailyAttempts.length ? (
              <ResponsiveContainer>
                <BarChart data={data.dailyAttempts} barCategoryGap={2}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(d) => d.slice(5)} />
                  <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip unit="attempts" />} />
                  <Bar dataKey="count" fill={SERIES} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-slate-500">No attempts in the last 14 days.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Recent results" actions={<Link to="/admin/results" className="text-sm font-medium text-brand-700">View all</Link>} />
          {data.recentResults.length ? (
            <ResponsiveList
              breakpoint="md"
              table={
          <Table>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Examination</Th>
                  <Th className="text-right">Percentage</Th>
                  <Th>Result</Th>
                  <Th>Finished</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentResults.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50">
                    <Td>
                      <Link to={`/admin/results/${r._id}`} className="font-medium text-slate-900 hover:underline">
                        {r.studentName}
                      </Link>
                      <p className="text-xs text-slate-500">{r.universityName}</p>
                    </Td>
                    <Td>{r.examTitle}</Td>
                    <Td className="text-right tabular-nums">{r.percentage}%</Td>
                    <Td>
                      <ResultBadge result={r} />
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.endedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
              }
              cards={
              data.recentResults.map((r) => (
                <DataCard
                  key={r._id}
                  title={
                    <Link to={`/admin/results/${r._id}`} className="hover:underline">
                      {r.studentName}
                    </Link>
                  }
                  subtitle={r.universityName}
                  badge={<ResultBadge result={r} />}
                >
                  <KV label="Percentage">{r.percentage}%</KV>
                  <KV label="Finished">{fmtDateTime(r.endedAt)}</KV>
                  <KV label="Examination" full>
                    {r.examTitle}
                  </KV>
                </DataCard>
              ))
              }
            />
          ) : (
            <p className="p-6 text-sm text-slate-500">No results yet.</p>
          )}
        </Card>
        <Card>
          <CardHeader title="Top universities" subtitle="By number of evaluated students" />
          {data.universities.length ? (
            <ul className="divide-y divide-slate-100">
              {data.universities.map((u) => (
                <li key={u.name} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.count} students</p>
                  </div>
                  <span className="tabular-nums text-slate-700">{u.avgPercentage}% avg</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-sm text-slate-500">No data yet.</p>
          )}
        </Card>
      </div>

      {data.examPerformance.length > 0 && (
        <Card className="mt-4 sm:mt-6">
          <CardHeader title="Examination performance" />
          <ResponsiveList
            breakpoint="md"
            table={
          <Table>
            <thead>
              <tr>
                <Th>Examination</Th>
                <Th className="text-right">Evaluated</Th>
                <Th className="text-right">Average %</Th>
                <Th className="text-right">Pass rate</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.examPerformance.map((e) => (
                <tr key={e.id}>
                  <Td className="font-medium">{e.title}</Td>
                  <Td className="text-right tabular-nums">{e.count}</Td>
                  <Td className="text-right tabular-nums">{e.avgPercentage}%</Td>
                  <Td className="text-right tabular-nums">{e.passRate}%</Td>
                </tr>
              ))}
            </tbody>
          </Table>
            }
            cards={data.examPerformance.map((e) => (
              <DataCard key={e.id} title={e.title}>
                <KV label="Evaluated">{e.count}</KV>
                <KV label="Average">{e.avgPercentage}%</KV>
                <KV label="Pass rate">{e.passRate}%</KV>
              </DataCard>
            ))}
          />
        </Card>
      )}
    </div>
  );
}
