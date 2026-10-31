import { AlertTriangle, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '../../context/ToastContext.jsx';
import { adminApi, errorMessage } from '../../lib/api.js';
import { Button, Input, Modal } from '../ui.jsx';

/** Permanent, cascading exam delete. The admin must type the exam title to confirm. */
export default function DeleteExamDialog({ exam, onClose, onDeleted }) {
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setTyped(''), [exam]);
  if (!exam) return null;

  const a = exam.attemptCounts || {};
  const attempts = (a.IN_PROGRESS || 0) + (a.COMPLETED || 0) + (a.TERMINATED || 0);
  const matches = typed.trim() === exam.title.trim();

  const remove = async () => {
    setBusy(true);
    try {
      const res = await adminApi.delete(`/admin/exams/${exam._id}`);
      const r = res.data.data.removed;
      toast.success(`Deleted "${exam.title}" with ${r.students} registration(s), ${r.attempts} attempt(s) and ${r.results} result(s)`);
      onDeleted();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title="Delete examination permanently"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" icon={Trash2} disabled={!matches} loading={busy} onClick={remove}>
            Delete everything
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex gap-3 rounded-lg bg-red-50 p-3 text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p>This cannot be undone. The following will be removed from the database:</p>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          <li>The examination and its settings</li>
          <li>
            <b>{exam.registrations ?? 0}</b> student registration(s)
          </li>
          <li>
            <b>{attempts}</b> attempt(s) with all saved answers, results and monitoring logs
          </li>
        </ul>
        {a.IN_PROGRESS > 0 && (
          <p className="rounded-lg bg-amber-50 p-3 text-amber-800">
            <b>{a.IN_PROGRESS}</b> student(s) are taking this examination right now and will be signed out immediately.
          </p>
        )}
        <p className="text-slate-500">Questions in the question bank are not affected. Download any reports you need first.</p>
        <label className="block">
          <span className="mb-1.5 block text-slate-700">
            Type <b className="select-all">{exam.title}</b> to confirm
          </span>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
        </label>
      </div>
    </Modal>
  );
}
