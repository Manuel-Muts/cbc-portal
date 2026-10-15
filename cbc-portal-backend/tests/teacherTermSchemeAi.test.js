import assert from 'node:assert/strict';
import {
  generateGeminiLessonPlan,
  generateGeminiTermScheme,
  isTeacherTermAiEnabled
} from '../services/teacherTermSchemeAi.js';

const env = {
  TEACHER_TERM_AI_ENABLED: 'true',
  TEACHER_TERM_AI_ELIGIBILITY_APPROVED: 'true',
  GEMINI_API_KEY: 'test-secret'
};
assert.equal(isTeacherTermAiEnabled({ ...env, TEACHER_TERM_AI_ENABLED: 'false' }), false);
assert.equal(isTeacherTermAiEnabled({ ...env, TEACHER_TERM_AI_ELIGIBILITY_APPROVED: 'false' }), false);
assert.equal(isTeacherTermAiEnabled({ ...env, GEMINI_API_KEY: '' }), false);

let request;
const plan = [{
  weekNumber: 1,
  isBreak: false,
  strand: 'Numbers',
  subStrand: 'Patterns',
  learningOutcomes: 'Identify patterns.',
  learningExperiences: 'Build patterns.',
  resources: 'Number cards.',
  assessment: 'Explain a pattern.'
}];
const result = await generateGeminiTermScheme({
  grade: 'Grade 4',
  subject: 'Mathematics',
  term: 'Term 1',
  weeksInTerm: 1,
  breakWeeks: [],
  curriculumUnits: [{
    strand: 'Numbers',
    subStrand: 'Patterns',
    specificLearningOutcomes: ['Identify patterns.'],
    suggestedLearningExperiences: ['Build patterns.'],
    resources: ['Number cards.'],
    assessmentGuidance: ['Explain a pattern.']
  }],
  env,
  fetchImpl: async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: JSON.stringify({ weeklyPlan: plan }) }] }
        }]
      })
    };
  }
});
assert.deepEqual(result, plan);
assert.match(request.url, /gemini-2\.5-flash:generateContent$/);
assert.equal(request.options.headers['x-goog-api-key'], 'test-secret');
assert.equal(request.url.includes('test-secret'), false);
assert.equal(request.body.generationConfig.responseMimeType, 'application/json');
assert.equal(request.body.contents[0].parts[0].text.includes('learner'), false);

let lessonRequest;
const lesson = {
  topic: 'Patterns',
  lessonObjectives: 'Identify and explain patterns.',
  learningActivities: 'Learners build and describe patterns.',
  resources: 'Number cards.',
  assessment: 'Ask learners to extend a pattern.'
};
const lessonResult = await generateGeminiLessonPlan({
  grade: 'Grade 4',
  subject: 'Mathematics',
  term: 'Term 1',
  weekNumber: 1,
  weekPlan: {
    strand: 'Numbers',
    subStrand: 'Patterns',
    learningOutcomes: 'Identify patterns.',
    learningExperiences: 'Build patterns.',
    resources: 'Number cards.',
    assessment: 'Explain a pattern.'
  },
  env,
  fetchImpl: async (url, options) => {
    lessonRequest = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: JSON.stringify({ lessonPlan: lesson }) }] }
        }]
      })
    };
  }
});
assert.deepEqual(lessonResult, lesson);
assert.equal(lessonRequest.body.contents[0].parts[0].text.includes('Identify patterns.'), true);
assert.equal(lessonRequest.body.contents[0].parts[0].text.includes('learnerId'), false);

await assert.rejects(
  generateGeminiTermScheme({
    grade: 'Grade 4',
    subject: 'Mathematics',
    term: 'Term 1',
    weeksInTerm: 1,
    breakWeeks: [],
    curriculumUnits: [],
    env: {},
    fetchImpl: async () => { throw new Error('Feature flag should block the request.'); }
  }),
  error => error.code === 'TERM_AI_DISABLED'
);

await assert.rejects(
  generateGeminiLessonPlan({
    grade: 'Grade 4',
    subject: 'Mathematics',
    term: 'Term 1',
    weekNumber: 1,
    weekPlan: {},
    env: {},
    fetchImpl: async () => { throw new Error('Feature flag should block the request.'); }
  }),
  error => error.code === 'TERM_AI_DISABLED'
);

console.log('Teacher term scheme AI service tests passed');
