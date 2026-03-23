import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { API, apiFetch, fetchJson } from './apiConfig';

const AuthContext = createContext(null);

export function useDashboardAuth() {
  return useContext(AuthContext);
}

const SUITE_OPTIONS = [
  { id: 'webTv', label: 'WebTV (testcase/webTv)' },
  { id: 'optools', label: 'Optools' },
  { id: 'coreApp', label: 'Core App' },
];

function LoginSignupScreen({ allowSignup, onLogin, onSignup, error, setError }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError?.('');
    setBusy(true);
    try {
      if (mode === 'login') await onLogin(email, password);
      else await onSignup(email, password);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f12] px-4 text-[#e8e8ed]">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-[var(--accent)]">QA Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Sign in to continue</p>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium ${mode === 'login' ? 'bg-[var(--accent)] text-white' : 'bg-black/20 text-[var(--muted)]'}`}
          >
            Login
          </button>
          {allowSignup && (
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${mode === 'signup' ? 'bg-[var(--accent)] text-white' : 'bg-black/20 text-[var(--muted)]'}`}
            >
              Sign up
            </button>
          )}
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs text-[var(--muted)]">Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-black/30 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)]">Password (min 8 chars)</label>
            <input
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-black/30 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        {allowSignup && mode === 'signup' && (
          <p className="mt-4 text-xs text-[var(--muted)]">
            First user becomes an <strong>admin</strong> with all suites. Later signups need an admin to assign WebTV / Optools / Core App access.
          </p>
        )}
      </div>
    </div>
  );
}

function NoAccessScreen({ onLogout }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0f0f12] px-4 text-center text-[#e8e8ed]">
      <p className="max-w-md text-[var(--muted)]">
        Your account is active but has <strong>no suite access</strong> yet. Ask a dashboard admin to assign WebTV, Optools, or Core App in the Admin portal.
      </p>
      <button type="button" onClick={onLogout} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-white/5">
        Sign out
      </button>
    </div>
  );
}

export function AdminPortal({ onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await fetchJson(`${API}/admin/users`);
      setUsers(data.users || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createUser(e) {
    e.preventDefault();
    setErr('');
    try {
      await apiFetch(`${API}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role: newRole,
          suites: newRole === 'user' ? ['webTv'] : undefined,
        }),
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed');
      });
      setNewEmail('');
      setNewPassword('');
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function patchUser(id, body) {
    setErr('');
    try {
      await fetchJson(`${API}/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function deleteUser(id) {
    if (!window.confirm('Delete this user?')) return;
    setErr('');
    try {
      await apiFetch(`${API}/admin/users/${id}`, { method: 'DELETE' }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed');
      });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  function toggleSuite(userRow, suiteId) {
    const current = new Set((userRow.suites || []).map((s) => String(s)));
    if (current.has(suiteId)) current.delete(suiteId);
    else current.add(suiteId);
    patchUser(userRow.id, { suites: Array.from(current) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text)] shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-[var(--accent)]">Admin — users & suite access</h2>
          <button type="button" onClick={onClose} className="rounded border border-[var(--border)] px-3 py-1 text-sm hover:bg-white/5">
            Close
          </button>
        </div>
        {err && <p className="mt-2 text-sm text-[var(--danger)]">{err}</p>}

        <form onSubmit={createUser} className="mt-6 grid gap-3 rounded-lg border border-[var(--border)] p-4 md:grid-cols-2">
          <h3 className="md:col-span-2 text-sm font-medium text-[var(--muted)]">Create user</h3>
          <input
            type="email"
            placeholder="Email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="rounded border border-[var(--border)] bg-black/20 px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Password (8+)"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="rounded border border-[var(--border)] bg-black/20 px-3 py-2 text-sm"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="rounded border border-[var(--border)] bg-black/20 px-3 py-2 text-sm md:col-span-2"
          >
            <option value="user">User (assign suites below after create)</option>
            <option value="admin">Admin (all suites)</option>
          </select>
          <button type="submit" className="md:col-span-2 rounded bg-[var(--accent)] py-2 text-sm font-medium text-white">
            Create
          </button>
        </form>

        <div className="mt-6 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <th className="py-2 pr-2">Email</th>
                  <th className="py-2 pr-2">Role</th>
                  <th className="py-2">Suites</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--border)]/50">
                    <td className="py-2 pr-2 align-top">{u.email}</td>
                    <td className="py-2 pr-2 align-top">
                      <select
                        value={u.role}
                        onChange={(e) => patchUser(u.id, { role: e.target.value })}
                        className="rounded border border-[var(--border)] bg-black/20 px-2 py-1 text-xs"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="py-2 align-top">
                      {u.role === 'admin' ? (
                        <span className="text-xs text-[var(--muted)]">All suites</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {SUITE_OPTIONS.map((s) => (
                            <label key={s.id} className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={(u.suites || []).includes(s.id)}
                                onChange={() => toggleSuite(u, s.id)}
                              />
                              {s.label}
                            </label>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2 align-top text-right">
                      <button type="button" onClick={() => deleteUser(u.id)} className="text-xs text-[var(--danger)] hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [authDisabled, setAuthDisabled] = useState(false);
  const [allowSignup, setAllowSignup] = useState(false);
  const [authError, setAuthError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/auth/me`);
      const data = await res.json();
      setAuthDisabled(!!data.authDisabled);
      setAllowSignup(!!data.allowSignup);
      setUser(data.user || null);
    } catch {
      setUser(null);
      setAuthDisabled(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const res = await apiFetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setUser(data.user);
  }, []);

  const signup = useCallback(async (email, password) => {
    const res = await apiFetch(`${API}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sign up failed');
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await apiFetch(`${API}/auth/logout`, { method: 'POST' });
    setUser(null);
    await refresh();
  }, [refresh]);

  const value = {
    user,
    authDisabled,
    allowSignup,
    login,
    signup,
    logout,
    refresh,
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f12] text-[var(--muted)]">Loading…</div>
    );
  }

  if (!authDisabled && !user) {
    return (
      <LoginSignupScreen
        allowSignup={allowSignup}
        onLogin={login}
        onSignup={signup}
        error={authError}
        setError={setAuthError}
      />
    );
  }

  if (!authDisabled && user?.role === 'user' && (!user.suites || user.suites.length === 0)) {
    return <NoAccessScreen onLogout={logout} />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { SUITE_OPTIONS };
