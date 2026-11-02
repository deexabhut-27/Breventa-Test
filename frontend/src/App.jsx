import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Spinner } from './components/ui.jsx';
import AdminLayout from './components/admin/AdminLayout.jsx';
import { AdminAuthProvider, RequireAdmin, RequirePermission } from './context/AdminAuthContext.jsx';
const Administrators = lazy(() => import('./pages/admin/Administrators.jsx'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard.jsx'));
const ExamDetail = lazy(() => import('./pages/admin/ExamDetail.jsx'));
const ExamEditor = lazy(() => import('./pages/admin/ExamEditor.jsx'));
const Exams = lazy(() => import('./pages/admin/Exams.jsx'));
const Login = lazy(() => import('./pages/admin/Login.jsx'));
const Monitoring = lazy(() => import('./pages/admin/Monitoring.jsx'));
const Questions = lazy(() => import('./pages/admin/Questions.jsx'));
const ResultDetail = lazy(() => import('./pages/admin/ResultDetail.jsx'));
const Results = lazy(() => import('./pages/admin/Results.jsx'));
const Selection = lazy(() => import('./pages/admin/Selection.jsx'));
const Settings = lazy(() => import('./pages/admin/Settings.jsx'));
const Universities = lazy(() => import('./pages/admin/Universities.jsx'));
const Students = lazy(() => import('./pages/admin/Students.jsx'));
const ExamLanding = lazy(() => import('./pages/student/ExamLanding.jsx'));
const ExamRoom = lazy(() => import('./pages/student/ExamRoom.jsx'));
const Finished = lazy(() => import('./pages/student/Finished.jsx'));
const Instructions = lazy(() => import('./pages/student/Instructions.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const Home = lazy(() => import('./pages/student/Home.jsx'));

// Each page is downloaded only when visited, so students opening an exam link never download
// the admin panel, charts or the notes editor.
export default function App() {
  return (
    <Suspense fallback={<Spinner className="h-screen" />}>
      <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/exam/:slug" element={<ExamLanding />} />
      <Route path="/exam/:slug/instructions" element={<Instructions />} />
      <Route path="/exam/:slug/test" element={<ExamRoom />} />
      <Route path="/exam/:slug/finished" element={<Finished />} />

      <Route path="/admin/*" element={<AdminAuthProvider><AdminRoutes /></AdminAuthProvider>} />
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<RequirePermission permission="students"><Students /></RequirePermission>} />
        <Route path="universities" element={<RequirePermission permission="students"><Universities /></RequirePermission>} />
        <Route path="exams" element={<RequirePermission permission="exams"><Exams /></RequirePermission>} />
        <Route path="exams/new" element={<RequirePermission permission="exams"><ExamEditor /></RequirePermission>} />
        <Route path="exams/:id" element={<RequirePermission permission="exams"><ExamDetail /></RequirePermission>} />
        <Route path="exams/:id/edit" element={<RequirePermission permission="exams"><ExamEditor /></RequirePermission>} />
        <Route path="questions" element={<RequirePermission permission="questions"><Questions /></RequirePermission>} />
        <Route path="monitoring" element={<RequirePermission permission="monitoring"><Monitoring /></RequirePermission>} />
        <Route path="results" element={<RequirePermission permission="results"><Results key="results" /></RequirePermission>} />
        <Route path="results/:id" element={<RequirePermission permission="results"><ResultDetail /></RequirePermission>} />
        <Route path="terminated" element={<RequirePermission permission="results"><Results key="terminated" terminatedOnly /></RequirePermission>} />
        <Route path="selection" element={<RequirePermission permission="candidates"><Selection /></RequirePermission>} />
        <Route path="administrators" element={<RequirePermission permission="admins"><Administrators /></RequirePermission>} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound admin />} />
      </Route>
    </Routes>
  );
}
