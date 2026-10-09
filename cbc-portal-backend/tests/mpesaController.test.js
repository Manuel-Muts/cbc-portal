import assert from 'node:assert/strict';
import { createMpesaController } from '../controllers/mpesaController.js';

const school = { _id: 'school-1', name: 'Test School' };
const learner = { _id: 'student-1', name: 'Test Learner' };
const accountsUser = { _id: 'accounts-1' };
const recordedReferences = new Set();
let createdPaymentCount = 0;

class FakeUserModel {
  static async findOne(query) {
    if (query.role === 'student') {
      return query.username === 'adm001sch001' && query.schoolId === school._id
        ? learner
        : null;
    }
    if (query.role === 'accounts') return accountsUser;
    return null;
  }
}

const controller = createMpesaController({
  UserModel: FakeUserModel,
  SchoolModel: {
    async findOne(query) {
      return query.paybill === '123456' && query.status === 'Active' ? school : null;
    }
  },
  async hasPaymentReference(reference) {
    return recordedReferences.has(reference);
  },
  async createPayment(payment) {
    createdPaymentCount += 1;
    recordedReferences.add(payment.reference);
  },
  logger: { log() {}, error() {} }
});

const invoke = async (handler, body) => {
  const response = {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
  await handler({ body }, response);
  return response.payload;
};

const validReference = await invoke(controller.mpesaValidation, {
  BusinessShortCode: '123456',
  BillRefNumber: 'ADM001SCH001',
  TransAmount: '10'
});
assert.deepEqual(validReference, { ResultCode: 0, ResultDesc: 'Accepted' });

const admissionOnlyReference = await invoke(controller.mpesaValidation, {
  BusinessShortCode: '123456',
  BillRefNumber: 'ADM001',
  TransAmount: '10'
});
assert.deepEqual(admissionOnlyReference, { ResultCode: 1, ResultDesc: 'Rejected' });

const unknownReference = await invoke(controller.mpesaValidation, {
  BusinessShortCode: '123456',
  BillRefNumber: 'UNKNOWNSCH001',
  TransAmount: '10'
});
assert.deepEqual(unknownReference, { ResultCode: 1, ResultDesc: 'Rejected' });

const paymentCallback = {
  TransID: 'QAB1234567',
  TransAmount: '10',
  MSISDN: '254712345678',
  BillRefNumber: 'ADM001SCH001',
  BusinessShortCode: '123456'
};
const firstCallback = await invoke(controller.mpesaCallback, paymentCallback);
const duplicateCallback = await invoke(controller.mpesaCallback, paymentCallback);

assert.deepEqual(firstCallback, { ResultCode: 0 });
assert.deepEqual(duplicateCallback, { ResultCode: 0 });
assert.equal(createdPaymentCount, 1);

console.log('M-Pesa C2B controller tests passed');
