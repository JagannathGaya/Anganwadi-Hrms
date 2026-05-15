-- payslips.month was originally CHAR(7); change to VARCHAR(7) to match the
-- JPA mapping. Idempotent: only alters if the type isn't already
-- character varying.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'payslips'
          AND column_name = 'month'
          AND data_type = 'character'
    ) THEN
        ALTER TABLE payslips ALTER COLUMN month TYPE VARCHAR(7);
    END IF;
END$$;
