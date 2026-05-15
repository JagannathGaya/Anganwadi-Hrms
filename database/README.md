# database

PostgreSQL schema and migrations for **AnganwadiHrms**.

## Requirements

- PostgreSQL 14 or newer
- `psql` on `$PATH`

## Tables

| table        | purpose                                                |
|--------------|--------------------------------------------------------|
| `employees`  | users (role = `EMPLOYEE` or `ADMIN`), hourly rate      |
| `attendance` | check-in / check-out events with GPS lat/lng           |
| `payslips`   | one row per (employee, month) with computed totals     |

Indexes: `attendance(employee_id, check_in_at)`, `payslips(employee_id, month)`.

## Create the database and apply migrations

```bash
# 1. Create role + db (adjust to your env)
createdb anganwadi_hrms

# 2. Apply migrations in order
psql -d anganwadi_hrms -f migrations/V1__init.sql
psql -d anganwadi_hrms -f migrations/V2__seed_admin.sql
```

Or apply everything in one shot:

```bash
psql -d anganwadi_hrms -f schema.sql
```

The backend is also configured to apply migrations automatically on boot via Flyway
(it reads `src/main/resources/db/migration/`). If you let the backend bootstrap
the schema you do not need to run the SQL files manually.

## Seed accounts

`V2__seed_admin.sql` inserts two demo accounts; both have password `password123`
(bcrypt-hashed). **Change these immediately in any non-local environment.**

| email                          | role     | hourly_rate |
|--------------------------------|----------|-------------|
| `admin@anganwadi.local`        | ADMIN    | 0.00        |
| `employee@anganwadi.local`     | EMPLOYEE | 25.00       |

## Salary rule

`gross_pay = regular_pay + overtime_pay`, where for each ISO week within the
month, hours up to 40 are paid at `hourly_rate` and hours above 40 at
`1.5 × hourly_rate`. The `payslips` row stores the monthly totals.
