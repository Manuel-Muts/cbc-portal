import express from 'express';
import verifyToken from '../middleware/verifyToken.js';
import {
  downloadTeacherPlanningPdf,
  createSchemeLessonDraftHandler,
  lessonPlanHandlers,
  schemeOfWorkHandlers
} from '../controllers/teacherPlanningController.js';
import {
  generateTeacherPlanningDraft,
  teacherCurriculumOptions
} from '../controllers/teacherCurriculumController.js';

const router = express.Router();

router.use(verifyToken);
router.use((req, res, next) => {
  if (!['teacher', 'classteacher'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Teacher access required.' });
  }
  next();
});

router.get('/pdf/:entity/:id', downloadTeacherPlanningPdf);
router.get('/curriculum/options', teacherCurriculumOptions);
router.post('/generate', generateTeacherPlanningDraft);
router.get('/schemes', schemeOfWorkHandlers.list);
router.post('/schemes', schemeOfWorkHandlers.create);
router.post('/schemes/:id/lesson-drafts', createSchemeLessonDraftHandler());
router.put('/schemes/:id', schemeOfWorkHandlers.update);
router.delete('/schemes/:id', schemeOfWorkHandlers.remove);

router.get('/lessons', lessonPlanHandlers.list);
router.post('/lessons', lessonPlanHandlers.create);
router.put('/lessons/:id', lessonPlanHandlers.update);
router.delete('/lessons/:id', lessonPlanHandlers.remove);

export default router;
