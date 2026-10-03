import cacheManager from '../utils/cacheManager.js';
import {
  createFinanceExpense,
  deleteFinanceExpense,
  getFinanceExpense,
  listFinanceExpenses
} from '../services/financeRepository.js';

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

    const newExpense = await createFinanceExpense({
      schoolId: req.user.schoolId,
      category,
      description,
      amount: Number(amount),
      date: new Date(date),
      academicYear: Number(academicYear),
      term,
      recordedBy: req.user.id,
      recordedByRole: req.user.role,
    });
    
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

    const { totalCount, expenses } = await listFinanceExpenses({
      schoolId: req.user.schoolId,
      academicYear,
      term: term?.trim() ? term : undefined,
      category: category?.trim() ? category : undefined,
      page: pageNum,
      limit: pageSize
    });
    const totalPages = Math.ceil(totalCount / pageSize);

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

    const expense = await getFinanceExpense(id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    if (String(expense.schoolId) !== String(req.user.schoolId)) {
      return res.status(403).json({ message: 'Unauthorized to delete this expense' });
    }

    await deleteFinanceExpense(id, req.user.schoolId);

    // Invalidate cache for this school's expenses
    cacheManager.clearPattern(`expenses:${req.user.schoolId}`);

    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    console.error('Delete Expense Error:', err);
    res.status(500).json({ message: err.message });
  }
};