import express from 'express';
import { addExpense, getExpenses, deleteExpense } from '../controllers/expenseController.js';
import  verifyToken from '../middleware/verifyToken.js';

const router = express.Router();

router.post('/', verifyToken, addExpense);
router.get('/', verifyToken, getExpenses);
router.delete('/:id', verifyToken, deleteExpense);
export default router;
