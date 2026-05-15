-- Mirrors backend/src/main/resources/db/migration/V6__shifts.sql
CREATE TABLE IF NOT EXISTS shifts (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(60)  NOT NULL UNIQUE,
    start_time  TIME         NOT NULL,
    end_time    TIME         NOT NULL,
    daily_hours NUMERIC(5,2) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT shift_hours_positive CHECK (daily_hours > 0)
);

INSERT INTO shifts (name, start_time, end_time, daily_hours) VALUES
    ('Morning shift',   '09:00', '15:00', 6.00),
    ('Afternoon shift', '12:00', '18:00', 6.00),
    ('Full day',        '09:00', '17:00', 8.00)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_id BIGINT REFERENCES shifts(id);
CREATE INDEX IF NOT EXISTS idx_employees_shift_id ON employees(shift_id);

UPDATE employees SET shift_id = (SELECT id FROM shifts WHERE name = 'Morning shift')
WHERE shift_id IS NULL AND role = 'EMPLOYEE';
