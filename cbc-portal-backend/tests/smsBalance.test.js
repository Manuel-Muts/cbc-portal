import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMonthlySmsAllocation, shouldBypassSchoolProfileCache } from '../utils/smsBalance.js';

test('preserves existing credits and adds the new monthly allocation', () => {
  assert.equal(applyMonthlySmsAllocation(25, 8), 33);
});

test('keeps the balance at zero when there is nothing to allocate', () => {
  assert.equal(applyMonthlySmsAllocation(0, 0), 0);
});

test('bypasses school profile cache when refresh is requested', () => {
  assert.equal(shouldBypassSchoolProfileCache({ refresh: 'true' }), true);
  assert.equal(shouldBypassSchoolProfileCache({ forceRefresh: 'false' }), false);
  assert.equal(shouldBypassSchoolProfileCache({}), false);
});
