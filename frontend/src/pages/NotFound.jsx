import { Link } from 'react-router-dom';

export default function NotFound({ admin }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <p className="mt-2 text-slate-600">The page you are looking for does not exist.</p>
      {admin && (
        <Link to="/admin" className="mt-4 text-sm font-medium text-brand-700 underline">
          Back to dashboard
        </Link>
      )}
    </div>
  );
}
