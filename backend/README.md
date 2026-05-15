# backend

Spring Boot 3 (Java 17) HRMS API for **AnganwadiHrms**. JWT auth, BCrypt
password hashing, role-based access, JPA/Postgres, Flyway migrations.

## Requirements

- JDK 17
- Maven 3.9+
- A running PostgreSQL 14+ database (or use the bundled H2 profile for tests)

## Configuration

All settings live in `src/main/resources/application.yml` and are overridable
via environment variables:

| variable                | default                                               | purpose                              |
|-------------------------|-------------------------------------------------------|--------------------------------------|
| `DATABASE_URL`          | `jdbc:postgresql://localhost:5432/anganwadi_hrms`     | JDBC URL                             |
| `DATABASE_USER`         | `postgres`                                            | DB user                              |
| `DATABASE_PASSWORD`     | `postgres`                                            | DB password                          |
| `JWT_SECRET`            | `dev-secret-change-me-please-32bytes-minimum-xx`      | HS256 signing key (>= 32 bytes)      |
| `JWT_TTL_MINUTES`       | `720`                                                 | Token TTL                            |
| `CORS_ALLOWED_ORIGINS`  | `http://localhost:5173`                               | Comma-separated list                 |
| `SEED_DEFAULT_USERS`    | `true`                                                | Create demo admin + employee on boot |
| `PORT`                  | `8080`                                                | HTTP port                            |

## Run locally

```bash
# 1. Start postgres and create the db once
createdb anganwadi_hrms

# 2. Boot the API (Flyway applies migrations, DataSeeder creates demo accounts)
./mvnw spring-boot:run
```

The API listens on `http://localhost:8080`.

Default seeded accounts (only on first boot, password `password123`):

| email                          | role     |
|--------------------------------|----------|
| `admin@anganwadi.local`        | ADMIN    |
| `employee@anganwadi.local`     | EMPLOYEE |

## Endpoints

### Public
- `POST /auth/login` — `{ email, password }` → `{ token, employeeId, email, name, role }`
- `GET  /health`

### Authenticated (any role)
- `GET   /me` — current user
- `PATCH /me` — update own `name` / `phone` (hourly_rate is admin-only)
- `POST  /attendance/checkin`  — body `{ lat, lng }`
- `POST  /attendance/checkout` — body `{ lat, lng }`
- `GET   /payslip?month=YYYY-MM` — own slip; (re)computes from attendance

### Admin only (role `ADMIN`)
- `GET    /admin/dashboard`
- `GET    /admin/employees?q=<search>`
- `POST   /admin/employees`            — body `{ name, email, phone, password, hourlyRate, role }`
- `PATCH  /admin/employees/{id}`        — partial update (incl. `hourlyRate`, `active`, `password`)
- `DELETE /admin/employees/{id}`        — soft-delete (sets `active = false`)
- `GET    /admin/attendance?employee_id=&from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET    /admin/payslips?month=YYYY-MM[&employee_id=]`
- `POST   /admin/payslips/{id}/mark-paid`

JWT in `Authorization: Bearer <token>`.

## Salary rule

Per ISO calendar week within the requested month, the first 40 hours are
"regular" (paid at `hourly_rate`) and any hours above 40 are "overtime"
(paid at `1.5 × hourly_rate`). See
[`SalaryCalculator`](src/main/java/com/anganwadi/hrms/payslip/SalaryCalculator.java)
and tests in `src/test/java/com/anganwadi/hrms/payslip/SalaryCalculatorTest.java`.

## Tests

```bash
./mvnw test
```

- `SalaryCalculatorTest` — JUnit 5 tests for the salary rule (regular/OT split,
  multi-week, ignores entries outside the target month, ignores open check-ins).
- `AuthFlowTest` — end-to-end login → JWT → `/me` and admin route guard
  via `MockMvc` against an in-memory H2 database.

## Project layout

```
src/main/java/com/anganwadi/hrms/
  HrmsApplication.java
  auth/        login, JWT, security principal, filter
  config/      Spring Security, CORS, dashboard, health, seeder
  employee/    entity, repo, /me + /admin/employees
  attendance/  entity, repo, /attendance + /admin/attendance
  payslip/     entity, repo, salary calc, /payslip + /admin/payslips
  common/      shared exceptions + global handler
src/main/resources/
  application.yml
  db/migration/{V1__init.sql, V2__seed_admin.sql}
```
