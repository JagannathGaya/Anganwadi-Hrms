-- Admin-controlled payslip adjustments. Lets the admin override the
-- attendance-computed overtime, add a custom bonus, or subtract custom
-- deductions (tax, PF, loan recovery, advance, etc.) on top of the
-- attendance-based math.
--
-- The auto-computed `overtime_pay` column stays as the "what attendance
-- says" value. `manual_overtime_pay`, when not null, overrides it for the
-- gross calculation. `bonus_amount` adds to gross; `deductions` subtracts
-- to produce net pay.
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS manual_overtime_pay DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS bonus_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_note           VARCHAR(200),
  ADD COLUMN IF NOT EXISTS deductions           DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_note       VARCHAR(500);
