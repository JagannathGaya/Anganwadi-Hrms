-- Mirrors backend/src/main/resources/db/migration/V5__monthly_salary.sql
ALTER TABLE employees DROP COLUMN IF EXISTS hourly_rate;
ALTER TABLE employees ADD COLUMN monthly_salary NUMERIC(12,2) NOT NULL DEFAULT 0;
