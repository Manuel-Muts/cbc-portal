import assert from 'node:assert/strict';
import { createTeacherTermSchemeController, validateTermlyPlan } from '../controllers/teacherTermSchemeController.js';

const curriculumUnit = {
  grade: 'Grade 7',
  subject: 'English',
  strand: 'Listening and Speaking',
  subStrand: 'Listening Comprehension',
  specificLearningOutcomes: ['Identify key ideas in a short oral text.'],
  suggestedLearningExperiences: ['Listen to and discuss an oral text.'],
  resources: ['Audio recording'],
  assessmentGuidance: ['Identify key ideas.'],
  source: {
    title: 'Grade 7 English Curriculum Design',
    url: 'https://kicd.ac.ke/curriculum/grade-7-english',
    revision: 'Revised 2024'
  }
};
const weeklyPlan = [
  {
    weekNumber: 1,
    isBreak: false,
    strand: 'Listening and Speaking',
    subStrand: 'Listening Comprehension',
    learningOutcomes: 'Identify main ideas.',
    learningExperiences: 'Listen and discuss.',
    resources: 'Audio recording.',
    assessment: 'Oral questions.'
  },
  {
    weekNumber: 2,
    isBreak: true,
    strand: '',
    subStrand: '',
    learningOutcomes: '',
    learningExperiences: '',
    resources: '',
    assessment: ''
  },
  {
    weekNumber: 3,
    isBreak: false,
    strand: 'Listening and Speaking',
    subStrand: 'Listening Comprehension',
    learningOutcomes: 'Summarize spoken information.',
    learningExperiences: 'Retell a short oral text.',
    resources: 'Audio recording.',
    assessment: 'Learner summary.'
  }
];
const input = {
  grade: 'Grade 7',
  subject: 'English',
  term: 'Term 2',
  weeksInTerm: 3,
  breakWeeks: [2]
};
const invoke = async (handler, body = input) => {
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
  await handler({ body, user: { id: 'teacher-1', role: 'teacher' } }, response);
  return response;
};

assert.equal(validateTermlyPlan({ weeklyPlan, weeksInTerm: 3, breakWeeks: [2] }).weeklyPlan.length, 3);
assert.match(validateTermlyPlan({
  weeklyPlan: weeklyPlan.map((week, index) => ({ ...week, weekNumber: index + 2 })),
  weeksInTerm: 3,
  breakWeeks: [2]
}).error, /week numbers/);
assert.match(validateTermlyPlan({
  weeklyPlan: weeklyPlan.map(week => week.weekNumber === 2
    ? { ...week, learningExperiences: 'Teach during the break' }
    : week),
  weeksInTerm: 3,
  breakWeeks: [2]
}).error, /Break week 2/);

let generationCalls = 0;
const enabledController = createTeacherTermSchemeController({
  isEnabled: () => true,
  listUnits: async () => [curriculumUnit],
  generatePlan: async request => {
    generationCalls += 1;
    assert.deepEqual(request.breakWeeks, [2]);
    assert.equal(request.curriculumUnits[0].source.title, curriculumUnit.source.title);
    assert.equal('teacherId' in request, false);
    return weeklyPlan;
  },
  logger: { error() {} }
});
const generated = await invoke(enabledController);
assert.equal(generated.statusCode, 200);
assert.deepEqual(generated.payload.draft.breakWeeks, [2]);
assert.equal(generated.payload.draft.weeklyPlan.length, 3);
assert.deepEqual(generated.payload.draft.curriculumSources, [{
  title: curriculumUnit.source.title,
  url: curriculumUnit.source.url,
  revision: curriculumUnit.source.revision
}]);
assert.equal(generationCalls, 1);

const disabledController = createTeacherTermSchemeController({
  isEnabled: () => false,
  generatePlan: async () => { throw new Error('Must not call provider'); },
  logger: { error() {} }
});
const disabled = await invoke(disabledController);
assert.equal(disabled.statusCode, 503);
assert.equal(disabled.payload.code, 'TERM_AI_DISABLED');

const invalidBreaks = await invoke(enabledController, { ...input, breakWeeks: [2, 2] });
assert.equal(invalidBreaks.statusCode, 400);
assert.equal(generationCalls, 1);

const missingCurriculum = createTeacherTermSchemeController({
  isEnabled: () => true,
  listUnits: async () => [],
  logger: { error() {} }
});
const noUnits = await invoke(missingCurriculum);
assert.equal(noUnits.statusCode, 404);
assert.equal(noUnits.payload.code, 'CURRICULUM_UNITS_NOT_FOUND');

const invalidProviderOutput = createTeacherTermSchemeController({
  isEnabled: () => true,
  listUnits: async () => [curriculumUnit],
  generatePlan: async () => weeklyPlan.slice(1),
  logger: { error() {} }
});
const invalidOutput = await invoke(invalidProviderOutput);
assert.equal(invalidOutput.statusCode, 502);
assert.equal(invalidOutput.payload.code, 'TERM_AI_INVALID_RESPONSE');

console.log('Teacher term scheme controller tests passed');
