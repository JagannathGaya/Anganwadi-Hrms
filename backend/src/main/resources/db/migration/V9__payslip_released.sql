-- Payslips now require explicit admin activation before employees can view
-- them. The "released" flag defaults to false for newly generated rows so a
-- silent compute by the employee endpoint isn't accidentally visible. Any
-- existing rows are backfilled to released = true so prior payslips stay
-- accessible after the upgrade.
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS released BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE payslips SET released = TRUE WHERE released = FALSE;
