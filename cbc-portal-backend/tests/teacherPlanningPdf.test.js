import assert from 'node:assert/strict';
import { createPlanningPdf } from '../controllers/teacherPlanningController.js';

const countPages = pdf => [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
const record = {
  academicYear: 2026,
  term: 'Term 2',
  grade: 'Grade 4',
  subject: 'Mathematics',
  topic: 'Fractions',
  lessonDate: '2026-06-12',
  strand: 'Numbers',
  subStrand: 'Fractions',
  lessonObjectives: 'Identify and compare fractions.',
  learningActivities: 'Learners compare fraction models in pairs.',
  resources: 'Fraction strips and charts.',
  assessment: 'Observe explanations and review answers.',
  reflection: 'Provide additional practice where needed.'
};

const onePagePdf = await createPlanningPdf({
  entity: 'lessons',
  record,
  teacherName: 'Teacher Example'
});
assert.equal(onePagePdf.subarray(0, 4).toString(), '%PDF');
assert.equal(countPages(onePagePdf), 1, 'A short lesson plan should not create an unnecessary page');

const schemePdf = await createPlanningPdf({
  entity: 'schemes',
  record: { ...record, weekNumber: 2 },
  teacherName: 'Teacher Example'
});
assert.equal(countPages(schemePdf), 1, 'A short scheme should remain a single page');

const multiPagePdf = await createPlanningPdf({
  entity: 'lessons',
  record: {
    ...record,
    learningActivities: `${'Learners discuss and record their reasoning. '.repeat(160)}`
  },
  teacherName: 'Teacher Example'
});
assert.equal(multiPagePdf.subarray(0, 4).toString(), '%PDF');
assert.ok(countPages(multiPagePdf) > 1, 'Long lesson content should flow onto additional pages');

console.log('Teacher planning PDF layout tests passed');
