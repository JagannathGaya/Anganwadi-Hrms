import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, LoginResponse, saveAuth } from '../api/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>('/auth/login', { email, password });
      if (res.role !== 'ADMIN') {
        setError('This account does not have admin access.');
        return;
      }
      saveAuth(res);
      nav('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <section className="login-hero">
        <div className="hero-brand">
          <div className="logo">A</div>
          <div>
            <div className="name">AnganwadiHrms</div>
            <div className="sub">Workforce management</div>
          </div>
        </div>
        <h1>
          Run your team's <span className="accent">attendance &amp; payroll</span><br />
          with one calm dashboard.
        </h1>
        <p>
          Track check-ins on a map, set monthly salaries, and generate
          payslips with automatic overtime — all from a single admin console.
        </p>
        <ul className="points">
          <li><span className="check">✓</span> GPS-anchored check-in / check-out</li>
          <li><span className="check">✓</span> Per-week 40h overtime at 1.5×</li>
          <li><span className="check">✓</span> JWT-secured, role-aware API</li>
        </ul>
      </section>

      <section className="login-card-wrap">
        <div className="login-card">
          <div className="login-h">
            <h2>Welcome back</h2>
            <p>Sign in to your administrator account.</p>
          </div>
          <form onSubmit={onSubmit} aria-label="login form">
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@anganwadi.local"
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button className="btn lg" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            {error && (
              <div role="alert" className="alert error">
                {error}
              </div>
            )}
          </form>
          <div className="demo">
            <b>Demo admin:</b> admin@anganwadi.local · password123
          </div>
        </div>
      </section>
    </div>
  );
}
