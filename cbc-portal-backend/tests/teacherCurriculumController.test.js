import assert from 'node:assert/strict';
import { createTeacherCurriculumController } from '../controllers/teacherCurriculumController.js';

const unit = {
  grade: 'Grade 7',
  subject: 'English',
  strand: 'Listening and Speaking',
  subStrand: 'Listening Comprehension',
  specificLearningOutcomes: ['Identify key ideas in a short oral text.'],
  keyInquiryQuestions: ['How do we listen actively?'],
  coreCompetencies: ['Communication and collaboration'],
  values: ['Respect'],
  pertinentContemporaryIssues: ['Citizenship'],
  suggestedLearningExperiences: ['Learners listen to and discuss a short oral text.'],
  resources: ['Locally available audio recording'],
  assessmentGuidance: ['Ask learners to identify the key ideas.'],
  source: { title: 'Grade 7 English Curriculum Design', revision: 'Revised 2024' }
};
const controller = createTeacherCurriculumController({
  listOptions: async filters => [{ ...filters, strand: unit.strand, subStrand: unit.subStrand }],
  getUnit: async () => unit,
  getTermWeeks: async term => ({ 'Term 1': 13, 'Term 2': 14, 'Term 3': 9 })[term],
  logger: { error() {} }
});
const invoke = async (handler, { body = {}, query = {} } = {}) => {
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
  await handler({ body, query }, response);
  return response;
};

const options = await invoke(controller.options, {
  query: { grade: 'Grade 7', subject: 'English', term: 'Term 2' }
});
assert.equal(options.statusCode, 200);
assert.equal(options.payload.options[0].subStrand, unit.subStrand);
assert.equal(options.payload.teachingWeeks, 14);

const generated = await invoke(controller.generateDraft, {
  body: {
    grade: 'Grade 7',
    subject: 'English',
    term: 'Term 2',
    strand: unit.strand,
    subStrand: unit.subStrand,
    weekNumber: 14,
    lessonsPerWeek: 3
  }
});
assert.equal(generated.statusCode, 200);
assert.equal(generated.payload.draft.scheme.learningOutcomes, unit.specificLearningOutcomes[0]);
assert.equal(generated.payload.draft.lessons.length, 3);
assert.equal(generated.payload.draft.lessons[2].lessonNumber, 3);
assert.equal(generated.payload.draft.lessons[0].lessonObjectives, unit.specificLearningOutcomes[0]);
assert.equal(generated.payload.draft.teachingWeeks, 14);

const invalidWeek = await invoke(controller.generateDraft, {
  body: {
    grade: 'Grade 7',
    subject: 'English',
    term: 'Term 3',
    strand: unit.strand,
    subStrand: unit.subStrand,
    weekNumber: 10,
    lessonsPerWeek: 3
  }
});
assert.equal(invalidWeek.statusCode, 400);

const noOfficialUnit = createTeacherCurriculumController({
  getUnit: async () => null,
  getTermWeeks: async () => 13,
  logger: { error() {} }
});
const missingUnitResponse = await invoke(noOfficialUnit.generateDraft, {
  body: {
    grade: 'Grade 7',
    subject: 'English',
    term: 'Term 1',
    strand: 'Unverified strand',
    subStrand: 'Unverified sub-strand',
    weekNumber: 1,
    lessonsPerWeek: 1
  }
});
assert.equal(missingUnitResponse.statusCode, 404);
assert.equal(missingUnitResponse.payload.code, 'CURRICULUM_UNIT_NOT_FOUND');

console.log('Teacher curriculum controller tests passed');
