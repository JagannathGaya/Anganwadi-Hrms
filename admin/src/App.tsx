import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import RequireAdmin from './components/RequireAdmin';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import AttendancePage from './pages/AttendancePage';
import Payslips from './pages/Payslips';
import Holidays from './pages/Holidays';
import Leaves from './pages/Leaves';
import Settings from './pages/Settings';
import Shifts from './pages/Shifts';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAdmin>
            <Layout />
          </RequireAdmin>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard"  element={<Dashboard />} />
        <Route path="/employees"  element={<Employees />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/payslips"   element={<Payslips />} />
        <Route path="/holidays"   element={<Holidays />} />
        <Route path="/leaves"     element={<Leaves />} />
        <Route path="/shifts"     element={<Shifts />} />
        <Route path="/settings"   element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
