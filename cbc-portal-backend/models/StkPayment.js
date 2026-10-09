import mongoose from 'mongoose';

const stkPaymentSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  purpose: {
    type: String,
    enum: ['subscription', 'purchase', 'sms_topup', 'planning_pdf'],
    required: true
  },
  purposeReference: {
    type: String,
    trim: true,
    default: null
  },
  plan: {
    type: String,
    enum: ['standard', 'premium'],
    default: null
  },
  amount: {
    type: Number,
    required: true,
    min: 1
  },
  durationDays: {
    type: Number,
    min: 1,
    default: null
  },
  smsCredits: {
    type: Number,
    min: 0,
    default: null
  },
  currency: {
    type: String,
    default: 'KES',
    immutable: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'failed', 'review'],
    default: 'pending',
    index: true
  },
  attemptStartedAt: { type: Date, default: null },
  checkoutHistory: {
    type: [{
      merchantRequestId: { type: String, default: null },
      checkoutRequestId: { type: String, required: true },
      amount: { type: Number, required: true },
      phoneNumber: { type: String, required: true },
      startedAt: { type: Date, required: true },
      status: { type: String, enum: ['expired', 'processing', 'failed', 'paid', 'review'], default: 'expired' },
      resultCode: { type: Number, default: null },
      resultDescription: { type: String, default: null },
      receiptNumber: { type: String, default: null }
    }],
    default: []
  },
  merchantRequestId: { type: String, default: null },
  checkoutRequestId: { type: String, default: null },
  receiptNumber: { type: String, default: null },
  resultCode: { type: Number, default: null },
  resultDescription: { type: String, default: null },
  paidAt: { type: Date, default: null }
}, { timestamps: true });

stkPaymentSchema.index(
  { checkoutRequestId: 1 },
  { unique: true, partialFilterExpression: { checkoutRequestId: { $type: 'string' } } }
);
stkPaymentSchema.index(
  { receiptNumber: 1 },
  { unique: true, partialFilterExpression: { receiptNumber: { $type: 'string' } } }
);
stkPaymentSchema.index({ schoolId: 1, createdAt: -1 });
stkPaymentSchema.index({ 'checkoutHistory.checkoutRequestId': 1 });
stkPaymentSchema.index(
  { schoolId: 1, initiatedBy: 1, purposeReference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      purpose: 'planning_pdf',
      purposeReference: { $type: 'string' }
    }
  }
);

export default mongoose.model('StkPayment', stkPaymentSchema);