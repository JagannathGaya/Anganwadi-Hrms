-- Replace hourly_rate with monthly_salary on employees.
-- All compensation is now expressed as a monthly amount in the org currency
-- (INR by default).

ALTER TABLE employees DROP COLUMN IF EXISTS hourly_rate;
ALTER TABLE employees ADD COLUMN monthly_salary NUMERIC(12,2) NOT NULL DEFAULT 0;
