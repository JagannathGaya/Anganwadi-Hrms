-- Track payslips that an admin has overridden manually (e.g. completed with
-- full salary for a new hire who wasn't using the app in earlier months).
-- Without this flag, the next time the employee fetches their payslip, the
-- attendance-based recomputation in PayslipService.generateOrRefresh would
-- silently overwrite the admin's override back to whatever attendance math
-- produces (zero, for a month with no check-ins).
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS manual_override BOOLEAN NOT NULL DEFAULT FALSE;
