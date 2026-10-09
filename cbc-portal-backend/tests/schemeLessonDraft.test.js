import assert from 'node:assert/strict';
import { createSchemeLessonDraftHandler } from '../controllers/teacherPlanningController.js';

const scheme = {
  id: 'a1234567-b123-c123-d123-e12345678901',
  academicYear: 2026,
  term: 'Term 1',
  grade: 'Grade 5',
  subject: 'Mathematics',
  weekNumber: 3,
  strand: 'Numbers',
  subStrand: 'Multiplication',
  learningOutcomes: '1. Multiply whole numbers.\n2. Explain multiplication strategies.',
  learningExperiences: '- Use number lines.\n- Solve group problems.',
  resources: 'Number cards',
  assessment: 'Exit ticket'
};
const handler = createSchemeLessonDraftHandler({
  getRecord: async ({ teacherId, id }) => (
    teacherId === 'teacher-1' && id === scheme.id ? scheme : null
  ),
  logger: { error() {} }
});
const invoke = async ({ id = scheme.id, teacherId = 'teacher-1', body = {} } = {}) => {
  const response = {
    statusCode: 200,
    payload: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
  await handler({ params: { id }, user: { id: teacherId }, body }, response);
  return response;
};

const generated = await invoke({ body: { lessonsPerWeek: 2 } });
assert.equal(generated.statusCode, 200);
assert.equal(generated.payload.draft.lessons.length, 2);
assert.equal(generated.payload.draft.lessons[0].weekNumber, scheme.weekNumber);
assert.equal(generated.payload.draft.lessons[0].lessonNumber, 1);
assert.equal(generated.payload.draft.lessons[0].lessonObjectives, 'Multiply whole numbers.');
assert.equal(generated.payload.draft.lessons[1].lessonObjectives, 'Explain multiplication strategies.');
assert.equal(generated.payload.draft.lessons[0].schemeId, scheme.id);

const notOwned = await invoke({ teacherId: 'teacher-2', body: { lessonsPerWeek: 2 } });
assert.equal(notOwned.statusCode, 404);

console.log('Scheme-to-lesson draft tests passed');
