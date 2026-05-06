import { Expense } from '../models/Expense.js';
import mongoose from 'mongoose';
import cacheManager from '../utils/cacheManager.js';

// Add a new expense
export const addExpense = async (req, res) => {
  try {
    const { category, description, amount, date, academicYear, term } = req.body;

    if (!category || !description || !amount || !date || !academicYear) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (amount <= 0) {
      return res.status(400).json({ message: 'Amount must be positive' });
    }

    const newExpense = new Expense({
      schoolId: req.user.schoolId,
      category,
      description,
      amount,
      date: new Date(date),
      academicYear,
      term,
      recordedBy: req.user.id,
      recordedByRole: req.user.role,
    });

    await newExpense.save();
    
    // Invalidate cache for this school's expenses
    cacheManager.clearPattern(`expenses:${req.user.schoolId}`);
    
    res.status(201).json({ message: 'Expense recorded successfully', expense: newExpense });
  } catch (err) {
    console.error('Add Expense Error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get expenses for a school, filtered by academic year with pagination and caching
export const getExpenses = async (req, res) => {
  try {
    const { academicYear, term, category, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit) || 50)); // Max 100 per page
    
    // Generate cache key
    const cacheKey = cacheManager.generateKey(`expenses:${req.user.schoolId}`, {
      academicYear: academicYear || 'all',
      term: term || 'all',
      category: category || 'all',
      page: pageNum,
      limit: pageSize,
    });

    // Check cache first
    const cachedData = cacheManager.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    // Build query
    const query = { schoolId: req.user.schoolId };

    if (academicYear) {
      query.academicYear = Number(academicYear);
    }

    // Only filter by term if a specific term is provided (not empty string)
    if (term && term.trim() !== '') {
      query.term = term;
    }

    // Only filter by category if a specific category is provided (not empty string)
    if (category && category.trim() !== '') {
      query.category = category;
    }

    // Get total count
    const totalCount = await Expense.countDocuments(query);
    const totalPages = Math.ceil(totalCount / pageSize);

    // Get paginated data
    const expenses = await Expense.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean(); // Use lean() for better performance on read-only operations

    const response = {
      data: expenses,
      pagination: {
        currentPage: pageNum,
        pageSize: pageSize,
        totalCount: totalCount,
        totalPages: totalPages,
        hasNextPage: pageNum < totalPages,
        hasPreviousPage: pageNum > 1,
      },
    };

    // Cache the result for 5 minutes (300 seconds)
    cacheManager.set(cacheKey, response, 300);

    res.json(response);
  } catch (err) {
    console.error('Get Expenses Error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Delete an expense
export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    if (String(expense.schoolId) !== String(req.user.schoolId)) {
      return res.status(403).json({ message: 'Unauthorized to delete this expense' });
    }

    await expense.deleteOne();

    // Invalidate cache for this school's expenses
    cacheManager.clearPattern(`expenses:${req.user.schoolId}`);

    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    console.error('Delete Expense Error:', err);
    res.status(500).json({ message: err.message });
  }
};