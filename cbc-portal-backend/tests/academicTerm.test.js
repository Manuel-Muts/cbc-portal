import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAcademicContext, buildTeacherMarksQuery } from '../utils/academicTerm.js';

test('resolveAcademicContext uses the supplied year and term', () => {
  const context = resolveAcademicContext({ year: '2025', term: '3' });

  assert.deepEqual(context, { year: 2025, term: 3 });
});

test('buildTeacherMarksQuery filters by the supplied year and term', () => {
  const query = buildTeacherMarksQuery({ teacherId: 'teacher-1', schoolId: 'school-1' }, { year: 2025, term: 3 });

  assert.deepEqual(query, {
    teacherId: 'teacher-1',
    schoolId: 'school-1',
    year: 2025,
    term: 3
  });
});
