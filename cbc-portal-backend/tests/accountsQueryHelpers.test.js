import test from 'node:test';
import assert from 'node:assert/strict';

import { buildActiveEnrollmentFilter, buildUserDirectoryEnrollmentFilter, getFinanceEnrollmentStatusFilter, resolveActiveEnrollmentYear } from '../utils/accountsQueryHelpers.js';

test('finance year filters include active, completed, and transferred enrollment history', () => {
  const currentYear = new Date().getFullYear();
  const selectedYears = [currentYear - 1, currentYear, currentYear + 1];
  const expectedStatuses = ['active', 'completed', 'transferred'];

  selectedYears.forEach((academicYear) => {
    const filter = getFinanceEnrollmentStatusFilter(academicYear);
    assert.deepEqual(Object.values(filter)[0], expectedStatuses);
  });
});

test('active enrollment filters are scoped to the requested year and optional grade/stream', () => {
  assert.deepEqual(buildActiveEnrollmentFilter({
    schoolId: 'school-1',
    academicYear: 2027,
    grade: 'Grade 8',
    stream: 'A'
  }), {
    schoolId: 'school-1',
    academicYear: 2027,
    status: 'active',
    grade: 'Grade 8',
    stream: 'A'
  });
});

test('active enrollment filters default the year to the current academic year', () => {
  assert.equal(buildActiveEnrollmentFilter({ schoolId: 'school-1' }).academicYear, new Date().getFullYear());
});

test('admin user-directory filters stay within active current-year enrollment', () => {
  assert.deepEqual(buildUserDirectoryEnrollmentFilter({
    role: 'admin',
    schoolId: 'school-1',
    grade: 'Grade 8'
  }), {
    schoolId: 'school-1',
    academicYear: new Date().getFullYear(),
    status: 'active',
    grade: 'Grade 8'
  });
});

test('accounts user-directory filters include historical enrollment unless a year is explicitly selected', () => {
  assert.deepEqual(buildUserDirectoryEnrollmentFilter({
    role: 'accounts',
    schoolId: 'school-1',
    grade: 'Grade 8',
    stream: 'A'
  }), {
    schoolId: 'school-1',
    grade: 'Grade 8',
    stream: 'A'
  });
  assert.deepEqual(buildUserDirectoryEnrollmentFilter({
    role: 'accounts',
    schoolId: 'school-1',
    academicYear: 2025
  }), {
    schoolId: 'school-1',
    academicYear: 2025
  });
});

test('admin defaults to the latest active enrollment year after promotion', () => {
  assert.equal(resolveActiveEnrollmentYear({ requestedYear: undefined, latestActiveYear: 2027, fallbackYear: 2026 }), 2027);
  assert.equal(resolveActiveEnrollmentYear({ requestedYear: 2025, latestActiveYear: 2027, fallbackYear: 2026 }), 2025);
  assert.equal(resolveActiveEnrollmentYear({ requestedYear: undefined, latestActiveYear: undefined, fallbackYear: 2026 }), 2026);
});
