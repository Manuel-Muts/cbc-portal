import mongoose from "mongoose";

const feeStructureSchema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
  grade: { type: String, required: true },
  academicYear: { type: Number, required: true },
  term1Fee: { type: Number, required: true, default: 0 },
  term2Fee: { type: Number, required: true, default: 0 },
  term3Fee: { type: Number, required: true, default: 0 },
  totalFee: { type: Number, required: true } // calculated field
}, { timestamps: true });

// Pre-save middleware to calculate totalFee
feeStructureSchema.pre('save', function(next) {
  this.totalFee = (this.term1Fee || 0) + (this.term2Fee || 0) + (this.term3Fee || 0);
  next();
});

feeStructureSchema.index({ schoolId: 1, grade: 1, academicYear: 1 }, { unique: true });

export default mongoose.model("FeeStructure", feeStructureSchema);
