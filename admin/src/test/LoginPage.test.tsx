import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
  }

  it('renders email and password fields', () => {
    renderPage();
    expect(screen.getByRole('form', { name: /login form/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });

  it('rejects an EMPLOYEE-role login with an "admin only" message', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          token: 't',
          employeeId: 1,
          email: 'emp@test.local',
          name: 'Emp',
          role: 'EMPLOYEE',
        }),
    });

    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'emp@test.local');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/admin access/i);
    });
    expect(localStorage.getItem('hrms-auth')).toBeNull();
  });

  it('persists auth and accepts an ADMIN-role login', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          token: 'admin-token',
          employeeId: 99,
          email: 'admin@test.local',
          name: 'Admin',
          role: 'ADMIN',
        }),
    });

    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@test.local');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      const stored = localStorage.getItem('hrms-auth');
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!).token).toBe('admin-token');
    });
  });

  it('shows the API error when login fails with bad credentials', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'invalid credentials' }),
    });

    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@test.local');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid credentials/i);
    });
  });
});
