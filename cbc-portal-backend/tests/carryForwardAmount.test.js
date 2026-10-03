import assert from 'node:assert/strict';
import { calculateCarryForwardAmount } from '../utils/carryForwardAmount.js';

const fee = { term1Fee: 300, term2Fee: 300, term3Fee: 400, totalFee: 1000 };

assert.equal(calculateCarryForwardAmount({
  fee,
  payments: [{ amount: 600 }, { amount: 400 }],
}), 0);

assert.equal(calculateCarryForwardAmount({
  fee: { ...fee, totalFee: 1250 },
  payments: [{ amount: 1200.25 }],
}), -200.25);

assert.equal(calculateCarryForwardAmount({
  fee,
  payments: [{ amount: 500 }, { amount: -125.25 }],
}), 625.25);

assert.equal(calculateCarryForwardAmount({
  fee: null,
  payments: [{ amount: 5000 }],
}), null);

console.log('Carry-forward amount tests passed');