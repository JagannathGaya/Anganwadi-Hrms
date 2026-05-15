-- Org config (singleton): geofence center + radius, daily hours, currency.
CREATE TABLE IF NOT EXISTS org_config (
    id                   SMALLINT     PRIMARY KEY DEFAULT 1,
    geofence_lat         DOUBLE PRECISION,
    geofence_lng         DOUBLE PRECISION,
    geofence_radius_m    INTEGER      NOT NULL DEFAULT 200,
    daily_hours          NUMERIC(5,2) NOT NULL DEFAULT 6.00,
    annual_holiday_quota INTEGER      NOT NULL DEFAULT 24,
    currency             VARCHAR(8)   NOT NULL DEFAULT 'INR',
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT org_config_singleton CHECK (id = 1)
);

INSERT INTO org_config (id, geofence_radius_m, daily_hours, annual_holiday_quota, currency)
VALUES (1, 200, 6.00, 24, 'INR')
ON CONFLICT (id) DO NOTHING;

-- Holidays: dates set by admin (org-wide).
CREATE TABLE IF NOT EXISTS holidays (
    id          BIGSERIAL    PRIMARY KEY,
    date        DATE         NOT NULL UNIQUE,
    name        VARCHAR(180) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);

-- Leave requests: employee submits, admin approves/rejects.
CREATE TABLE IF NOT EXISTS leave_requests (
    id           BIGSERIAL    PRIMARY KEY,
    employee_id  BIGINT       NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    from_date    DATE         NOT NULL,
    to_date      DATE         NOT NULL,
    reason       VARCHAR(500),
    status       VARCHAR(16)  NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    applied_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    decided_at   TIMESTAMPTZ,
    decided_by   BIGINT       REFERENCES employees(id),
    CONSTRAINT leave_dates_ok CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS idx_leaves_employee_status ON leave_requests(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_leaves_status_dates   ON leave_requests(status, from_date, to_date);
