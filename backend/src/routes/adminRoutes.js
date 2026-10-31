import { Router } from 'express';
import multer from 'multer';
import * as auth from '../controllers/adminAuthController.js';
import { getDashboard } from '../controllers/dashboardController.js';
import * as exams from '../controllers/examController.js';
import * as monitoring from '../controllers/monitoringController.js';
import * as questions from '../controllers/questionController.js';
import * as results from '../controllers/resultController.js';
import * as students from '../controllers/studentAdminController.js';
import { requireAdmin, requirePermission as can, requireRole } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import { resultFilterSchema } from '../services/resultQuery.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import * as v from '../validators/index.js';

// 4 MB: Vercel caps request bodies at 4.5 MB.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1 } });
const id = validate({ params: v.idParams });
const superAdmin = requireRole('SUPER_ADMIN');
const exportQuery = resultFilterSchema.extend({ limit: resultFilterSchema.shape.limit.optional() });

const router = Router();

router.post('/auth/login', loginLimiter, validate({ body: v.adminLoginSchema }), h(auth.login));

router.use(h(requireAdmin));

router.get('/auth/me', h(auth.me));
router.put('/auth/profile', validate({ body: v.profileSchema }), h(auth.updateProfile));
router.put('/auth/password', validate({ body: v.passwordChangeSchema }), h(auth.changePassword));
router.get('/admins', superAdmin, h(auth.listAdmins));
router.post('/admins', superAdmin, validate({ body: v.createAdminSchema }), h(auth.createAdmin));
router.put('/admins/:id', superAdmin, id, validate({ body: v.updateAdminSchema }), h(auth.updateAdmin));
router.patch('/admins/:id/status', superAdmin, id, validate({ body: v.adminStatusSchema }), h(auth.setAdminStatus));
router.post('/admins/:id/reset-password', superAdmin, id, validate({ body: v.resetAdminPasswordSchema }), h(auth.resetAdminPassword));
router.delete('/admins/:id', superAdmin, id, h(auth.deleteAdmin));

// Dashboard and the read-only exam list (used as a filter on many pages) are open to every admin.
router.get('/dashboard', h(getDashboard));
router.get('/exams', validate({ query: v.examListSchema }), h(exams.listExams));

router.get('/questions/stats', can('questions', 'exams'), h(questions.questionStats));
router.get('/questions', can('questions'), validate({ query: v.questionListSchema }), h(questions.listQuestions));
router.get('/questions/export', can('questions'), validate({ query: v.questionExportSchema }), h(questions.exportQuestions));
router.get('/questions/import-template', can('questions'), h(questions.importTemplate));
router.post('/questions/import', can('questions'), upload.single('file'), h(questions.importQuestions));
router.post('/questions', can('questions'), validate({ body: v.questionSchema }), h(questions.createQuestion));
router.get('/questions/:id', can('questions'), id, h(questions.getQuestion));
router.put('/questions/:id', can('questions'), id, validate({ body: v.questionSchema }), h(questions.updateQuestion));
router.patch('/questions/:id/status', can('questions'), id, validate({ body: v.questionStatusSchema }), h(questions.setQuestionStatus));
router.delete('/questions/:id', can('questions'), id, h(questions.deleteQuestion));

router.post('/exams', can('exams'), validate({ body: v.examSchema }), h(exams.createExam));
router.get('/exams/:id', can('exams'), id, h(exams.getExam));
router.put('/exams/:id', can('exams'), id, validate({ body: v.examSchema }), h(exams.updateExam));
router.delete('/exams/:id', can('exams'), id, h(exams.deleteExam));
router.get('/exams/:id/availability', can('exams'), id, h(exams.availability));
router.post('/exams/:id/publish', can('exams'), id, h(exams.publishExam));
router.post('/exams/:id/unpublish', can('exams'), id, h(exams.unpublishExam));
router.post('/exams/:id/close', can('exams'), id, h(exams.closeExam));
router.post('/exams/:id/duplicate', can('exams'), id, h(exams.duplicateExam));

router.get('/students', can('students'), validate({ query: v.studentListSchema }), h(students.listStudents));
router.get('/students/:id', can('students'), id, h(students.getStudent));
router.put('/students/:id', can('students'), id, validate({ body: v.studentUpdateSchema }), h(students.updateStudent));
router.delete('/students/:id', can('students'), id, h(students.deleteStudent));

router.get('/monitoring', can('monitoring'), h(monitoring.liveMonitoring));
router.get('/attempts/:id', can('monitoring', 'results'), id, h(monitoring.attemptDetail));
router.post('/attempts/:id/terminate', can('monitoring'), id, validate({ body: v.terminateSchema }), h(monitoring.adminTerminate));
router.post('/attempts/:id/force-submit', can('monitoring'), id, h(monitoring.adminForceSubmit));

router.get('/results', can('results'), validate({ query: resultFilterSchema }), h(results.listResults));
router.get('/results/export/pdf', can('results'), validate({ query: exportQuery }), h(results.exportPdf));
router.get('/results/export/excel', can('results'), validate({ query: exportQuery }), h(results.exportExcel));
router.get('/results/summary', can('results'), validate({ query: exportQuery }), h(results.resultSummary));
router.get('/results/:id', can('results'), id, h(results.getResult));
router.get('/results/:id/pdf', can('results'), id, h(results.studentPdf));
router.post('/results/:id/reevaluate', can('results'), id, h(results.reevaluate));
router.delete('/results/:id', can('results'), id, h(results.deleteResult));

router.get('/audit-logs', superAdmin, validate({ query: v.auditListSchema }), h(results.listAuditLogs));

export default router;
