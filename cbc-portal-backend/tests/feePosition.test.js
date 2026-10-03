import assert from 'node:assert/strict';
import { calculateAggregateFeePosition, calculateFeePosition, calculateTermOverpayment } from '../utils/feePosition.js';

const feesByGrade = new Map([
  ['Grade 1', { term1Fee: 500, term2Fee: 500, term3Fee: 500, totalFee: 1500 }],
]);

const noSurplusOrDeficit = calculateFeePosition({
  enrollments: [
    { studentId: 'learner-1', grade: 'Grade 1' },
    { studentId: 'learner-2', grade: 'Grade 1' },
  ],
  feesByGrade,
  paymentsByStudent: new Map([
    ['learner-1', { 'Term 1': 500, 'Term 2': 500, 'Term 3': 500 }],
    ['learner-2', { 'Term 1': 300, 'Term 2': 200, 'Term 3': 0 }],
  ]),
});

assert.deepEqual(noSurplusOrDeficit, {
  totalExpectedFees: 3000,
  totalPaid: 2000,
  totalDeficit: 1000,
  totalSurplus: 0,
  totalArrears: 0,
});

const mixedPosition = calculateFeePosition({
  enrollments: [
    { studentId: 'learner-1', grade: 'Grade 1' },
    { studentId: 'learner-2', grade: 'Grade 1' },
  ],
  feesByGrade,
  paymentsByStudent: new Map([
    ['learner-1', { 'Term 1': 700, 'Term 2': 500, 'Term 3': 500 }],
    ['learner-2', { 'Term 1': 200, 'Term 2': 0, 'Term 3': 0 }],
  ]),
});

assert.deepEqual(mixedPosition, {
  totalExpectedFees: 3000,
  totalPaid: 1900,
  totalDeficit: 1100,
  totalSurplus: 0,
  totalArrears: 0,
});
assert.equal(mixedPosition.totalExpectedFees - mixedPosition.totalPaid, mixedPosition.totalDeficit);

const termPosition = calculateFeePosition({
  enrollments: [{ studentId: 'learner-1', grade: 'Grade 1' }],
  feesByGrade,
  paymentsByStudent: new Map([
    ['learner-1', { 'Term 1': 500, 'Term 2': 500, 'Term 3': 500, broughtForwardAmount: -250 }],
  ]),
  term: 'Term 1',
});

assert.deepEqual(termPosition, {
  totalExpectedFees: 500,
  totalPaid: 500,
  totalDeficit: 0,
  totalSurplus: 0,
  totalArrears: 250,
});

const termPositionWithAggregateSurplus = calculateFeePosition({
  enrollments: [
    { studentId: 'learner-overpaid', grade: 'Grade 1' },
    { studentId: 'learner-underpaid', grade: 'Grade 1' },
  ],
  feesByGrade,
  paymentsByStudent: new Map([
    ['learner-overpaid', { 'Term 1': 700 }],
    ['learner-underpaid', { 'Term 1': 400 }],
  ]),
  term: 'Term 1',
});

assert.deepEqual(termPositionWithAggregateSurplus, {
  totalExpectedFees: 1000,
  totalPaid: 1000,
  totalDeficit: 0,
  totalSurplus: 100,
  totalArrears: 0,
});

const annualPosition = calculateFeePosition({
  enrollments: [
    { studentId: 'learner-overpaid', grade: 'Grade 1' },
    { studentId: 'learner-underpaid', grade: 'Grade 1' },
  ],
  feesByGrade,
  paymentsByStudent: new Map([
    ['learner-overpaid', { 'Term 1': 1600, 'Term 2': 0, 'Term 3': 0 }],
    ['learner-underpaid', { 'Term 1': 0, 'Term 2': 0, 'Term 3': 0 }],
  ]),
});

assert.deepEqual(annualPosition, {
  totalExpectedFees: 3000,
  totalPaid: 1600,
  totalDeficit: 1400,
  totalSurplus: 0,
  totalArrears: 0,
});

const annualPositionWithSurplus = calculateFeePosition({
  enrollments: [{ studentId: 'learner-advance', grade: 'Grade 1' }],
  feesByGrade,
  paymentsByStudent: new Map([
    ['learner-advance', { 'Term 1': 1700, 'Term 2': 0, 'Term 3': 0 }],
  ]),
});
assert.equal(annualPositionWithSurplus.totalSurplus, 200);

const selectedTermOnly = calculateFeePosition({
  enrollments: [{ studentId: 'learner-advance', grade: 'Grade 1' }],
  feesByGrade,
  paymentsByStudent: new Map([
    ['learner-advance', { 'Term 1': 1500, 'Term 2': 0, 'Term 3': 0 }],
  ]),
  term: 'Term 1',
});
assert.equal(selectedTermOnly.totalSurplus, 1000);
assert.equal(selectedTermOnly.totalDeficit, 0);

const laterTermHasNoReceipts = calculateFeePosition({
  enrollments: [{ studentId: 'learner-advance', grade: 'Grade 1' }],
  feesByGrade,
  paymentsByStudent: new Map([
    ['learner-advance', { 'Term 1': 1500, 'Term 2': 0, 'Term 3': 0 }],
  ]),
  term: 'Term 2',
});
assert.equal(laterTermHasNoReceipts.totalSurplus, 0);
assert.equal(laterTermHasNoReceipts.totalDeficit, 500);

assert.deepEqual(calculateAggregateFeePosition({ totalExpectedFees: 2500, totalReceived: 3000 }), {
  totalExpectedFees: 2500,
  totalPaid: 2500,
  totalDeficit: 0,
  totalSurplus: 500,
});

assert.equal(calculateTermOverpayment({
  term: 'Term 1',
  enrollments: [
    { studentId: 'learner-overpaid', grade: 'Grade 1' },
    { studentId: 'learner-underpaid', grade: 'Grade 1' },
  ],
  feesByGrade,
  paymentsByStudent: new Map([
    ['learner-overpaid', { receiptsByTerm: { 'Term 1': 700 }, 'Term 1': 900 }],
    ['learner-underpaid', { receiptsByTerm: { 'Term 1': 400 }, 'Term 1': 400 }],
  ]),
}), 200);
assert.equal(calculateTermOverpayment({
  term: '',
  enrollments: [{ studentId: 'learner-overpaid', grade: 'Grade 1' }],
  feesByGrade,
  paymentsByStudent: new Map([
    ['learner-overpaid', { receiptsByTerm: { 'Term 1': 900 } }],
  ]),
}), 0);