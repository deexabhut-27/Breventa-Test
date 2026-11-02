import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Spinner } from '../../components/ui.jsx';
import { errorMessage, studentApi, studentStore } from '../../lib/api.js';
import StudentShell from './StudentShell.jsx';

export default function Finished() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    studentStore.clearSession(slug);
    if (!studentStore.token(slug)) {
      navigate(`/exam/${slug}`, { replace: true });
      return;
    }
    studentApi(slug)
      .get('/student/me')
      .then((res) => {
        if (res.data.data.attempts.hasActiveAttempt || res.data.data.attempts.retakeAllowed) navigate(`/exam/${slug}/instructions`, { replace: true });
        else setData(res.data.data);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [slug, navigate]);

  if (error)
    return (
      <StudentShell title="Examination">
        <Card className="p-6 text-center text-red-700">{error}</Card>
      </StudentShell>
    );
  if (!data) return <Spinner className="h-screen" />;
  const terminated = data.attempts.terminated;

  return (
    <StudentShell title={data.exam.title}>
      <Card className="p-8 text-center">
        {terminated ? <XCircle className="mx-auto h-14 w-14 text-red-500" /> : <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />}
        <h1 className="mt-4 text-xl font-semibold">{terminated ? 'Examination terminated' : data.attempts.attemptsUsed ? 'Examination submitted' : 'No submission yet'}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {terminated
            ? data.attempts.blockedReason
            : data.attempts.attemptsUsed
              ? 'Thank you, ' + data.student.fullName + '. Your answers have been recorded and evaluated. Results will be shared by your placement cell.'
              : 'You have not started this examination.'}
        </p>
        <p className="mt-6 text-xs text-slate-400">You may now close this window.</p>
      </Card>
    </StudentShell>
  );
}
