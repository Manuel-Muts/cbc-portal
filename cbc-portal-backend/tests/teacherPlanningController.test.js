import assert from 'node:assert/strict';
import { createTeacherPlanningController } from '../controllers/teacherPlanningController.js';

const stored = new Map();
let lastOwnerId;
const savedScheme = {
  id: 'a1234567-b123-c123-d123-e12345678901',
  academicYear: 2026,
  term: 'Term 2',
  grade: 'Grade 7',
  subject: 'English',
  weekNumber: 3,
  strand: 'Numbers',
  subStrand: 'Whole numbers',
  learningOutcomes: 'Outcome one.\nOutcome two.',
  learningExperiences: 'Experience one.\nExperience two.',
  resources: 'Charts',
  assessment: 'Questions'
};
const controller = createTeacherPlanningController({
  async listRecords({ entity, teacherId }) {
    lastOwnerId = teacherId;
    return [...stored.values()].filter(record => record.entity === entity && record.teacherId === teacherId);
  },
  async createRecord({ entity, teacherId, record }) {
    lastOwnerId = teacherId;
    const saved = { id: 'a1234567-b123-c123-d123-e12345678901', entity, teacherId, ...record };
    stored.set(saved.id, saved);
    return saved;
  },
  async updateRecord({ entity, teacherId, id, record }) {
    lastOwnerId = teacherId;
    const existing = stored.get(id);
    if (!existing || existing.teacherId !== teacherId || existing.entity !== entity) return null;
    const saved = { ...existing, ...record };
    stored.set(id, saved);
    return saved;
  },
  async deleteRecord({ entity, teacherId, id }) {
    lastOwnerId = teacherId;
    const existing = stored.get(id);
    if (!existing || existing.teacherId !== teacherId || existing.entity !== entity) return false;
    stored.delete(id);
    return true;
  },
  async getTeachingWeeks(term) {
    return { 'Term 1': 13, 'Term 2': 14, 'Term 3': 9 }[term];
  },
  async getRecord({ entity, teacherId, id }) {
    return entity === 'schemes' && teacherId === 'teacher-1' && id === savedScheme.id
      ? savedScheme
      : null;
  },
  logger: { error() {} }
});

const invoke = async (handler, { body = {}, id = 'a1234567-b123-c123-d123-e12345678901', teacherId = 'teacher-1' } = {}) => {
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
    },
    end() {
      this.ended = true;
      return this;
    }
  };
  await handler({ body, params: { id }, user: { id: teacherId } }, response);
  return response;
};

const validScheme = {
  academicYear: '2026',
  term: 'Term 1',
  grade: 'Grade 4',
  subject: 'Mathematics',
  weekNumber: '1',
  strand: 'Numbers',
  subStrand: 'Whole numbers'
};

const created = await invoke(controller.schemes.create, {
  body: { ...validScheme, teacherId: 'attacker-id' }
});
assert.equal(created.statusCode, 201);
assert.equal(created.payload.record.teacherId, 'teacher-1');
assert.equal(lastOwnerId, 'teacher-1');

const listed = await invoke(controller.schemes.list, { teacherId: 'teacher-2' });
assert.deepEqual(listed.payload.records, []);
assert.equal(lastOwnerId, 'teacher-2');

const invalidLesson = await invoke(controller.lessons.create, {
  body: {
    academicYear: '2026',
    term: 'Term 1',
    grade: 'Grade 4',
    subject: 'Mathematics',
    topic: 'Fractions',
    lessonDate: '2026-02-31'
  }
});
assert.equal(invalidLesson.statusCode, 400);

const updated = await invoke(controller.schemes.update, {
  body: { ...validScheme, subject: 'Updated mathematics' }
});
assert.equal(updated.statusCode, 200);
assert.equal(updated.payload.record.subject, 'Updated mathematics');

const deniedUpdate = await invoke(controller.schemes.update, {
  body: validScheme,
  teacherId: 'teacher-2'
});
assert.equal(deniedUpdate.statusCode, 404);

const deleted = await invoke(controller.schemes.remove);
assert.equal(deleted.statusCode, 204);
assert.equal(deleted.ended, true);

const validLesson = await invoke(controller.lessons.create, {
  body: {
    academicYear: '2026',
    term: 'Term 2',
    grade: 'Grade 7',
    subject: 'English',
    weekNumber: '3',
    lessonNumber: '3',
    schemeId: savedScheme.id,
    topic: 'Listening comprehension',
    lessonObjectives: 'Identify key ideas.',
    learningActivities: 'Listen and discuss.'
  }
});
assert.equal(validLesson.statusCode, 201);
assert.equal(validLesson.payload.record.weekNumber, 3);
assert.equal(validLesson.payload.record.lessonNumber, 3);
assert.equal(validLesson.payload.record.schemeId, savedScheme.id);

const otherTeacherScheme = await invoke(controller.lessons.create, {
  teacherId: 'teacher-2',
  body: {
    academicYear: '2026',
    term: 'Term 2',
    grade: 'Grade 7',
    subject: 'English',
    weekNumber: '3',
    schemeId: savedScheme.id,
    topic: 'Listening comprehension',
    lessonObjectives: 'Identify key ideas.',
    learningActivities: 'Listen and discuss.'
  }
});
assert.equal(otherTeacherScheme.statusCode, 404);

const mismatchedSchemeWeek = await invoke(controller.lessons.create, {
  body: {
    academicYear: '2026',
    term: 'Term 2',
    grade: 'Grade 7',
    subject: 'English',
    weekNumber: '4',
    schemeId: savedScheme.id,
    topic: 'Listening comprehension',
    lessonObjectives: 'Identify key ideas.',
    learningActivities: 'Listen and discuss.'
  }
});
assert.equal(mismatchedSchemeWeek.statusCode, 400);

console.log('Teacher planning controller tests passed');
