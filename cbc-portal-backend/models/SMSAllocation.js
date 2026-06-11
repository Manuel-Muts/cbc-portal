import mongoose from 'mongoose';

const smsAllocationSchema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  allocatedBy: { type: String, default: 'system' },
  source: { type: String, enum: ['monthly_auto','manual_superadmin','payment_topup'], default: 'monthly_auto' },
  count: { type: Number, required: true },
  month: { type: String, required: true }, // e.g. 2026-06
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('SMSAllocation', smsAllocationSchema);
