import { randomUUID } from 'node:crypto';
import { getPostgresPool, queryPostgres } from './postgres.js';
import { summarizeCarryForwardAmounts } from '../utils/carryForwardSummary.js';

const PAYMENT_COLUMNS = `
  id AS "_id",
  student_id AS "studentId",
  school_id AS "schoolId",
  amount,
  method,
  reference,
  recorded_by AS "recordedBy",
  recorded_by_role AS "recordedByRole",
  academic_year AS "academicYear",
  term,
  is_reversed AS "isReversed",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const FEE_COLUMNS = `
  id AS "_id",
  school_id AS "schoolId",
  grade,
  academic_year AS "academicYear",
  term1_fee AS "term1Fee",
  term2_fee AS "term2Fee",
  term3_fee AS "term3Fee",
  total_fee AS "totalFee",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const BALANCE_COLUMNS = `
  id AS "_id",
  student_id AS "studentId",
  school_id AS "schoolId",
  academic_year AS "academicYear",
  grade,
  total_fee AS "totalFee",
  total_paid AS "totalPaid",
  balance,
  term1_fee AS "term1Fee",
  term1_paid AS "term1Paid",
  term1_balance AS "term1Balance",
  term2_fee AS "term2Fee",
  term2_paid AS "term2Paid",
  term2_balance AS "term2Balance",
  term3_fee AS "term3Fee",
  term3_paid AS "term3Paid",
  term3_balance AS "term3Balance",
  brought_forward_amount AS "broughtForwardAmount",
  last_recomputed_at AS "lastRecomputedAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const EXPENSE_COLUMNS = `
  id AS "_id",
  school_id AS "schoolId",
  category,
  description,
  amount,
  date,
  academic_year AS "academicYear",
  term,
  recorded_by AS "recordedBy",
  recorded_by_role AS "recordedByRole",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const normalizeExpense = (expense) => expense && ({
  ...expense,
  amount: Number(expense.amount),
  academicYear: Number(expense.academicYear)
});

const normalizePayment = (payment) => payment && ({
  ...payment,
  amount: Number(payment.amount),
  academicYear: Number(payment.academicYear)
});

const normalizeFeeStructure = (fee) => fee && ({
  ...fee,
  academicYear: Number(fee.academicYear),
  term1Fee: Number(fee.term1Fee),
  term2Fee: Number(fee.term2Fee),
  term3Fee: Number(fee.term3Fee),
  totalFee: Number(fee.totalFee)
});

const normalizeBalanceSummary = (summary) => summary && Object.fromEntries(
  Object.entries(summary).map(([key, value]) => [
    key,
    ['academicYear'].includes(key) ? Number(value)
      : ['totalFee', 'totalPaid', 'balance', 'term1Fee', 'term1Paid', 'term1Balance', 'term2Fee', 'term2Paid', 'term2Balance', 'term3Fee', 'term3Paid', 'term3Balance', 'broughtForwardAmount'].includes(key)
        ? Number(value)
        : value
  ])
);

export const createFinancePayment = async (payment) => {
  const result = await queryPostgres(
    `INSERT INTO payments (
      id, student_id, school_id, amount, method, reference, recorded_by,
      recorded_by_role, academic_year, term
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING ${PAYMENT_COLUMNS}`,
    [
      randomUUID(), String(payment.studentId), String(payment.schoolId), Number(payment.amount),
      payment.method, payment.reference, String(payment.recordedBy), payment.recordedByRole,
      Number(payment.academicYear), payment.term
    ]
  );
  return normalizePayment(result.rows[0]);
};

export const hasActiveFinanceBroughtForward = async ({ studentId, schoolId, academicYear }) => {
  const result = await queryPostgres(
    `SELECT 1 FROM payments WHERE student_id = $1 AND school_id = $2
     AND academic_year = $3 AND method = 'fund_transfer' AND is_reversed = FALSE LIMIT 1`,
    [String(studentId), String(schoolId), Number(academicYear)]
  );
  return result.rowCount > 0;
};

export const hasFinancePaymentReference = async (reference) => {
  const result = await queryPostgres(
    `SELECT reference FROM payments WHERE reference = $1
     UNION ALL SELECT reference FROM unmatched_payments WHERE reference = $1 LIMIT 1`,
    [reference]
  );
  return result.rowCount > 0;
};

export const createFinanceUnmatchedPayment = async ({ schoolId, amount, reference, admission, phone }) => {
  await queryPostgres(
    `INSERT INTO unmatched_payments (id, school_id, amount, reference, admission, phone)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), String(schoolId), Number(amount), reference, admission || null, phone || null]
  );
};

export const listFinancePayments = async ({ studentId, schoolId, academicYear, term, limit, offset, includeReversed = false }) => {
  const values = [];
  const conditions = [];
  if (studentId !== undefined) {
    values.push(Array.isArray(studentId) ? studentId.map(String) : String(studentId));
    conditions.push(Array.isArray(studentId)
      ? `student_id = ANY($${values.length}::text[])`
      : `student_id = $${values.length}`);
  }
  if (schoolId !== undefined) {
    values.push(String(schoolId));
    conditions.push(`school_id = $${values.length}`);
  }
  if (academicYear !== undefined) {
    values.push(Number(academicYear));
    conditions.push(`academic_year = $${values.length}`);
  }
  if (term) {
    values.push(term);
    conditions.push(`term = $${values.length}`);
  }
  if (!includeReversed) conditions.push('is_reversed = FALSE');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  let pagination = '';
  if (Number.isInteger(limit)) {
    values.push(limit);
    pagination += ` LIMIT $${values.length}`;
  }
  if (Number.isInteger(offset)) {
    values.push(offset);
    pagination += ` OFFSET $${values.length}`;
  }
  const result = await queryPostgres(
    `SELECT ${PAYMENT_COLUMNS} FROM payments ${where} ORDER BY created_at DESC, id DESC${pagination}`,
    values
  );
  return result.rows.map(normalizePayment);
};

export const getFinancePayment = async (id) => {
  const result = await queryPostgres(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = $1`, [id]);
  return normalizePayment(result.rows[0]);
};

export const countFinancePayments = async ({ studentId, schoolId, academicYear, includeReversed = false }) => {
  const values = [];
  const conditions = [];
  if (studentId !== undefined) {
    values.push(String(studentId));
    conditions.push(`student_id = $${values.length}`);
  }
  if (schoolId !== undefined) {
    values.push(String(schoolId));
    conditions.push(`school_id = $${values.length}`);
  }
  if (academicYear !== undefined) {
    values.push(Number(academicYear));
    conditions.push(`academic_year = $${values.length}`);
  }
  if (!includeReversed) conditions.push('is_reversed = FALSE');
  const result = await queryPostgres(
    `SELECT COUNT(*)::INTEGER AS total FROM payments WHERE ${conditions.join(' AND ')}`,
    values
  );
  return result.rows[0].total;
};

export const getFinancePaymentsByTerm = async ({ studentId, schoolId, academicYear }) => {
  const result = await queryPostgres(
    `SELECT term, COALESCE(SUM(amount), 0)::FLOAT8 AS total
     FROM payments WHERE student_id = $1 AND school_id = $2
       AND academic_year = $3 AND is_reversed = FALSE GROUP BY term`,
    [String(studentId), String(schoolId), Number(academicYear)]
  );
  return Object.fromEntries(result.rows.map(row => [row.term, Number(row.total)]));
};

export const getFinancePaymentsForStudents = async ({ studentIds, schoolId, academicYear }) => {
  if (!studentIds.length) return [];
  const result = await queryPostgres(
    `SELECT ${PAYMENT_COLUMNS} FROM payments
     WHERE student_id = ANY($1::text[]) AND school_id = $2
       AND academic_year = $3 AND is_reversed = FALSE`,
    [studentIds.map(String), String(schoolId), Number(academicYear)]
  );
  return result.rows.map(normalizePayment);
};

export const getFinanceTotalsByStudent = async ({ studentIds, schoolId, academicYear }) => {
  if (!studentIds.length) return new Map();
  const result = await queryPostgres(
     `SELECT student_id, term, SUM(amount)::FLOAT8 AS total,
       SUM(amount) FILTER (WHERE method = 'fund_transfer')::FLOAT8 AS brought_forward,
       SUM(amount) FILTER (WHERE method <> 'fund_transfer')::FLOAT8 AS receipts
     FROM payments WHERE student_id = ANY($1::text[]) AND school_id = $2
       AND academic_year = $3 AND is_reversed = FALSE GROUP BY student_id, term`,
    [studentIds.map(String), String(schoolId), Number(academicYear)]
  );
  const summaries = new Map();
  result.rows.forEach(row => {
    const summary = summaries.get(row.student_id) || {
      'Term 1': 0, 'Term 2': 0, 'Term 3': 0, broughtForwardAmount: 0, receiptsByTerm: {}
    };
    summary[row.term] = Number(row.total);
    summary.receiptsByTerm[row.term] = Number(row.receipts || 0);
    summary.broughtForwardAmount += Number(row.brought_forward || 0);
    summaries.set(row.student_id, summary);
  });
  return summaries;
};

export const getFinancePaymentTotals = async ({ schoolId, academicYear, term, studentIds }) => {
  const values = [String(schoolId), Number(academicYear)];
  const conditions = ['school_id = $1', 'academic_year = $2', 'is_reversed = FALSE'];
  if (term) {
    values.push(term);
    conditions.push(`term = $${values.length}`);
  }
  if (studentIds) {
    values.push(studentIds.map(String));
    conditions.push(`student_id = ANY($${values.length}::text[])`);
  }
  const result = await queryPostgres(
    `SELECT COALESCE(SUM(amount), 0)::FLOAT8 AS total FROM payments WHERE ${conditions.join(' AND ')}`,
    values
  );
  return Number(result.rows[0].total);
};

export const getFinanceCarryForwardSummary = async ({ schoolId, academicYear, studentIds }) => {
  if (Array.isArray(studentIds) && studentIds.length === 0) {
    return {
      academicYear: Number(academicYear),
      surplusTotal: 0,
      arrearsTotal: 0,
      netTotal: 0,
      surplusLearners: 0,
      arrearsLearners: 0,
      learnersWithCarryForward: 0
    };
  }

  const values = [String(schoolId), Number(academicYear)];
  const studentFilter = Array.isArray(studentIds)
    ? (values.push(studentIds.map(String)), `AND student_id = ANY($${values.length}::text[])`)
    : '';
  const result = await queryPostgres(
    `WITH learner_carry_forwards AS (
      SELECT student_id, SUM(amount)::NUMERIC AS net_amount
      FROM payments
      WHERE school_id = $1
        AND academic_year = $2
        AND method = 'fund_transfer'
        AND is_reversed = FALSE
        ${studentFilter}
      GROUP BY student_id
    )
    SELECT net_amount FROM learner_carry_forwards`,
    values
  );
  return summarizeCarryForwardAmounts(result.rows, academicYear);
};

export const getFinancePaymentBreakdown = async ({ schoolId, academicYear, studentIds, term }) => {
  const values = [String(schoolId), Number(academicYear)];
  const conditions = ['school_id = $1', 'academic_year = $2', 'is_reversed = FALSE'];
  if (studentIds) {
    values.push(studentIds.map(String));
    conditions.push(`student_id = ANY($${values.length}::text[])`);
  }
  if (term) {
    values.push(term);
    conditions.push(`term = $${values.length}`);
  }
  const result = await queryPostgres(
    `SELECT term, method, SUM(amount)::FLOAT8 AS total, COUNT(*)::INTEGER AS count
     FROM payments WHERE ${conditions.join(' AND ')} GROUP BY term, method ORDER BY term, total DESC`,
    values
  );
  return result.rows.map(row => ({ _id: { term: row.term, method: row.method }, total: Number(row.total), count: row.count }));
};

export const listAllFinancePayments = async ({ search, studentIds, limit, offset }) => {
  const values = [];
  const conditions = [];
  if (search) {
    values.push(`%${search}%`);
    const referenceCondition = `reference ILIKE $${values.length}`;
    if (studentIds?.length) {
      values.push(studentIds.map(String));
      conditions.push(`(${referenceCondition} OR student_id = ANY($${values.length}::text[]))`);
    } else {
      conditions.push(referenceCondition);
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countResult = await queryPostgres(`SELECT COUNT(*)::INTEGER AS total FROM payments ${where}`, values);
  const listValues = [...values, limit, offset];
  const result = await queryPostgres(
    `SELECT ${PAYMENT_COLUMNS} FROM payments ${where}
     ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    listValues
  );
  return { payments: result.rows.map(normalizePayment), total: countResult.rows[0].total };
};

export const deleteFinancePaymentsForStudents = async ({ studentIds, schoolId }) => {
  if (!studentIds.length) return 0;
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM payment_reversals WHERE payment_id IN (
        SELECT id FROM payments WHERE student_id = ANY($1::text[]) AND school_id = $2
      )`,
      [studentIds.map(String), String(schoolId)]
    );
    const paymentResult = await client.query(
      'DELETE FROM payments WHERE student_id = ANY($1::text[]) AND school_id = $2',
      [studentIds.map(String), String(schoolId)]
    );
    await client.query(
      'DELETE FROM balance_summaries WHERE student_id = ANY($1::text[]) AND school_id = $2',
      [studentIds.map(String), String(schoolId)]
    );
    await client.query('COMMIT');
    return paymentResult.rowCount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const reverseFinancePayment = async ({ paymentId, schoolId, reason, reversedBy }) => {
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const paymentResult = await client.query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = $1 AND school_id = $2 FOR UPDATE`,
      [paymentId, String(schoolId)]
    );
    const payment = normalizePayment(paymentResult.rows[0]);
    if (!payment) {
      await client.query('ROLLBACK');
      return { status: 'not_found' };
    }
    if (payment.isReversed) {
      await client.query('ROLLBACK');
      return { status: 'already_reversed' };
    }

    await client.query(
      `INSERT INTO payment_reversals (id, payment_id, reason, reversed_by, amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), paymentId, reason, String(reversedBy), payment.amount]
    );
    await client.query(
      'UPDATE payments SET is_reversed = TRUE, updated_at = NOW() WHERE id = $1',
      [paymentId]
    );
    await client.query('COMMIT');
    return { status: 'reversed', payment };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const upsertFinanceFeeStructure = async ({ schoolId, grade, academicYear, term1Fee, term2Fee, term3Fee }) => {
  const result = await queryPostgres(
    `INSERT INTO fee_structures (
      id, school_id, grade, academic_year, term1_fee, term2_fee, term3_fee, total_fee
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $5::NUMERIC + $6::NUMERIC + $7::NUMERIC)
    ON CONFLICT (school_id, grade, academic_year) DO UPDATE SET
      term1_fee = EXCLUDED.term1_fee,
      term2_fee = EXCLUDED.term2_fee,
      term3_fee = EXCLUDED.term3_fee,
      total_fee = EXCLUDED.total_fee,
      updated_at = NOW()
    RETURNING ${FEE_COLUMNS}`,
    [randomUUID(), String(schoolId), grade, Number(academicYear), Number(term1Fee), Number(term2Fee), Number(term3Fee)]
  );
  return normalizeFeeStructure(result.rows[0]);
};

export const listFinanceFeeStructures = async ({ schoolId, academicYear, grade, page, limit }) => {
  const values = [String(schoolId)];
  const conditions = ['school_id = $1'];
  if (academicYear !== undefined && academicYear !== null && academicYear !== '') {
    values.push(Number(academicYear));
    conditions.push(`academic_year = $${values.length}`);
  }
  if (grade) {
    values.push(grade);
    conditions.push(`grade = $${values.length}`);
  }
  const where = conditions.join(' AND ');
  const [countResult, feesResult] = await Promise.all([
    queryPostgres(`SELECT COUNT(*)::INTEGER AS total FROM fee_structures WHERE ${where}`, values),
    queryPostgres(
      `SELECT ${FEE_COLUMNS} FROM fee_structures WHERE ${where}
       ORDER BY academic_year DESC, grade ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit]
    )
  ]);
  return { total: countResult.rows[0].total, fees: feesResult.rows.map(normalizeFeeStructure) };
};

export const getFinanceFeeStructuresForSchool = async ({ schoolId, academicYear }) => {
  const result = await queryPostgres(
    `SELECT ${FEE_COLUMNS} FROM fee_structures
     WHERE school_id = $1 AND academic_year = $2 ORDER BY grade ASC`,
    [String(schoolId), Number(academicYear)]
  );
  return result.rows.map(normalizeFeeStructure);
};

export const getFinanceFeeStructure = async ({ id, schoolId, grade, academicYear }) => {
  const values = [];
  const conditions = [];
  if (id !== undefined) {
    values.push(id);
    conditions.push(`id = $${values.length}`);
  }
  if (schoolId !== undefined) {
    values.push(String(schoolId));
    conditions.push(`school_id = $${values.length}`);
  }
  if (grade !== undefined) {
    values.push(grade);
    conditions.push(`grade = $${values.length}`);
  }
  if (academicYear !== undefined) {
    values.push(Number(academicYear));
    conditions.push(`academic_year = $${values.length}`);
  }
  const order = academicYear === undefined ? ' ORDER BY academic_year DESC' : '';
  const result = await queryPostgres(
    `SELECT ${FEE_COLUMNS} FROM fee_structures WHERE ${conditions.join(' AND ')}${order} LIMIT 1`,
    values
  );
  return normalizeFeeStructure(result.rows[0]);
};

export const updateFinanceFeeStructure = async ({ id, schoolId, changes }) => {
  const current = await getFinanceFeeStructure({ id, schoolId });
  if (!current) return null;
  const updated = {
    grade: changes.grade || current.grade,
    academicYear: changes.academicYear ? Number(changes.academicYear) : current.academicYear,
    term1Fee: changes.term1Fee === undefined ? current.term1Fee : Number(changes.term1Fee),
    term2Fee: changes.term2Fee === undefined ? current.term2Fee : Number(changes.term2Fee),
    term3Fee: changes.term3Fee === undefined ? current.term3Fee : Number(changes.term3Fee)
  };
  const result = await queryPostgres(
    `UPDATE fee_structures SET grade = $3, academic_year = $4, term1_fee = $5,
      term2_fee = $6, term3_fee = $7,
      total_fee = $5::NUMERIC + $6::NUMERIC + $7::NUMERIC, updated_at = NOW()
     WHERE id = $1 AND school_id = $2 RETURNING ${FEE_COLUMNS}`,
    [id, String(schoolId), updated.grade, updated.academicYear, updated.term1Fee, updated.term2Fee, updated.term3Fee]
  );
  return normalizeFeeStructure(result.rows[0]);
};

export const deleteFinanceFeeStructure = async ({ id, schoolId }) => {
  const result = await queryPostgres(
    'DELETE FROM fee_structures WHERE id = $1 AND school_id = $2 RETURNING id',
    [id, String(schoolId)]
  );
  return result.rowCount > 0;
};

export const getFinanceFeeNote = async ({ schoolId, academicYear }) => {
  const result = await queryPostgres(
    'SELECT note FROM fee_notes WHERE school_id = $1 AND academic_year = $2',
    [String(schoolId), Number(academicYear)]
  );
  return result.rows[0]?.note ?? '';
};

export const upsertFinanceFeeNote = async ({ schoolId, academicYear, note }) => {
  await queryPostgres(
    `INSERT INTO fee_notes (id, school_id, academic_year, note)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (school_id, academic_year) DO UPDATE SET note = EXCLUDED.note, updated_at = NOW()`,
    [randomUUID(), String(schoolId), Number(academicYear), String(note ?? '')]
  );
};

export const getFinanceBalanceSummary = async ({ studentId, schoolId, academicYear }) => {
  const result = await queryPostgres(
    `SELECT ${BALANCE_COLUMNS} FROM balance_summaries
     WHERE student_id = $1 AND school_id = $2 AND academic_year = $3`,
    [String(studentId), String(schoolId), Number(academicYear)]
  );
  return normalizeBalanceSummary(result.rows[0]);
};

export const upsertFinanceBalanceSummary = async (summary) => {
  const values = [
    randomUUID(), String(summary.studentId), String(summary.schoolId), Number(summary.academicYear), summary.grade || null,
    Number(summary.totalFee), Number(summary.totalPaid), Number(summary.balance),
    Number(summary.term1Fee), Number(summary.term1Paid), Number(summary.term1Balance),
    Number(summary.term2Fee), Number(summary.term2Paid), Number(summary.term2Balance),
    Number(summary.term3Fee), Number(summary.term3Paid), Number(summary.term3Balance),
    Number(summary.broughtForwardAmount), summary.lastRecomputedAt || new Date()
  ];
  const result = await queryPostgres(
    `INSERT INTO balance_summaries (
      id, student_id, school_id, academic_year, grade, total_fee, total_paid, balance,
      term1_fee, term1_paid, term1_balance, term2_fee, term2_paid, term2_balance,
      term3_fee, term3_paid, term3_balance, brought_forward_amount, last_recomputed_at
    ) VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})
    ON CONFLICT (school_id, academic_year, student_id) DO UPDATE SET
      grade = EXCLUDED.grade, total_fee = EXCLUDED.total_fee, total_paid = EXCLUDED.total_paid,
      balance = EXCLUDED.balance, term1_fee = EXCLUDED.term1_fee, term1_paid = EXCLUDED.term1_paid,
      term1_balance = EXCLUDED.term1_balance, term2_fee = EXCLUDED.term2_fee,
      term2_paid = EXCLUDED.term2_paid, term2_balance = EXCLUDED.term2_balance,
      term3_fee = EXCLUDED.term3_fee, term3_paid = EXCLUDED.term3_paid,
      term3_balance = EXCLUDED.term3_balance, brought_forward_amount = EXCLUDED.brought_forward_amount,
      last_recomputed_at = EXCLUDED.last_recomputed_at, updated_at = NOW()
    RETURNING ${BALANCE_COLUMNS}`,
    values
  );
  return normalizeBalanceSummary(result.rows[0]);
};

const buildExpenseFilters = ({ schoolId, academicYear, term, category }) => {
  const values = [String(schoolId)];
  const conditions = ['school_id = $1'];
  if (academicYear !== undefined && academicYear !== null && academicYear !== '') {
    values.push(Number(academicYear));
    conditions.push(`academic_year = $${values.length}`);
  }
  if (term) {
    values.push(term);
    conditions.push(`term = $${values.length}`);
  }
  if (category) {
    values.push(category);
    conditions.push(`category = $${values.length}`);
  }
  return { values, where: conditions.join(' AND ') };
};

export const createFinanceExpense = async (expense) => {
  const result = await queryPostgres(
    `INSERT INTO expenses (
      id, school_id, category, description, amount, date, academic_year,
      term, recorded_by, recorded_by_role
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING ${EXPENSE_COLUMNS}`,
    [
      randomUUID(), String(expense.schoolId), expense.category, expense.description,
      Number(expense.amount), expense.date, Number(expense.academicYear),
      expense.term || null, String(expense.recordedBy), expense.recordedByRole
    ]
  );
  return normalizeExpense(result.rows[0]);
};

export const listFinanceExpenses = async ({ schoolId, academicYear, term, category, page = 1, limit = 50 }) => {
  const { values, where } = buildExpenseFilters({ schoolId, academicYear, term, category });
  const offset = (page - 1) * limit;
  const [countResult, expensesResult] = await Promise.all([
    queryPostgres(`SELECT COUNT(*)::INTEGER AS total FROM expenses WHERE ${where}`, values),
    queryPostgres(
      `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE ${where}
       ORDER BY date DESC, created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    )
  ]);

  return {
    totalCount: countResult.rows[0].total,
    expenses: expensesResult.rows.map(normalizeExpense)
  };
};

export const getFinanceExpense = async (id) => {
  const result = await queryPostgres(
    `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = $1`,
    [id]
  );
  return normalizeExpense(result.rows[0]);
};

export const deleteFinanceExpense = async (id, schoolId) => {
  const result = await queryPostgres(
    'DELETE FROM expenses WHERE id = $1 AND school_id = $2 RETURNING id',
    [id, String(schoolId)]
  );
  return result.rowCount > 0;
};

export const getFinanceExpenseTotal = async ({ schoolId, academicYear, term }) => {
  const { values, where } = buildExpenseFilters({ schoolId, academicYear, term });
  const result = await queryPostgres(
    `SELECT COALESCE(SUM(amount), 0)::FLOAT8 AS total FROM expenses WHERE ${where}`,
    values
  );
  return Number(result.rows[0].total);
};

export const getFinanceExpenseReport = async ({ schoolId, academicYear, term, category, page, limit }) => {
  const { values, where } = buildExpenseFilters({ schoolId, academicYear, term, category });
  const offset = (page - 1) * limit;
  const [totalsResult, countResult, expensesResult, categoriesResult] = await Promise.all([
    queryPostgres(
      `SELECT COALESCE(SUM(amount), 0)::FLOAT8 AS total FROM expenses WHERE ${where}`,
      values
    ),
    queryPostgres(`SELECT COUNT(*)::INTEGER AS total FROM expenses WHERE ${where}`, values),
    queryPostgres(
      `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE ${where}
       ORDER BY date DESC, created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    ),
    queryPostgres(
      `SELECT category AS "_id", SUM(amount)::FLOAT8 AS total, COUNT(*)::INTEGER AS count
       FROM expenses WHERE ${where} GROUP BY category ORDER BY total DESC`,
      values
    )
  ]);

  return {
    total: Number(totalsResult.rows[0].total),
    totalCount: countResult.rows[0].total,
    expenses: expensesResult.rows.map(normalizeExpense),
    categories: categoriesResult.rows.map(row => ({ ...row, total: Number(row.total) }))
  };
};