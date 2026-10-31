import { Route, Routes } from 'react-router-dom';
import AdminLayout from './components/admin/AdminLayout.jsx';
import { AdminAuthProvider, RequireAdmin, RequirePermission } from './context/AdminAuthContext.jsx';
import Administrators from './pages/admin/Administrators.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';
import ExamDetail from './pages/admin/ExamDetail.jsx';
import ExamEditor from './pages/admin/ExamEditor.jsx';
import Exams from './pages/admin/Exams.jsx';
import Login from './pages/admin/Login.jsx';
import Monitoring from './pages/admin/Monitoring.jsx';
import Questions from './pages/admin/Questions.jsx';
import ResultDetail from './pages/admin/ResultDetail.jsx';
import Results from './pages/admin/Results.jsx';
import Settings from './pages/admin/Settings.jsx';
import Students from './pages/admin/Students.jsx';
import ExamLanding from './pages/student/ExamLanding.jsx';
import ExamRoom from './pages/student/ExamRoom.jsx';
import Finished from './pages/student/Finished.jsx';
import Instructions from './pages/student/Instructions.jsx';
import NotFound from './pages/NotFound.jsx';
import Home from './pages/student/Home.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/exam/:slug" element={<ExamLanding />} />
      <Route path="/exam/:slug/instructions" element={<Instructions />} />
      <Route path="/exam/:slug/test" element={<ExamRoom />} />
      <Route path="/exam/:slug/finished" element={<Finished />} />

      <Route path="/admin/*" element={<AdminAuthProvider><AdminRoutes /></AdminAuthProvider>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<RequirePermission permission="students"><Students /></RequirePermission>} />
        <Route path="exams" element={<RequirePermission permission="exams"><Exams /></RequirePermission>} />
        <Route path="exams/new" element={<RequirePermission permission="exams"><ExamEditor /></RequirePermission>} />
        <Route path="exams/:id" element={<RequirePermission permission="exams"><ExamDetail /></RequirePermission>} />
        <Route path="exams/:id/edit" element={<RequirePermission permission="exams"><ExamEditor /></RequirePermission>} />
        <Route path="questions" element={<RequirePermission permission="questions"><Questions /></RequirePermission>} />
        <Route path="monitoring" element={<RequirePermission permission="monitoring"><Monitoring /></RequirePermission>} />
        <Route path="results" element={<RequirePermission permission="results"><Results key="results" /></RequirePermission>} />
        <Route path="results/:id" element={<RequirePermission permission="results"><ResultDetail /></RequirePermission>} />
        <Route path="terminated" element={<RequirePermission permission="results"><Results key="terminated" terminatedOnly /></RequirePermission>} />
        <Route path="administrators" element={<RequirePermission superAdmin><Administrators /></RequirePermission>} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound admin />} />
      </Route>
    </Routes>
  );
}
