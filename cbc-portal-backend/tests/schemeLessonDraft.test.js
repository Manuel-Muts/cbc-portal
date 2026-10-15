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
  generateLessonPlan: async ({ weekPlan }) => ({
    topic: weekPlan.subStrand,
    lessonObjectives: weekPlan.learningOutcomes,
    learningActivities: weekPlan.learningExperiences,
    resources: weekPlan.resources,
    assessment: weekPlan.assessment
  }),
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

const generated = await invoke();
assert.equal(generated.statusCode, 200);
assert.equal(generated.payload.draft.lessons.length, 1);
assert.equal(generated.payload.draft.lessons[0].weekNumber, scheme.weekNumber);
assert.equal(generated.payload.draft.lessons[0].lessonNumber, 1);
assert.equal(
  generated.payload.draft.lessons[0].lessonObjectives,
  '1. Multiply whole numbers.\n2. Explain multiplication strategies.'
);
assert.equal(generated.payload.draft.lessons[0].learningActivities, '- Use number lines.\n- Solve group problems.');
assert.equal(generated.payload.draft.lessons[0].schemeId, scheme.id);

const notOwned = await invoke({ teacherId: 'teacher-2', body: { lessonsPerWeek: 2 } });
assert.equal(notOwned.statusCode, 404);

const termlyScheme = {
  ...scheme,
  schemeType: 'termly',
  weekNumber: null,
  weeksInTerm: 2,
  breakWeeks: [2],
  weeklyPlan: [{
    weekNumber: 1,
    isBreak: false,
    strand: 'Numbers',
    subStrand: 'Multiplication',
    learningOutcomes: 'Multiply whole numbers.',
    learningExperiences: 'Solve group problems.',
    resources: 'Number cards.',
    assessment: 'Exit ticket.'
  }, {
    weekNumber: 2,
    isBreak: true,
    strand: '',
    subStrand: '',
    learningOutcomes: '',
    learningExperiences: '',
    resources: '',
    assessment: ''
  }]
};
let generatedWeekPlan;
const termlyHandler = createSchemeLessonDraftHandler({
  getRecord: async ({ id }) => id === termlyScheme.id ? termlyScheme : null,
  generateLessonPlan: async ({ weekPlan }) => {
    generatedWeekPlan = weekPlan;
    return {
      topic: weekPlan.subStrand,
      lessonObjectives: weekPlan.learningOutcomes,
      learningActivities: weekPlan.learningExperiences,
      resources: weekPlan.resources,
      assessment: weekPlan.assessment
    };
  },
  logger: { error() {} }
});
const invokeTermly = async body => {
  const response = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
  await termlyHandler({
    params: { id: termlyScheme.id },
    user: { id: 'teacher-1' },
    body
  }, response);
  return response;
};
assert.equal((await invokeTermly({})).statusCode, 400);
assert.equal((await invokeTermly({ weekNumber: 2 })).statusCode, 400);
const termlyLessonDrafts = await invokeTermly({
  weekNumber: 1,
  weekPlan: { learningOutcomes: 'Untrusted client-supplied outcome.' }
});
assert.equal(termlyLessonDrafts.statusCode, 200);
assert.equal(termlyLessonDrafts.payload.draft.lessons[0].weekNumber, 1);
assert.equal(termlyLessonDrafts.payload.draft.lessons[0].lessonObjectives, 'Multiply whole numbers.');
assert.equal(generatedWeekPlan.learningOutcomes, 'Multiply whole numbers.');

console.log('Scheme-to-lesson draft tests passed');
