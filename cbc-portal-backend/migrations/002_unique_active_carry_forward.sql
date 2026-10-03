CREATE UNIQUE INDEX IF NOT EXISTS payments_one_active_carry_forward_idx
  ON payments (school_id, student_id, academic_year)
  WHERE method = 'fund_transfer' AND is_reversed = FALSE;