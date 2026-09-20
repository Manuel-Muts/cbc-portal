import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDashboardSummaryPayload,
  getDashboardSummaryRetentionCutoffDate
} from '../services/dashboardSummaryService.js';

test('buildDashboardSummaryPayload returns the expected compact dashboard summary', () => {
  const summary = buildDashboardSummaryPayload({
    totalStudents: 120,
    activeStudents: 115,
    feesCollected: 420000,
    termFeesCollected: 150000,
    feesPending: 180000,
    monthlyExpenses: 76000,
    termExpenses: 25000,
    activeTerm: 'Term 3',
    smsCredits: 350,
    unreadAnnouncements: 8,
    schoolId: 'school-1'
  });

  assert.equal(summary.schoolId, 'school-1');
  assert.equal(summary.totalStudents, 120);
  assert.equal(summary.activeStudents, 115);
  assert.equal(summary.feesCollected, 420000);
  assert.equal(summary.termFeesCollected, 150000);
  assert.equal(summary.feesPending, 180000);
  assert.equal(summary.monthlyExpenses, 76000);
  assert.equal(summary.termExpenses, 25000);
  assert.equal(summary.activeTerm, 'Term 3');
  assert.equal(summary.smsCredits, 350);
  assert.equal(summary.unreadAnnouncements, 8);
  assert.ok(summary.updatedAt);
});

test('getDashboardSummaryRetentionCutoffDate returns a cutoff older than the last 7 days', () => {
  const cutoff = getDashboardSummaryRetentionCutoffDate(7);
  const now = new Date();

  assert.ok(cutoff instanceof Date);
  assert.ok(cutoff <= now);

  const diffMs = now.getTime() - cutoff.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  assert.ok(diffDays >= 7 && diffDays < 8);
});
