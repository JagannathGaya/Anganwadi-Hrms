# AnganwadiHrms

A four-piece HRMS:

| folder        | what it is                            | stack                                       |
|---------------|---------------------------------------|---------------------------------------------|
| [`backend/`](backend/README.md)   | REST API + JWT auth + salary engine | Java 17, Spring Boot 3, JPA, Flyway     |
| [`database/`](database/README.md) | Schema and migrations                | PostgreSQL 14+                              |
| [`admin/`](admin/README.md)       | Web admin panel                      | React 18 + Vite + TypeScript + Vitest       |
| [`mobile/`](mobile/README.md)     | Employee mobile app                  | React Native CLI 0.75 + TypeScript          |

## Roles

Every user is either `EMPLOYEE` or `ADMIN`. The role is carried in the JWT
issued by `POST /auth/login` and enforced server-side via Spring Security
(`/admin/**` requires `ROLE_ADMIN`). The admin web panel additionally guards
its routes client-side and refuses to persist a non-admin login.

## Salary rule

`gross_pay = regular_pay + overtime_pay`. For each ISO week within the requested
month, the first 40 hours pay at `hourly_rate` and any hours above 40 pay at
`1.5 × hourly_rate`. Implementation:
[`SalaryCalculator.java`](backend/src/main/java/com/anganwadi/hrms/payslip/SalaryCalculator.java);
tests:
[`SalaryCalculatorTest.java`](backend/src/test/java/com/anganwadi/hrms/payslip/SalaryCalculatorTest.java).

## End-to-end run order

```bash
# 1. Database
createdb anganwadi_hrms

# 2. Backend (auto-runs Flyway migrations + seeds default users on first boot)
cd backend && ./mvnw spring-boot:run         # http://localhost:8080

# 3. Admin web (separate terminal)
cd admin && npm install && npm run dev       # http://localhost:5173

# 4. Mobile (separate terminal — see mobile/README.md for native shell setup)
cd mobile && npm install && npm start
```

## Default credentials

Created by the backend's `DataSeeder` on first startup (only if the table is
empty). Both passwords are `password123`.

| email                          | role     |
|--------------------------------|----------|
| `admin@anganwadi.local`        | ADMIN    |
| `employee@anganwadi.local`     | EMPLOYEE |

> **Change these immediately in any non-local environment.** In prod, set
> `SEED_DEFAULT_USERS=false` and create your first admin manually.

## API surface

```
POST   /auth/login                          public
GET    /me                                  authenticated
PATCH  /me                                  authenticated
POST   /attendance/checkin   {lat, lng}     authenticated
POST   /attendance/checkout  {lat, lng}     authenticated
GET    /payslip?month=YYYY-MM               authenticated (own slip)

GET    /admin/dashboard                     ADMIN
GET    /admin/employees?q=                  ADMIN
POST   /admin/employees                     ADMIN
PATCH  /admin/employees/{id}                ADMIN
DELETE /admin/employees/{id}                ADMIN  (soft-delete: sets active=false)
GET    /admin/attendance?employee_id=&from=&to=   ADMIN
GET    /admin/payslips?month=&employee_id=  ADMIN
POST   /admin/payslips/{id}/mark-paid       ADMIN
```

JWT: `Authorization: Bearer <token>`.

## Tests

```bash
cd backend && ./mvnw test    # JUnit: salary calc + auth flow
cd admin   && npm test       # Vitest: admin LoginPage form
```

## Schema cheat-sheet

```
employees(id, name, email UNIQUE, phone, password_hash, role,
          hourly_rate, active, created_at)

attendance(id, employee_id FK -> employees, check_in_at,
           check_in_lat, check_in_lng,
           check_out_at, check_out_lat, check_out_lng)
  INDEX (employee_id, check_in_at)

payslips(id, employee_id FK -> employees, month CHAR(7),
         total_hours, regular_pay, overtime_pay, gross_pay,
         paid, generated_at, UNIQUE (employee_id, month))
  INDEX (employee_id, month)
```
