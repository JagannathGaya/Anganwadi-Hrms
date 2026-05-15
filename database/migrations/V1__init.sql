-- AnganwadiHrms initial schema
-- PostgreSQL 14+

CREATE TABLE IF NOT EXISTS employees (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(180) NOT NULL UNIQUE,
    phone           VARCHAR(32),
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(16)  NOT NULL CHECK (role IN ('EMPLOYEE','ADMIN')),
    hourly_rate     NUMERIC(10,2) NOT NULL DEFAULT 0,
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance (
    id              BIGSERIAL PRIMARY KEY,
    employee_id     BIGINT       NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    check_in_at     TIMESTAMPTZ  NOT NULL,
    check_in_lat    DOUBLE PRECISION,
    check_in_lng    DOUBLE PRECISION,
    check_out_at    TIMESTAMPTZ,
    check_out_lat   DOUBLE PRECISION,
    check_out_lng   DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_attendance_employee_check_in
    ON attendance(employee_id, check_in_at);

CREATE TABLE IF NOT EXISTS payslips (
    id              BIGSERIAL PRIMARY KEY,
    employee_id     BIGINT        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    month           CHAR(7)       NOT NULL, -- 'YYYY-MM'
    total_hours     NUMERIC(8,2)  NOT NULL DEFAULT 0,
    regular_pay     NUMERIC(12,2) NOT NULL DEFAULT 0,
    overtime_pay    NUMERIC(12,2) NOT NULL DEFAULT 0,
    gross_pay       NUMERIC(12,2) NOT NULL DEFAULT 0,
    paid            BOOLEAN       NOT NULL DEFAULT FALSE,
    generated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (employee_id, month)
);

CREATE INDEX IF NOT EXISTS idx_payslips_employee_month
    ON payslips(employee_id, month);
