import mongoose from 'mongoose';

const ExpenseSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true,
  },
  category: {
    type: String,
    enum: ['Salaries', 'Utilities', 'Trip', 'Food', 'Maintenance', 'Stationery', 'Other'],
    required: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  date: {
    type: Date,
    required: true,
  },
  academicYear: {
    type: Number,
    required: true,
    index: true,
  },
  term: {
    type: String,
    enum: ['Term 1', 'Term 2', 'Term 3'],
    required: false,
  },
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  recordedByRole: {
    type: String,
    enum: ['admin', 'accounts'],
    required: true,
  },
}, { timestamps: true });

export const Expense = mongoose.model('Expense', ExpenseSchema);