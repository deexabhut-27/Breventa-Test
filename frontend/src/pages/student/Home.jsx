import { CalendarClock, ChevronRight, Clock, ListChecks } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import CompanyIntro from '../../components/CompanyIntro.jsx';
import { Card, Spinner } from '../../components/ui.jsx';
import { ADMIN_TOKEN_KEY, adminApi, errorMessage, publicApi } from '../../lib/api.js';
import { fmtDateTime } from '../../lib/format.js';
import StudentShell from './StudentShell.jsx';

/**
 * Public landing page at "/". Students see the examinations open for registration.
 * Only a browser with a valid admin session is forwarded to the admin panel; the admin
 * panel itself is never linked from here.
 */
export default function Home() {
  const [adminChecked, setAdminChecked] = useState(!localStorage.getItem(ADMIN_TOKEN_KEY));
  const [isAdmin, setIsAdmin] = useState(false);
  const [exams, setExams] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (adminChecked) return;
    adminApi
      .get('/admin/auth/me')
      .then(() => setIsAdmin(true))
      .catch(() => localStorage.removeItem(ADMIN_TOKEN_KEY))
      .finally(() => setAdminChecked(true));
  }, [adminChecked]);

  useEffect(() => {
    publicApi
      .get('/public/exams')
      .then((res) => setExams(res.data.data))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (!adminChecked) return <Spinner className="h-screen" />;
  if (isAdmin) return <Navigate to="/admin" replace />;

  return (
    <StudentShell title="Online Examinations" wide>
      <CompanyIntro />
      <div className="mt-8 mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Open examinations</h2>
        <p className="mt-1 text-sm text-slate-600">Select your examination to continue, or open the examination link shared by your placement cell.</p>
      </div>
      {error ? (
        <Card className="p-6 text-center text-red-700">{error}</Card>
      ) : !exams ? (
        <Spinner />
      ) : !exams.length ? (
        <Card className="p-8 text-center text-slate-600">There are no examinations open right now. Please use the link shared by your placement cell.</Card>
      ) : (
        <div className="space-y-3">
          {exams.map((e) => (
            <Link key={e.slug} to={`/exam/${e.slug}`} className="block">
              <Card className="flex items-center gap-4 p-5 transition-colors hover:border-brand-500">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{e.title}</p>
                  {e.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{e.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <ListChecks className="h-3.5 w-3.5" /> {e.totalQuestions} questions
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {e.durationMinutes} minutes
                    </span>
                    {(e.startAt || e.endAt) && (
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" /> {e.startAt ? `Opens ${fmtDateTime(e.startAt)}` : ''} {e.endAt ? `· Closes ${fmtDateTime(e.endAt)}` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </StudentShell>
  );
}
