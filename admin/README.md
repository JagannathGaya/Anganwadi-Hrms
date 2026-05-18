# admin

Web admin panel for **AnganwadiHrms**. React 18 + Vite + TypeScript.

## Requirements

- Node.js 20+
- npm 10+

## Setup

```bash
cd admin
npm install
cp .env.example .env  # then edit if your backend isn't on localhost:8080
```

## Run

```bash
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm run preview  # serve the production build locally
```

The dev server expects the backend at `VITE_API_BASE_URL` (default
`http://localhost:8080`). The backend's CORS allow-list defaults to
`http://localhost:5173`.

## Auth

`POST /auth/login` is shared with the mobile app. The admin panel adds a
**route guard** in [`RequireAdmin.tsx`](src/components/RequireAdmin.tsx) — if the
returned `role` is not `ADMIN`, the user is bounced back to `/login` with an
inline error and nothing is persisted. The token is kept in `localStorage` under
`hrms-auth`.

## Pages

- `/login` — email + password sign-in (admin only).
- `/dashboard` — totals: active employees, today's check-ins, current month payroll.
- `/employees` — search, create, set hourly rate inline (blur to save), deactivate.
- `/attendance` — pick employee + date range; lists events and pins them on a
  small dependency-free map (swap for Leaflet later if needed).
- `/payslips` — pick a month + optional employee, see breakdown, mark as paid.

## Tests

```bash
npm test          # run once
npm run test:watch
```

[`src/test/LoginPage.test.tsx`](src/test/LoginPage.test.tsx) covers:

- the form renders with email and password inputs,
- a non-admin role is rejected client-side with an "admin access" message,
- a successful admin login persists `hrms-auth` to `localStorage`,
- a 401 from the API surfaces the server error.

## Project layout

```
src/
  main.tsx           bootstraps React + Router
  App.tsx            routes + RequireAdmin
  styles.css         minimal CSS (no UI lib)
  api/client.ts      fetch wrapper, types, JWT-from-localStorage
  components/
    Layout.tsx       sidebar + topbar shell
    RequireAdmin.tsx route guard for role !== ADMIN
  pages/
    LoginPage.tsx
    Dashboard.tsx
    Employees.tsx
    AttendancePage.tsx
    Payslips.tsx
  test/
    setup.ts
    LoginPage.test.tsx
```
