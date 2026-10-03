import assert from 'node:assert/strict';
import { summarizeCarryForwardAmounts } from '../utils/carryForwardSummary.js';

const summary = summarizeCarryForwardAmounts([
  { net_amount: '4000' },
  { net_amount: '-1500' },
  { net_amount: '0' },
], 2027);

assert.deepEqual(summary, {
  academicYear: 2027,
  surplusTotal: 4000,
  arrearsTotal: 1500,
  netTotal: 2500,
  surplusLearners: 1,
  arrearsLearners: 1,
  learnersWithCarryForward: 3,
});

assert.deepEqual(summarizeCarryForwardAmounts([], 2027), {
  academicYear: 2027,
  surplusTotal: 0,
  arrearsTotal: 0,
  netTotal: 0,
  surplusLearners: 0,
  arrearsLearners: 0,
  learnersWithCarryForward: 0,
});

console.log('Carry-forward summary tests passed');
