/**
 * Dashboard auth: JWT cookie session, JSON user store, suite-based RBAC.
 * Set DASHBOARD_AUTH_DISABLED=1 to skip (local dev). DASHBOARD_JWT_SECRET in .env for production.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const COOKIE_NAME = 'dashboard_session';
const TOKEN_DAYS = 7;
const BCRYPT_ROUNDS = 10;

function isAuthDisabled() {
  const v = process.env.DASHBOARD_AUTH_DISABLED;
  return v === '1' || v === 'true' || v === 'yes';
}

function allowPublicSignup() {
  const v = process.env.DASHBOARD_ALLOW_SIGNUP;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
}

function getStorePath() {
  return path.join(__dirname, '..', 'dashboard', 'data', 'auth-users.json');
}

function loadStore() {
  const p = getStorePath();
  if (!fs.existsSync(p)) return { users: [] };
  try {
    const o = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { users: Array.isArray(o.users) ? o.users : [] };
  } catch {
    return { users: [] };
  }
}

function saveStore(store) {
  const p = getStorePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ users: store.users }, null, 2), 'utf8');
}

function getJwtSecret() {
  const fromEnv = process.env.DASHBOARD_JWT_SECRET;
  if (fromEnv && String(fromEnv).length >= 16) return String(fromEnv);
  const secretPath = path.join(__dirname, '..', 'dashboard', 'data', '.jwt-secret');
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf8').trim();
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  fs.writeFileSync(secretPath, secret, 'utf8');
  console.warn(
    '[dashboard-auth] Wrote dashboard/data/.jwt-secret — set DASHBOARD_JWT_SECRET in .env for multi-machine deploys.'
  );
  return secret;
}

/** Canonical testcase folder ids */
function normalizeSuiteId(s) {
  if (s == null || s === '') return '';
  const x = String(s).trim();
  const lower = x.toLowerCase().replace(/-/g, '');
  if (lower === 'webtv') return 'webTv';
  if (lower === 'optools') return 'optools';
  if (lower === 'coreapp') return 'coreApp';
  return x;
}

function userHasSuiteAccess(user, suiteFolder) {
  if (!user) return false;
  if (isAuthDisabled()) return true;
  if (user.role === 'admin') return true;
  const want = normalizeSuiteId(suiteFolder).toLowerCase();
  const allowed = (user.suites || []).map((a) => normalizeSuiteId(a).toLowerCase());
  return allowed.includes(want);
}

function scenarioMatchesSuiteFolder(scenario, suiteFolder) {
  const norm = normalizeSuiteId(suiteFolder).toLowerCase();
  const name = scenario?.name || '';
  const keyMatch = name.match(/\((WSTE-\d+|WQO-\d+|WQ-\d+)\)/i);
  const k = (scenario?.key || keyMatch?.[1] || '').toUpperCase();
  if (norm === 'webtv') return k.startsWith('WSTE');
  if (norm === 'optools') return k.startsWith('WQO');
  if (norm === 'coreapp') return k.startsWith('WQ-');
  return false;
}

function filterScenariosForUser(scenarios, user) {
  if (isAuthDisabled() || !user || user.role === 'admin') return scenarios || [];
  const allowed = (user.suites || []).map(normalizeSuiteId).filter(Boolean);
  if (allowed.length === 0) return [];
  return (scenarios || []).filter((s) => allowed.some((folder) => scenarioMatchesSuiteFolder(s, folder)));
}

function sanitizeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    suites: (u.suites || []).map(normalizeSuiteId),
  };
}

function signUserToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      suites: (user.suites || []).map(normalizeSuiteId),
    },
    getJwtSecret(),
    { expiresIn: `${TOKEN_DAYS}d` }
  );
}

function verifyUserFromToken(token) {
  try {
    const payload = jwt.verify(token, getJwtSecret());
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      suites: (payload.suites || []).map(normalizeSuiteId),
    };
  } catch {
    return null;
  }
}

function filterExecuteResultsForUser(data, user) {
  if (isAuthDisabled() || !user || user.role === 'admin') return data || {};
  const allowed = new Set((user.suites || []).map((s) => normalizeSuiteId(s).toLowerCase()));
  if (allowed.size === 0) return {};
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    const suitePart = k.split(':')[0];
    if (allowed.has(normalizeSuiteId(suitePart).toLowerCase())) out[k] = v;
  }
  return out;
}

function filterProjectsList(projects, user) {
  if (isAuthDisabled() || !user || user.role === 'admin') return projects;
  const allowed = new Set((user.suites || []).map((s) => normalizeSuiteId(s).toLowerCase()));
  return (projects || []).filter((p) => allowed.has(normalizeSuiteId(p.id).toLowerCase()));
}

function registerPublicAuthRoutes(app) {
  app.get('/api/auth/me', (req, res) => {
    if (isAuthDisabled()) {
      return res.json({
        authDisabled: true,
        allowSignup: false,
        user: { id: 'local', email: 'local@dev', role: 'admin', suites: ['webTv', 'optools', 'coreApp'] },
      });
    }
    const t = req.cookies?.[COOKIE_NAME];
    const u = t ? verifyUserFromToken(t) : null;
    if (!u) {
      return res.json({ user: null, authDisabled: false, allowSignup: allowPublicSignup() });
    }
    const store = loadStore();
    const full = store.users.find((x) => x.id === u.id);
    if (!full) {
      res.clearCookie(COOKIE_NAME, { path: '/' });
      return res.json({ user: null, authDisabled: false, allowSignup: allowPublicSignup() });
    }
    res.json({ user: sanitizeUser(full), authDisabled: false, allowSignup: allowPublicSignup() });
  });

  app.post('/api/auth/login', async (req, res) => {
    if (isAuthDisabled()) {
      return res.json({
        success: true,
        user: { id: 'local', email: 'local@dev', role: 'admin', suites: ['webTv', 'optools', 'coreApp'] },
      });
    }
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const store = loadStore();
    const user = store.users.find((x) => x.email.toLowerCase() === String(email).toLowerCase().trim());
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid email or password' });
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    const token = signUserToken(user);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: TOKEN_DAYS * 864e5,
      path: '/',
    });
    res.json({ success: true, user: sanitizeUser(user) });
  });

  app.post('/api/auth/signup', async (req, res) => {
    if (isAuthDisabled()) return res.status(400).json({ error: 'Sign up not available while auth is disabled' });
    if (!allowPublicSignup()) {
      return res.status(403).json({ error: 'Sign up is disabled. Ask an admin to create your account.' });
    }
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const store = loadStore();
    const em = String(email).toLowerCase().trim();
    if (store.users.some((x) => x.email.toLowerCase() === em)) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const isFirst = store.users.length === 0;
    const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
    const user = {
      id: crypto.randomUUID(),
      email: em,
      passwordHash,
      role: isFirst ? 'admin' : 'user',
      suites: isFirst ? ['webTv', 'optools', 'coreApp'] : [],
      createdAt: new Date().toISOString(),
    };
    store.users.push(user);
    saveStore(store);
    const token = signUserToken(user);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: TOKEN_DAYS * 864e5,
      path: '/',
    });
    res.json({
      success: true,
      user: sanitizeUser(user),
      message: isFirst
        ? 'First account is admin with access to all suites (WebTV, Optools, Core App).'
        : 'Account created. An admin must assign suite access before you see projects.',
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ success: true });
  });
}

function registerAdminRoutes(app) {
  app.get('/api/admin/users', (req, res) => {
    if (isAuthDisabled()) return res.json({ users: [], authDisabled: true });
    const admin = req.dashboardUser;
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const store = loadStore();
    res.json({
      users: store.users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        suites: (u.suites || []).map(normalizeSuiteId),
        createdAt: u.createdAt,
      })),
    });
  });

  app.post('/api/admin/users', async (req, res) => {
    if (isAuthDisabled()) return res.status(400).json({ error: 'Auth is disabled' });
    const admin = req.dashboardUser;
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { email, password, role, suites } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    if (String(password).length < 8) return res.status(400).json({ error: 'Password min 8 characters' });
    const store = loadStore();
    const em = String(email).toLowerCase().trim();
    if (store.users.some((x) => x.email.toLowerCase() === em)) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    const isAdmin = role === 'admin';
    const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
    const user = {
      id: crypto.randomUUID(),
      email: em,
      passwordHash,
      role: isAdmin ? 'admin' : 'user',
      suites: isAdmin ? ['webTv', 'optools', 'coreApp'] : (Array.isArray(suites) ? suites.map(normalizeSuiteId) : []),
      createdAt: new Date().toISOString(),
    };
    store.users.push(user);
    saveStore(store);
    res.json({ success: true, user: sanitizeUser(user) });
  });

  app.patch('/api/admin/users/:id', (req, res) => {
    if (isAuthDisabled()) return res.status(400).json({ error: 'Auth is disabled' });
    const admin = req.dashboardUser;
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { role, suites } = req.body || {};
    const store = loadStore();
    const idx = store.users.findIndex((u) => u.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'User not found' });
    if (role === 'admin' || role === 'user') store.users[idx].role = role;
    if (Array.isArray(suites)) store.users[idx].suites = suites.map(normalizeSuiteId);
    if (store.users[idx].role === 'admin') {
      store.users[idx].suites = ['webTv', 'optools', 'coreApp'];
    }
    saveStore(store);
    res.json({ success: true, user: sanitizeUser(store.users[idx]) });
  });

  app.delete('/api/admin/users/:id', (req, res) => {
    if (isAuthDisabled()) return res.status(400).json({ error: 'Auth is disabled' });
    const admin = req.dashboardUser;
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    if (req.params.id === admin.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    const store = loadStore();
    store.users = store.users.filter((u) => u.id !== req.params.id);
    saveStore(store);
    res.json({ success: true });
  });
}

function authGate(req, res, next) {
  if (isAuthDisabled()) {
    req.dashboardUser = {
      id: 'local',
      email: 'local@dev',
      role: 'admin',
      suites: ['webTv', 'optools', 'coreApp'],
    };
    return next();
  }
  const p = req.path || '';
  if (!p.startsWith('/api/')) return next();
  if (
    p === '/api/auth/me' ||
    p === '/api/auth/login' ||
    p === '/api/auth/signup' ||
    p === '/api/auth/logout'
  ) {
    return next();
  }
  const token = req.cookies?.[COOKIE_NAME];
  const u = token ? verifyUserFromToken(token) : null;
  if (!u) {
    return res.status(401).json({ error: 'Unauthorized', code: 'LOGIN_REQUIRED' });
  }
  const store = loadStore();
  const full = store.users.find((x) => x.id === u.id);
  if (!full) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.status(401).json({ error: 'Session invalid', code: 'LOGIN_REQUIRED' });
  }
  req.dashboardUser = {
    id: full.id,
    email: full.email,
    role: full.role,
    suites: (full.suites || []).map(normalizeSuiteId),
  };
  next();
}

function assertSuiteBody(req, res, suite) {
  if (isAuthDisabled()) return true;
  if (!suite) return true;
  if (!userHasSuiteAccess(req.dashboardUser, suite)) {
    res.status(403).json({ error: 'No access to this suite' });
    return false;
  }
  return true;
}

module.exports = {
  COOKIE_NAME,
  isAuthDisabled,
  /** @readonly */
  allowPublicSignup,
  cookieParserMiddleware: cookieParser(),
  normalizeSuiteId,
  userHasSuiteAccess,
  filterScenariosForUser,
  filterExecuteResultsForUser,
  filterProjectsList,
  registerPublicAuthRoutes,
  registerAdminRoutes,
  authGate,
  assertSuiteBody,
};
