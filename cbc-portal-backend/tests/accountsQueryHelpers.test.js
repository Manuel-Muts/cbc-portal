import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllowedGradesForSchoolType, buildGradeMatch, getOutstandingFeeStatus } from '../utils/accountsQueryHelpers.js';

test('returns the full-school grade set for a full school', () => {
  assert.deepEqual(getAllowedGradesForSchoolType('full'), [
    'PG', 'PP1', 'PP2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'
  ]);
});

test('returns the primary/junior grade set for a primary or junior school', () => {
  assert.deepEqual(getAllowedGradesForSchoolType('Primary + Junior'), [
    'PG', 'PP1', 'PP2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9'
  ]);
});

test('returns the senior grade set for a senior school', () => {
  assert.deepEqual(getAllowedGradesForSchoolType('senior school'), [
    'Grade 10', 'Grade 11', 'Grade 12'
  ]);
});

test('builds an exact grade match when a specific grade filter is supplied', () => {
  assert.equal(buildGradeMatch('full', 'Grade 8'), 'Grade 8');
});

test('builds an in-list match when no grade filter is supplied', () => {
  assert.deepEqual(buildGradeMatch('senior', null), { $in: ['Grade 10', 'Grade 11', 'Grade 12'] });
});

test('returns paid, partial, and unpaid statuses from outstanding fee summaries', () => {
  assert.equal(getOutstandingFeeStatus({ expected: 100, totalPaid: 100, balance: 0 }), 'Paid');
  assert.equal(getOutstandingFeeStatus({ expected: 100, totalPaid: 40, balance: 60 }), 'Partial');
  assert.equal(getOutstandingFeeStatus({ expected: 100, paid: 0, balance: 100 }), 'Unpaid');
});
