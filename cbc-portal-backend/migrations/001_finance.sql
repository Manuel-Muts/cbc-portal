CREATE TABLE IF NOT EXISTS fee_structures (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  grade TEXT NOT NULL,
  academic_year INTEGER NOT NULL,
  term1_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  term2_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  term3_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, grade, academic_year)
);

CREATE INDEX IF NOT EXISTS fee_structures_school_year_idx
  ON fee_structures (school_id, academic_year DESC, grade);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  school_id TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'mpesa', 'bank', 'cheque', 'reversal', 'fund_transfer')),
  reference TEXT NOT NULL UNIQUE,
  recorded_by TEXT NOT NULL,
  recorded_by_role TEXT NOT NULL CHECK (recorded_by_role IN ('accounts', 'system')),
  academic_year INTEGER NOT NULL,
  term TEXT NOT NULL CHECK (term IN ('Term 1', 'Term 2', 'Term 3')),
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((method = 'reversal' AND amount < 0) OR method = 'fund_transfer' OR (method <> 'reversal' AND amount >= 0))
);

CREATE INDEX IF NOT EXISTS payments_student_year_idx
  ON payments (student_id, academic_year, is_reversed, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS payments_school_year_term_idx
  ON payments (school_id, academic_year, is_reversed, term);
CREATE INDEX IF NOT EXISTS payments_student_method_idx
  ON payments (student_id, academic_year, method, is_reversed);
CREATE INDEX IF NOT EXISTS payments_created_at_idx
  ON payments (created_at DESC);

CREATE TABLE IF NOT EXISTS unmatched_payments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  reference TEXT NOT NULL UNIQUE,
  admission TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'unmatched',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS unmatched_payments_school_date_idx
  ON unmatched_payments (school_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_reversals (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  reason TEXT NOT NULL,
  reversed_by TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  reversed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_reversals_payment_idx ON payment_reversals (payment_id);
CREATE INDEX IF NOT EXISTS payment_reversals_actor_idx ON payment_reversals (reversed_by);
CREATE INDEX IF NOT EXISTS payment_reversals_date_idx ON payment_reversals (reversed_at DESC);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Salaries', 'Utilities', 'Trip', 'Food', 'Maintenance', 'Stationery', 'Other')),
  description TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  date TIMESTAMPTZ NOT NULL,
  academic_year INTEGER NOT NULL,
  term TEXT CHECK (term IN ('Term 1', 'Term 2', 'Term 3')),
  recorded_by TEXT NOT NULL,
  recorded_by_role TEXT NOT NULL CHECK (recorded_by_role IN ('admin', 'accounts')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expenses_school_year_term_date_idx
  ON expenses (school_id, academic_year, term, date DESC);
CREATE INDEX IF NOT EXISTS expenses_school_category_date_idx
  ON expenses (school_id, category, date DESC);
CREATE INDEX IF NOT EXISTS expenses_actor_date_idx
  ON expenses (recorded_by, date DESC);

CREATE TABLE IF NOT EXISTS balance_summaries (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  school_id TEXT NOT NULL,
  academic_year INTEGER NOT NULL,
  grade TEXT,
  total_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  term1_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  term1_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  term1_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  term2_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  term2_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  term2_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  term3_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  term3_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  term3_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  brought_forward_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  last_recomputed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, academic_year, student_id)
);

CREATE TABLE IF NOT EXISTS fee_notes (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  academic_year INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, academic_year)
);