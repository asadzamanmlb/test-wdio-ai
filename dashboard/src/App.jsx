import { useEffect, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

// Use same origin; fallback to :4000 when opened as file:// (e.g. from editor preview)
const API =
  typeof window !== 'undefined' && window.location?.origin && !window.location.origin.startsWith('file')
    ? `${window.location.origin}/api`
    : 'http://localhost:4000/api';

async function fetchJson(url) {
  const res = await fetch(url);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(
      'Dashboard API returned HTML instead of JSON. Run `npm run dashboard` to start the API server on port 4000.'
    );
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

function Card({ title, value, sub, variant = 'default' }) {
  const colors = {
    default: 'border-[var(--border)]',
    success: 'border-[var(--success)]',
    danger: 'border-[var(--danger)]',
    warning: 'border-[var(--warning)]',
  };
  return (
    <div className={` rounded-lg border-l-4 bg-[var(--surface)] p-4 ${colors[variant] || colors.default}`}>
      <div className="text-sm text-[var(--muted)] uppercase tracking-wider">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub != null && <div className="mt-0.5 text-sm text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

function extractSuiteAndKey(scenario) {
  const name = scenario?.name || scenario?.id || '';
  const keyMatch = name.match(/\((WSTE-\d+|WQO-\d+)\)/i);
  const key = (scenario?.key || keyMatch?.[1] || '').toUpperCase();
  const suite = key.startsWith('WSTE') ? 'webTv' : key.startsWith('WQO') ? 'optools' : null;
  return { suite, key };
}

function FailedScenarios({ items, runs, selectedRunId, onRunSelect, currentRunId, onRefresh, fixStatus, onFixStart, onFixStop, env }) {
  const rawItems = selectedRunId && runs?.length
    ? (runs.find((r) => r.id === selectedRunId)?.failedScenarios || [])
    : items || [];
  const displayItems = rawItems;
  const runId = currentRunId || selectedRunId;
  if (!displayItems?.length && !runs?.length && !rawItems?.length) return null;
  const runLabel = (r) => {
    if (!r?.date) return r?.id || 'Unknown';
    const d = new Date(r.timestamp);
    return `${r.date} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${r.failed} failed)`;
  };
  return (
    <div className="mt-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium uppercase tracking-wider text-[var(--danger)]">
          Failed Scenarios ({displayItems.length})
        </h3>
        <div className="flex items-center gap-2">
          {displayItems?.length > 0 && runId && (
            <button
              onClick={async () => {
                await fetch(`${API}/runs/${runId}/delete-scenarios`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ scenarioIds: displayItems.map((s) => s.id) }),
                });
                onRunSelect?.(null);
                onRefresh?.();
              }}
              className="rounded border border-[var(--danger)]/50 px-2 py-1 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10"
            >
              Delete all
            </button>
          )}
          {runs?.length > 0 && (
            <select
            value={selectedRunId || ''}
            onChange={(e) => onRunSelect?.(e.target.value || null)}
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)]"
          >
            <option value="">Latest</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {runLabel(r)}
              </option>
            ))}
            </select>
          )}
        </div>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {displayItems.map((s) => (
          <div key={s.id} className="p-4 flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[var(--text)] truncate" title={s.name}>
                {s.name}
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5">{s.feature}</div>
              {s.failStep && (
                <div className="mt-1 text-xs font-medium text-[var(--danger)]">Step: {s.failStep}</div>
              )}
              {s.failReason && (
                <pre className="mt-2 text-xs text-[var(--muted)] whitespace-pre-wrap break-words bg-black/20 rounded p-2 max-h-24 overflow-y-auto">
                  {s.failReason.split('\n')[0]}
                </pre>
              )}
            </div>
            <div className="flex items-start gap-2 shrink-0">
              {runId && (
                <button
                  onClick={async () => {
                    await fetch(`${API}/runs/${runId}/delete-scenarios`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ scenarioIds: [s.id] }),
                    });
                    onRefresh?.();
                  }}
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
                  title="Delete"
                >
                  Delete
                </button>
              )}
              {(() => {
                const { suite, key } = extractSuiteAndKey(s);
                if (!suite || !key) return null;
                const isThisFixing = fixStatus?.running && fixStatus?.key === key && fixStatus?.suite === suite;
                return (
                  <button
                    onClick={() => (isThisFixing ? onFixStop?.() : onFixStart?.(suite, key))}
                    disabled={fixStatus?.running && !isThisFixing}
                    className="rounded border border-[var(--accent)]/50 px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50"
                    title={isThisFixing ? 'Stop fixing' : 'Fix (run until pass, capture page objects)'}
                  >
                    {isThisFixing ? `Stop (attempt ${fixStatus?.attempt || 0})` : 'Fix'}
                  </button>
                );
              })()}
              {s.screenshot && (
                <a
                  href={s.screenshot}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <img
                    src={s.screenshot}
                    alt={`Screenshot: ${s.name}`}
                    className="max-h-32 rounded border border-[var(--border)] object-contain hover:opacity-90"
                  />
                </a>
              )}
              {s.video && (
                <div className="flex flex-col gap-1 max-w-[280px]">
                  <span className="text-[10px] uppercase text-[var(--muted)]">Recording</span>
                  <video
                    controls
                    className="max-h-32 rounded border border-[var(--border)] bg-black"
                    src={s.video}
                    preload="metadata"
                  />
                  <a
                    href={s.video}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Open video
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metrics({ data, runs, failedScenariosRunId, setFailedScenariosRunId, onRefresh, fixStatus, onFixStart, onFixStop, executeEnv }) {
  if (!data?.hasData) {
    return (
      <div className="rounded-lg bg-[var(--surface)] p-8 text-center text-[var(--muted)]">
        No run data yet. Run <code className="rounded bg-black/30 px-1">npm run test:webtv:qa</code> to populate.
      </div>
    );
  }

  const pieData = [
    { name: 'Passed', value: data.passed, color: 'var(--success)' },
    { name: 'Failed', value: data.failed, color: 'var(--danger)' },
    { name: 'Skipped', value: data.skipped, color: 'var(--warning)' },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Pass Rate"
          value={`${data.passRate}%`}
          sub={`${data.passed} / ${data.total} scenarios`}
          variant={data.passRate >= 90 ? 'success' : data.passRate >= 70 ? 'warning' : 'danger'}
        />
        <Card title="Passed" value={data.passed} variant="success" />
        <Card title="Failed" value={data.failed} variant="danger" />
        <Card title="Skipped" value={data.skipped} variant="warning" />
        {pieData.length > 0 && (
          <div className="col-span-full sm:col-span-2 lg:col-span-1 flex items-center justify-center">
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                  }}
                  formatter={(v) => [v, '']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <FailedScenarios
        items={data.failedScenarios}
        runs={(runs || []).filter((r) => (r.failedScenarios?.length || 0) > 0)}
        selectedRunId={failedScenariosRunId}
        onRunSelect={setFailedScenariosRunId}
        currentRunId={failedScenariosRunId || data.runId}
        onRefresh={onRefresh}
        fixStatus={fixStatus}
        onFixStart={onFixStart}
        onFixStop={onFixStop}
        env={executeEnv}
      />
    </div>
  );
}

function TrendsChart({ data }) {
  if (!data?.length) return null;

  const tickStyle = { fill: 'var(--muted)', fontSize: 11 };
  return (
    <div className="rounded-lg bg-[var(--surface)] p-4">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
        Pass Rate Trend
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={tickStyle} />
          <YAxis domain={[0, 100]} tick={tickStyle} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
            }}
            formatter={(value) => [`${value}%`, 'Pass Rate']}
            labelFormatter={(label) => `Run: ${label}`}
          />
          <Line
            type="monotone"
            dataKey="passRate"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ fill: 'var(--accent)', r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SuitePieChart({ suite }) {
  const pieData = [
    { name: 'Automated', value: suite.automated ?? 0, fill: 'var(--success)' },
    { name: 'Manual', value: suite.manual ?? 0, fill: 'var(--border)' },
  ].filter((d) => d.value > 0);

  if (pieData.length === 0) {
    return (
      <div className="rounded-lg bg-[var(--surface)] p-4 text-center">
        <h4 className="mb-2 text-sm font-medium text-[var(--muted)]">{suite.displayName}</h4>
        <p className="text-xs text-[var(--muted)]">No test cases yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-[var(--surface)] p-4">
      <h4 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
        {suite.displayName} ({suite.total} total)
      </h4>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={60}
            label={({ name, value }) => `${name}: ${value}`}
            labelLine={{ stroke: 'var(--muted)' }}
          >
            {pieData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}
            formatter={(value, name) => [value, name]}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function AutomationCoverage({ data }) {
  if (!data) return null;

  const { suites = [], totalAutomated, totalManual, total } = data;

  if (suites.length === 0) {
    return (
      <div className="rounded-lg bg-[var(--surface)] p-6 text-center text-[var(--muted)]">
        No test case data. Add folders to testcase/ and sync from Xray.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Total Automated" value={totalAutomated ?? 0} sub={`of ${total ?? 0} total`} variant="success" />
        <Card title="Total Manual" value={totalManual ?? 0} sub={`of ${total ?? 0} total`} variant="default" />
      </div>
      <h4 className="text-sm font-medium uppercase tracking-wider text-[var(--muted)]">Automated vs Manual by Suite</h4>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {suites.map((suite) => (
          <SuitePieChart key={suite.name} suite={suite} />
        ))}
      </div>
    </div>
  );
}

function DiffView({ diff }) {
  if (!diff?.length) return null;
  return (
    <div className="rounded bg-black/30 p-2 font-mono text-xs whitespace-pre-wrap break-words">
      {diff.map((seg, i) => (
        <span
          key={i}
          className={seg.status === 'same' ? 'text-[var(--success)]' : 'text-[var(--accent)]'}
        >
          {seg.text}
        </span>
      ))}
    </div>
  );
}

function UpdateXrayDiffModal({ suite, scenarioKey, change, onClose, onUpdate, onRefresh }) {
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState(null);
  const [toastVariant, setToastVariant] = useState('success'); // 'success' | 'warning' | 'error'

  async function handleUpdate() {
    setUpdating(true);
    setToast(null);
    try {
      const res = await fetch(`${API}/update-xray/${suite}/${scenarioKey}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        const msg = !data.xrayUpdated && data.xrayError
          ? `${data.message} — ${data.xrayError}`
          : (data.message || 'Updated successfully');
        setToast(msg);
        setToastVariant(data.xrayUpdated ? 'success' : 'warning');
        setTimeout(() => {
          setToast(null);
          onUpdate?.();
          onRefresh?.();
          onClose?.();
        }, data.xrayUpdated ? 1500 : 5000);
      } else {
        setToast(data.error || 'Update failed');
        setToastVariant('error');
      }
    } catch (e) {
      setToast(e.message || 'Update failed');
      setToastVariant('error');
    } finally {
      setUpdating(false);
    }
  }

  const hasChanges = change?.hasChanges ?? false;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg bg-[var(--surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
            Update Xray — {suite} / {scenarioKey}
          </h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
          {change?.error ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--danger)]">{change.error}</p>
              {change.debug && (
                <pre className="text-xs text-[var(--muted)] bg-black/30 rounded p-2 overflow-auto max-h-32">
                  {JSON.stringify(change.debug, null, 2)}
                </pre>
              )}
            </div>
          ) : !hasChanges ? (
            <p className="text-sm text-[var(--success)]">No changes. Feature file matches testcase JSON and Xray.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[var(--muted)]">
                <strong>Update Xray</strong> = push Feature file → testcase JSON → Xray. Use <strong>Sync</strong> if Xray has the correct version.
              </p>
              <div className="rounded border border-[var(--border)] p-3">
                <div className="text-xs text-[var(--muted)] mb-2">
                  Feature file (will push) vs testcase JSON:
                </div>
                <DiffView diff={change.diff} />
              </div>
              {change.xrayGherkin && (
                <div className="rounded border border-[var(--warning)]/30 p-3">
                  <div className="text-xs text-[var(--warning)] mb-2">
                    Xray has different content — use Sync to pull from Xray, or Update to push feature.
                  </div>
                  <pre className="text-xs text-[var(--muted)] whitespace-pre-wrap max-h-32 overflow-y-auto">{change.xrayGherkin}</pre>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="border-t border-[var(--border)] px-4 py-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm border border-[var(--border)] hover:bg-black/20"
          >
            {hasChanges ? 'Close' : 'Close'}
          </button>
          {hasChanges && !change?.error && (
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="rounded px-3 py-1.5 text-sm bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
            >
              {updating ? 'Updating...' : 'Update'}
            </button>
          )}
        </div>
        {toast && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg px-6 py-3 font-medium shadow-lg toast-pop max-w-[90%] max-h-[60vh] overflow-y-auto ${
              toastVariant === 'success' ? 'bg-[var(--success)] text-white' :
              toastVariant === 'warning' ? 'bg-[var(--warning)] text-black' :
              'bg-[var(--danger)] text-white'
            }`}>
              {toast}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SyncDiffModal({ suite, key: scenarioKey, changes, onClose, onApply, onRefresh }) {
  const [applying, setApplying] = useState(false);
  const [toast, setToast] = useState(null);

  const [toastVariant, setToastVariant] = useState('success');

  async function handleApply() {
    if (!suite) return;
    setApplying(true);
    setToast(null);
    try {
      const url = scenarioKey
        ? `${API}/sync/${suite}/${scenarioKey}/apply`
        : `${API}/sync/${suite}/apply`;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setToast('Updated successfully');
        setToastVariant('success');
        setTimeout(() => {
          setToast(null);
          onApply?.();
          onRefresh?.();
          onClose?.();
        }, 1500);
      } else {
        const errMsg = data.error || (res.status ? `Request failed (${res.status})` : 'Update failed');
        setToast(errMsg);
        setToastVariant('error');
      }
    } catch (e) {
      setToast(e.message || 'Update failed');
      setToastVariant('error');
    } finally {
      setApplying(false);
    }
  }

  const withChanges = changes?.filter((c) => c.hasChanges) ?? [];
  const showUpdateButton = withChanges.length > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg bg-[var(--surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
            Sync preview — {suite}{scenarioKey ? ` / ${scenarioKey}` : ''}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--text)]"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
          {changes?.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No scenarios fetched.</p>
          ) : withChanges.length === 0 ? (
            <p className="text-sm text-[var(--success)]">No changes detected. All scenarios are up to date.</p>
          ) : (
            <>
              <p className="text-xs text-[var(--muted)] mb-2">
                Xray differs from local (JSON + feature file). Click Update to pull from Xray → update testcase JSON and feature files.
              </p>
              {withChanges.map((c) => (
                <div key={c.key} className="rounded border border-[var(--border)] p-3">
                  <div className="font-mono text-xs text-[var(--muted)] mb-2">{c.key} — {c.summary}</div>
                  <DiffView diff={c.diff} />
                </div>
              ))}
            </>
          )}
        </div>
        <div className="border-t border-[var(--border)] px-4 py-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm border border-[var(--border)] hover:bg-black/20"
          >
            {showUpdateButton ? 'Cancel' : 'Close'}
          </button>
          {showUpdateButton && (
            <button
              onClick={handleApply}
              disabled={applying}
              className="rounded px-3 py-1.5 text-sm bg-[var(--success)] text-white hover:opacity-90 disabled:opacity-50"
            >
              {applying ? 'Updating...' : 'Update'}
            </button>
          )}
        </div>
        {toast && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg px-6 py-3 font-medium shadow-lg toast-pop max-w-[90%] max-h-[40vh] overflow-y-auto ${
              toastVariant === 'success' ? 'bg-[var(--success)] text-white' : 'bg-[var(--danger)] text-white'
            }`}>
              {toast}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScenarioRow({
  scenario,
  suiteName,
  jiraBaseUrl,
  env,
  headless,
  browser,
  recordVideo,
  useSauce,
  highlightElements,
  persistedResult,
  onSync,
  syncLoading,
  fixStatus,
  onFixStart,
  onFixStop,
  syncStatus,
  onAutomate,
  automateLoading,
  automateStatus,
  onUpdateXray,
  updateXrayLoading,
  selected,
  onSelectChange,
}) {
  const [runState, setRunState] = useState(null); // { status, failReason?, screenshot?, video? } | null - from current session
  const [running, setRunning] = useState(false);
  const [showFailDetails, setShowFailDetails] = useState(false);
  const [showRecording, setShowRecording] = useState(false);
  const effectiveState = runState ?? persistedResult; // persisted survives refresh

  async function handleExecute() {
    if (!scenario.automated || running) return;
    setRunning(true);
    setRunState(null);
    try {
      const res = await fetch(`${API}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suite: suiteName,
          key: scenario.key,
          env: env || 'beta',
          headless: !!headless,
          browser: browser || 'chrome',
          recordVideo: useSauce ? false : !!recordVideo,
          useSauce: !!useSauce,
          highlightElements: highlightElements === true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRunState({
          status: 'failed',
          failStep: null,
          failReason: data.error || data.failReason || `Request failed (${res.status})`,
          screenshot: null,
          video: null,
          sauceUrl: null,
        });
        setShowFailDetails(true);
        return;
      }
      const newState = {
        status: data.status || (data.success ? 'passed' : 'failed'),
        failStep: data.failStep || null,
        failReason: data.failReason || null,
        screenshot: data.screenshot || null,
        video: data.video || null,
        sauceUrl: data.sauceUrl || null,
      };
      setRunState(newState);
      if (data.status === 'failed') setShowFailDetails(true);
      if (data.video) setShowRecording(true);
    } catch (e) {
      setRunState({ status: 'failed', failStep: null, failReason: e.message, screenshot: null, video: null, sauceUrl: null });
    } finally {
      setRunning(false);
    }
  }

  const statusEl = !effectiveState
    ? null
    : effectiveState.status === 'passed'
      ? <span className="text-[var(--success)] font-medium">Pass</span>
      : <span className="text-[var(--danger)] font-medium">Fail</span>;

  return (
    <>
      <tr className="border-b border-[var(--border)]/50 hover:bg-black/20">
        <td className="px-2 py-2 w-10">
          {scenario.automated && onSelectChange && (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={(e) => onSelectChange(scenario.key, e.target.checked)}
              className="rounded"
              title="Select to run with Run Selected"
            />
          )}
        </td>
        <td className="px-4 py-2 font-mono text-xs">
          {scenario.key && /^(WSTE|WQO|WQ)-\d+$/i.test(scenario.key) && jiraBaseUrl ? (
            <a
              href={`${jiraBaseUrl.replace(/\/$/, '')}/browse/${scenario.key}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline"
              title={`Open ${scenario.key} in Jira`}
            >
              {scenario.key}
            </a>
          ) : (
            scenario.key
          )}
        </td>
        <td className="px-4 py-2 max-w-[400px]" title={scenario.summary}>
          <span className="block truncate">{scenario.summary}</span>
          {syncStatus && (
            <span className="flex gap-1 mt-0.5 flex-wrap">
              {syncStatus.newKeys?.has(scenario.key) && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-[var(--accent)]/20 text-[var(--accent)]">
                  New in Xray
                </span>
              )}
              {syncStatus.updatedKeys?.has(scenario.key) && !syncStatus.newKeys?.has(scenario.key) && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-[var(--warning)]/20 text-[var(--warning)]">
                  Update available
                </span>
              )}
            </span>
          )}
        </td>
        <td className="px-4 py-2">
          <span className={scenario.automated ? 'text-[var(--success)]' : 'text-[var(--muted)]'}>
            {scenario.automated ? 'Automated' : 'Manual'}
          </span>
        </td>
        <td className="px-4 py-2 min-w-[280px]">
          <div className="flex flex-wrap items-center gap-2">
            {scenario.automated && (
              <button
                onClick={handleExecute}
                disabled={running}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-black/20 disabled:opacity-50 shrink-0"
              >
                {running ? 'Running…' : 'Execute'}
              </button>
            )}
            {suiteName && (
              <button
                onClick={() => onSync?.(scenario.key)}
                disabled={syncLoading}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-black/20 disabled:opacity-50 shrink-0"
                title="Sync from Xray"
              >
                {syncLoading ? '…' : 'Sync'}
              </button>
            )}
            {suiteName && scenario.key && scenario.automated && (
              <button
                onClick={() => onUpdateXray?.(scenario.key)}
                disabled={updateXrayLoading}
                className="rounded border border-[var(--warning)]/50 px-2 py-1 text-xs font-medium text-[var(--warning)] hover:bg-[var(--warning)]/10 disabled:opacity-50 shrink-0"
                title="Push feature file changes to testcase + Xray"
              >
                {updateXrayLoading ? '…' : 'Update Xray'}
              </button>
            )}
            {suiteName && (
              <button
                onClick={() => onAutomate?.(scenario.key)}
                disabled={automateLoading}
                className="rounded border border-[var(--success)]/50 px-2 py-1 text-xs text-[var(--success)] hover:bg-[var(--success)]/10 disabled:opacity-50"
                title="Create feature + step defs, then run WebTV QA Engineer (create → run → fix loop)"
              >
                {automateLoading
                  ? (automateStatus?.running && automateStatus?.key === scenario.key
                    ? `Automating (${automateStatus?.attempt || 0})…`
                    : '…')
                  : 'Automate'}
              </button>
            )}
            {suiteName && scenario.automated && (effectiveState?.status === 'failed' || (fixStatus?.running && fixStatus?.key === scenario.key)) && (() => {
              const isThisFixing = fixStatus?.running && fixStatus?.key === scenario.key && fixStatus?.suite === suiteName;
              return (
                <button
                  onClick={() => (isThisFixing ? onFixStop?.() : onFixStart?.(suiteName, scenario.key))}
                  disabled={fixStatus?.running && !isThisFixing}
                  className="rounded border border-[var(--accent)]/50 px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50"
                  title={isThisFixing ? 'Stop fixing' : 'Fix (run until pass, capture page objects)'}
                >
                  {isThisFixing ? `Stop (${fixStatus?.attempt || 0})` : 'Fix'}
                </button>
              );
            })()}
          </div>
        </td>
        <td className="px-4 py-2">
          <div className="flex flex-col gap-1">
            {statusEl}
            {effectiveState?.sauceUrl && (
              <a
                href={effectiveState.sauceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--accent)] hover:underline font-medium"
                title="Open this scenario’s Sauce Labs session in a new tab"
              >
                Sauce job ↗
              </a>
            )}
          </div>
        </td>
      </tr>
      {effectiveState?.status === 'failed' && (effectiveState.failStep || effectiveState.failReason || effectiveState.screenshot) && (
        <tr>
          <td colSpan={6} className="px-4 py-0">
            <div
              className="cursor-pointer border-t border-[var(--border)]/50 bg-[var(--danger)]/5 px-4 py-2 text-xs text-[var(--muted)] hover:bg-[var(--danger)]/10"
              onClick={() => setShowFailDetails((v) => !v)}
            >
              {showFailDetails ? '▼' : '▶'} Failure details
            </div>
            {showFailDetails && (
              <div className="border-t border-[var(--border)]/50 bg-black/20 px-4 py-3 space-y-2">
                {effectiveState.failStep && (
                  <div className="text-xs font-medium text-[var(--danger)]">
                    Step: {effectiveState.failStep}
                  </div>
                )}
                {effectiveState.failReason && (
                  <pre className="text-xs text-[var(--muted)] whitespace-pre-wrap break-words rounded bg-black/30 p-2 max-h-40 overflow-y-auto">
                    {effectiveState.failReason}
                  </pre>
                )}
                {effectiveState.screenshot && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-[var(--muted)]">Screenshot</div>
                    <a href={effectiveState.screenshot} target="_blank" rel="noopener noreferrer" className="inline-block">
                      <img
                        src={effectiveState.screenshot}
                        alt="Failure screenshot"
                        className="max-h-48 rounded border border-[var(--border)] object-contain hover:opacity-90"
                      />
                    </a>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
      {effectiveState?.video && (
        <tr>
          <td colSpan={6} className="px-4 py-0">
            <div
              className="cursor-pointer border-t border-[var(--border)]/50 bg-[var(--accent)]/5 px-4 py-2 text-xs text-[var(--muted)] hover:bg-[var(--accent)]/10"
              onClick={() => setShowRecording((v) => !v)}
            >
              {showRecording ? '▼' : '▶'} Screen recording
            </div>
            {showRecording && (
              <div className="border-t border-[var(--border)]/50 bg-black/20 px-4 py-3 space-y-2">
                <video
                  controls
                  className="max-h-56 w-full max-w-2xl rounded border border-[var(--border)] bg-black"
                  src={effectiveState.video}
                  preload="metadata"
                />
                <a
                  href={effectiveState.video}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs text-[var(--accent)] hover:underline"
                >
                  Open recording in new tab
                </a>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function ScenarioList({
  scenarios,
  title,
  suiteName,
  suiteId,
  jiraBaseUrl,
  onRefresh,
  env,
  headless,
  browser,
  recordVideo,
  useSauce,
  highlightElements,
  parallel,
  parallelWorkers,
  executeResults,
  fixStatus,
  onFixStart,
  onFixStop,
  automateStatus,
  searchQuery,
}) {
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncLoadingKey, setSyncLoadingKey] = useState(null);
  const [runAllLoading, setRunAllLoading] = useState(false);
  const [syncPreview, setSyncPreview] = useState(null);
  const [syncPreviewKey, setSyncPreviewKey] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [automateLoadingKey, setAutomateLoadingKey] = useState(null);
  const [updateXrayLoadingKey, setUpdateXrayLoadingKey] = useState(null);
  const [updateXrayPreview, setUpdateXrayPreview] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());

  async function fetchSyncStatus() {
    if (!suiteName) return;
    try {
      const res = await fetch(`${API}/sync/${suiteName}/status`);
      const data = await res.json();
      if (res.ok && data) {
        const newList = data.new || [];
        const updatedList = data.updated || [];
        setSyncStatus({
          newKeys: new Set(newList.map((x) => x.key)),
          newList, // for banner (scenarios not yet in local list)
          updatedKeys: new Set(updatedList.map((x) => x.key)),
        });
      } else {
        setSyncStatus(null);
      }
    } catch (_) {
      setSyncStatus(null);
    }
  }

  useEffect(() => {
    if (suiteName) fetchSyncStatus();
  }, [suiteName]);

  const prevAutomateRunning = useRef(false);
  useEffect(() => {
    const wasRunning = prevAutomateRunning.current;
    const nowRunning = automateStatus?.running ?? false;
    prevAutomateRunning.current = nowRunning;

    if (automateStatus && automateStatus.key && automateStatus.suite === (suiteId || suiteName)) {
      if (wasRunning && !nowRunning) {
        setAutomateLoadingKey(null);
        onRefresh?.();
        const r = automateStatus.lastResult;
        if (r?.success) {
          alert(`Automate complete – test passed after ${r.attempts?.length || 0} attempt(s).`);
        } else if (r?.attempts?.length) {
          const step = r.result?.failStep || r?.failStep;
          alert(`Automate finished – test failed after ${r.attempts.length} attempt(s).\n\n${r.reason || 'Unable to auto-fix.'}${step ? `\n\nFailing step: ${step}` : ''}`);
        }
      }
    }
  }, [automateStatus?.running, automateStatus?.key, automateStatus?.suite, automateStatus?.lastResult, suiteId, suiteName, onRefresh]);

  async function handleSync() {
    if (!suiteName) return;
    setSyncLoading(true);
    setSyncPreview(null);
    setSyncPreviewKey(null); // full-suite sync: apply uses /sync/:suite/apply
    try {
      const res = await fetch(`${API}/sync/${suiteName}/preview`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncPreview(data.changes);
      } else {
        setSyncPreview([{ error: data.error || 'Sync failed' }]);
      }
    } catch (e) {
      setSyncPreview([{ error: e.message }]);
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleUpdateXray(key) {
    if (!suiteName || !key) return;
    setUpdateXrayPreview(null);
    setUpdateXrayLoadingKey(key);
    try {
      const res = await fetch(`${API}/update-xray-preview/${suiteName}/${key}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success !== false) {
        setUpdateXrayPreview({ ...data, key: data.key ?? key });
      } else {
        setUpdateXrayPreview({ key, error: data.error || 'Failed to get preview' });
      }
    } catch (e) {
      setUpdateXrayPreview({ key, error: e.message || 'Failed to get preview' });
    } finally {
      setUpdateXrayLoadingKey(null);
    }
  }

  async function handleSyncScenario(key) {
    if (!suiteName || !key) return;
    setSyncPreview(null);
    setSyncPreviewKey(key);
    setSyncLoadingKey(key);
    try {
      const res = await fetch(`${API}/sync/${suiteName}/${key}/preview`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncPreview(data.changes);
      } else {
        setSyncPreview([{ error: data.error || 'Sync failed' }]);
      }
    } catch (e) {
      setSyncPreview([{ error: e.message }]);
    } finally {
      setSyncLoadingKey(null);
    }
  }

  const automatedScenarios = scenarios?.filter((s) => s.automated) || [];
  const automatedCount = automatedScenarios.length;
  const selectedCount = selectedKeys.size;
  const safariBrowser = (browser || 'chrome').toLowerCase() === 'safari';
  const parallelOk = !!parallel && !safariBrowser;

  function handleSelectChange(key, checked) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function handleRunSelected() {
    const suite = suiteId || suiteName;
    if (!suite || selectedCount === 0 || runAllLoading) return;
    setRunAllLoading(true);
    try {
      const res = await fetch(`${API}/execute-suite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suite,
          env: env || 'beta',
          headless: !!headless,
          browser: browser || 'chrome',
          keys: Array.from(selectedKeys),
          recordVideo: useSauce ? false : !!recordVideo,
          useSauce: !!useSauce,
          highlightElements: highlightElements === true,
          parallel: parallelOk && selectedCount > 1,
          parallelWorkers: parallelWorkers || 4,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onRefresh?.();
        const parHint =
          parallelOk && selectedCount > 1 ? ` (parallel: ${Math.min(16, Math.max(2, Number(parallelWorkers) || 4))} workers)` : '';
        alert(`Run complete: ${data.passed} passed, ${data.failed} failed (of ${data.total} selected)${parHint}`);
      } else {
        alert(data.error || 'Run failed');
      }
    } catch (e) {
      alert(e.message || 'Run failed');
    } finally {
      setRunAllLoading(false);
    }
  }

  async function handleRunAllAutomated() {
    const suite = suiteId || suiteName;
    if (!suite || automatedCount === 0 || runAllLoading) return;
    setRunAllLoading(true);
    try {
      const res = await fetch(`${API}/execute-suite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suite,
          env: env || 'beta',
          headless: !!headless,
          browser: browser || 'chrome',
          recordVideo: useSauce ? false : !!recordVideo,
          useSauce: !!useSauce,
          highlightElements: highlightElements === true,
          parallel: parallelOk && automatedCount > 1,
          parallelWorkers: parallelWorkers || 4,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onRefresh?.();
        const parHint =
          parallelOk && automatedCount > 1 ? ` (parallel: ${Math.min(16, Math.max(2, Number(parallelWorkers) || 4))} workers)` : '';
        alert(`Run complete: ${data.passed} passed, ${data.failed} failed (of ${data.total} automated)${parHint}`);
      } else {
        alert(data.error || 'Run failed');
      }
    } catch (e) {
      alert(e.message || 'Run failed');
    } finally {
      setRunAllLoading(false);
    }
  }

  async function handleAutomate(key) {
    if (!suiteName || !key) return;
    setAutomateLoadingKey(key);
    let agentStarted = false;
    try {
      const suiteIdForApi = suiteId || suiteName;
      const params = new URLSearchParams({ run: '1', headless: headless ? '1' : '0', browser: browser || 'chrome' });
      const res = await fetch(`${API}/automate/${suiteIdForApi}/${key}?${params}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.agentStarted) {
          agentStarted = true;
          return;
        }
        const msg = data.created?.length ? `Created: ${data.created.join(', ')}` : 'Automate complete';
        alert(msg);
        onRefresh?.();
      } else {
        alert(data.error || 'Automate failed');
      }
    } catch (e) {
      alert(e.message || 'Automate failed');
    } finally {
      if (!agentStarted) setAutomateLoadingKey(null);
    }
  }

  if (!scenarios?.length) {
    return (
      <div className="rounded-lg bg-[var(--surface)] p-6 text-center text-[var(--muted)]">
        <div className="flex items-center justify-center gap-2">
          <span>No scenarios in testcase/{title.toLowerCase()}</span>
          {suiteName && (
            <button
              onClick={handleSync}
              disabled={syncLoading}
              className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-black/20 disabled:opacity-50"
            >
              {syncLoading ? 'Syncing...' : 'Sync'}
            </button>
          )}
        </div>
      </div>
    );
  }
  const newCount = syncStatus?.newList?.length ?? 0;
  const q = (searchQuery || '').trim().toLowerCase();
  const filtered = q
    ? scenarios.filter(
        (s) =>
          (s.key && s.key.toLowerCase().includes(q)) ||
          (s.summary && s.summary.toLowerCase().includes(q))
      )
    : scenarios;

  return (
    <div className="overflow-hidden rounded-lg bg-[var(--surface)]">
      {newCount > 0 && (
        <div className="border-b border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-2 text-xs text-[var(--accent)] flex items-center justify-between gap-2">
          <span>{newCount} new scenario{newCount !== 1 ? 's' : ''} in Xray — use Sync to pull</span>
          <button
            onClick={handleSync}
            disabled={syncLoading}
            className="rounded border border-[var(--accent)]/50 px-2 py-1 text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:opacity-50"
          >
            {syncLoading ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      )}
      <div className="border-b border-[var(--border)] px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
          {title} ({filtered.length}{q ? ` of ${scenarios.length}` : ''})
        </h3>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (suiteId || suiteName) && (
            <button
              onClick={handleRunSelected}
              disabled={runAllLoading || fixStatus?.running}
              className="rounded border border-[var(--accent)]/50 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50 disabled:cursor-not-allowed"
              title={`Run ${selectedCount} selected test(s)`}
            >
              {runAllLoading ? `Running… (${selectedCount})` : `Run selected (${selectedCount})`}
            </button>
          )}
          {automatedCount > 0 && (suiteId || suiteName) && (
            <button
              onClick={handleRunAllAutomated}
              disabled={runAllLoading || fixStatus?.running}
              className="rounded border border-[var(--success)]/50 px-3 py-1.5 text-xs font-medium text-[var(--success)] hover:bg-[var(--success)]/10 disabled:opacity-50 disabled:cursor-not-allowed"
              title={`Run all ${automatedCount} automated test(s) in this suite`}
            >
              {runAllLoading ? `Running… (${automatedCount})` : `Run all (${automatedCount})`}
            </button>
          )}
          {suiteName && (
            <button
              onClick={handleSync}
              disabled={syncLoading}
              className="rounded border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-black/20 disabled:opacity-50"
            >
              {syncLoading ? 'Syncing...' : 'Sync'}
            </button>
          )}
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--surface)]">
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="px-2 py-2 w-10">
                {automatedCount > 0 && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedKeys(new Set(automatedScenarios.map((s) => s.key)))}
                      className="rounded px-1.5 py-0.5 text-[10px] hover:bg-black/20"
                      title="Select all"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedKeys(new Set())}
                      className="rounded px-1.5 py-0.5 text-[10px] hover:bg-black/20"
                      title="Unselect all"
                    >
                      None
                    </button>
                  </div>
                )}
              </th>
              <th className="px-4 py-2">Key</th>
              <th className="px-4 py-2">Summary</th>
              <th className="px-4 py-2 w-24">Type</th>
              <th className="px-4 py-2 min-w-[300px]">Actions</th>
              <th className="px-4 py-2 w-20">Result</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-[var(--muted)] text-sm">
                  {q ? `No scenarios match "${searchQuery.trim()}"` : 'No scenarios'}
                </td>
              </tr>
            ) : (
            filtered.map((s) => (
              <ScenarioRow
                key={s.key}
                scenario={s}
                suiteName={suiteId || suiteName}
                jiraBaseUrl={jiraBaseUrl}
                env={env}
                headless={headless}
                browser={browser}
                recordVideo={recordVideo}
                useSauce={useSauce}
                highlightElements={highlightElements}
                persistedResult={executeResults?.[`${suiteId || suiteName}:${s.key}`]}
                selected={selectedKeys.has(s.key)}
                onSelectChange={handleSelectChange}
                onSync={handleSyncScenario}
                syncLoading={syncLoadingKey === s.key}
                fixStatus={fixStatus}
                onFixStart={onFixStart}
                onFixStop={onFixStop}
                syncStatus={syncStatus}
                onAutomate={handleAutomate}
                automateLoading={automateLoadingKey === s.key || (automateStatus?.running && automateStatus?.key === s.key)}
                automateStatus={automateStatus}
                onUpdateXray={handleUpdateXray}
                updateXrayLoading={updateXrayLoadingKey === s.key}
              />
            ))
            )}
          </tbody>
        </table>
      </div>
      {syncPreview && Array.isArray(syncPreview) && syncPreview[0]?.error ? (
        <div className="p-4 text-sm text-[var(--danger)]">{syncPreview[0].error}</div>
      ) : null}
      {syncPreview && Array.isArray(syncPreview) && !syncPreview[0]?.error && (
        <SyncDiffModal
          suite={suiteName}
          key={syncPreviewKey}
          changes={syncPreview}
          onClose={() => { setSyncPreview(null); setSyncPreviewKey(null); }}
          onApply={() => { onRefresh?.(); setTimeout(fetchSyncStatus, 600); }}
          onRefresh={() => { onRefresh?.(); setTimeout(fetchSyncStatus, 600); }}
        />
      )}
      {updateXrayPreview && (
        <UpdateXrayDiffModal
          key={`${suiteId || suiteName}-${updateXrayPreview.key}`}
          suite={suiteId || suiteName}
          scenarioKey={updateXrayPreview.key}
          change={updateXrayPreview}
          onClose={() => setUpdateXrayPreview(null)}
          onUpdate={() => {}}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

function FlakyTable({ data }) {
  if (!data?.length) {
    return (
      <div className="rounded-lg bg-[var(--surface)] p-6 text-center text-[var(--muted)]">
        No flaky scenarios detected. (Need 3+ runs with both pass & fail for a scenario.)
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h3 className="text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
          Flaky Scenarios ({data.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="px-4 py-3">Feature</th>
              <th className="px-4 py-3">Scenario</th>
              <th className="px-4 py-3">Flakiness</th>
              <th className="px-4 py-3">Passed / Failed</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="border-b border-[var(--border)]/50 hover:bg-black/20">
                <td className="px-4 py-3">{row.feature}</td>
                <td className="max-w-[280px] truncate px-4 py-3" title={row.name}>
                  {row.name}
                </td>
                <td className="px-4 py-3">
                  <span className="text-[var(--warning)] font-medium">{row.flakyScore}%</span>
                </td>
                <td className="px-4 py-3">
                  {row.passed} / {row.failed} (of {row.totalRuns} runs)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function App() {
  const [selectedProject, setSelectedProject] = useState('all');
  const [projects, setProjects] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [trends, setTrends] = useState([]);
  const [flaky, setFlaky] = useState([]);
  const [automation, setAutomation] = useState(null);
  const [suites, setSuites] = useState([]);
  const [syncConfigSuites, setSyncConfigSuites] = useState([]);
  const [jiraBaseUrl, setJiraBaseUrl] = useState('https://baseball.atlassian.net');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [executeEnv, setExecuteEnv] = useState('beta'); // qa | beta - used when clicking Execute
  // Match config/env.js + local `npm run test:webtv`: headed by default (headless often breaks WebTV/video).
  const [executeHeadless, setExecuteHeadless] = useState(false);
  const [executeRecordVideo, setExecuteRecordVideo] = useState(false); // wdio-video-reporter (default off)
  const [executeUseSauce, setExecuteUseSauce] = useState(false); // Sauce Labs remote run (no local video)
  const [sauceConfigured, setSauceConfigured] = useState(false);
  const [executeHighlight, setExecuteHighlight] = useState(false); // HIGHLIGHT_ELEMENTS=1 when On (default off = faster)
  const [executeParallel, setExecuteParallel] = useState(false); // multi-scenario suite runs only (WDIO_MAX_INSTANCES)
  const [executeParallelWorkers, setExecuteParallelWorkers] = useState(4);
  const [executeBrowser, setExecuteBrowser] = useState('chrome'); // chrome | firefox | safari
  const [runs, setRuns] = useState([]);
  const [failedScenariosRunId, setFailedScenariosRunId] = useState(null);
  const [executeResults, setExecuteResults] = useState({});
  const [fixStatus, setFixStatus] = useState(null);
  const [automateStatus, setAutomateStatus] = useState(null);
  const [restartStatus, setRestartStatus] = useState(null);
  const [ragRefreshLoading, setRagRefreshLoading] = useState(false);
  const [scenarioSearch, setScenarioSearch] = useState('');
  const [reportExists, setReportExists] = useState(false);
  const [reportPdfExists, setReportPdfExists] = useState(false);

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch(`${API}/sync`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncMessage('Sync complete. Refreshing...');
        setTimeout(() => fetchAll(), 2000);
      } else {
        setSyncMessage(data.error || 'Sync failed');
      }
    } catch (e) {
      setSyncMessage(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function fetchAll() {
    setLoading(true);
    setError(null);
    const projectParam = `&project=${encodeURIComponent(selectedProject || 'all')}`;
    try {
        const [projData, m, t, f, a, s, c, runsData, execData, reportStatus, sauceStatus] = await Promise.all([
          fetchJson(`${API}/projects`),
          fetchJson(`${API}/metrics?project=${selectedProject || 'all'}`),
          fetchJson(`${API}/trends?limit=30${projectParam}`),
          fetchJson(`${API}/flaky?lastN=20${projectParam}`),
          fetchJson(`${API}/automation?project=${selectedProject || 'all'}`),
          fetchJson(`${API}/suites?project=${selectedProject || 'all'}`),
          fetchJson(`${API}/sync-config`),
          fetchJson(`${API}/runs?limit=30${projectParam}`),
          fetchJson(`${API}/execute-results`),
          fetch(`${API}/report/status`).then((r) => r.json()).catch(() => ({ exists: false })),
          fetch(`${API}/sauce/status`)
            .then((r) => (r.ok ? r.json() : { configured: false }))
            .catch(() => ({ configured: false })),
        ]);
        setProjects((projData && projData.projects) || []);
        setMetrics(m);
        setTrends((t && t.trends) || []);
        setFlaky((f && f.flaky) || []);
        setAutomation(a || {});
        setSuites((s && s.suites) || []);
        setSyncConfigSuites((c && c.suites) || []);
        setJiraBaseUrl((c && c.jiraBaseUrl) || 'https://baseball.atlassian.net');
        setRuns((runsData && runsData.runs) || []);
        setExecuteResults(execData || {});
        setReportExists(reportStatus?.exists ?? false);
        setReportPdfExists(reportStatus?.pdfExists ?? false);
        setSauceConfigured(!!sauceStatus?.configured);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 5000); // Poll every 5s to pick up new runs after test completion
    return () => clearInterval(id);
  }, [selectedProject]);

  useEffect(() => {
    if (!sauceConfigured && executeUseSauce) setExecuteUseSauce(false);
  }, [sauceConfigured, executeUseSauce]);

  // Clear run selection when selected run is no longer in the list (e.g. after Refresh vector DB)
  useEffect(() => {
    if (!failedScenariosRunId) return;
    const runsWithFailures = (runs || []).filter((r) => (r.failedScenarios?.length || 0) > 0);
    const found = runsWithFailures.some((r) => r.id === failedScenariosRunId);
    if (!found) setFailedScenariosRunId(null);
  }, [runs, failedScenariosRunId]);

  useEffect(() => {
    const pollFix = async () => {
      try {
        const data = await fetchJson(`${API}/fix/status`);
        setFixStatus(data);
      } catch (_) {}
    };
    pollFix();
    const id = setInterval(pollFix, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const pollAutomate = async () => {
      try {
        const data = await fetchJson(`${API}/automate/status`);
        setAutomateStatus(data);
      } catch (_) {}
    };
    pollAutomate();
    const id = setInterval(pollAutomate, 2000);
    return () => clearInterval(id);
  }, []);

  async function handleFixStart(suite, key) {
    try {
      await fetch(`${API}/fix/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suite,
          key,
          env: executeEnv,
          headless: executeHeadless,
          browser: executeBrowser,
          highlightElements: executeHighlight,
          useSauce: executeUseSauce,
        }),
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function handleFixStop() {
    try {
      await fetch(`${API}/fix/stop`, { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  }

  if (loading && !metrics) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[var(--muted)]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">QA Dashboard</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Charts, trends, and flaky detection for unified QA platform
            </p>
          </div>
          <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
            <span className="px-2 py-1 text-xs text-[var(--muted)]">Execute on</span>
            <button
              onClick={() => setExecuteEnv('qa')}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${executeEnv === 'qa' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'}`}
            >
              QA
            </button>
            <button
              onClick={() => setExecuteEnv('beta')}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${executeEnv === 'beta' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'}`}
            >
              Beta
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
            <span className="px-2 py-1 text-xs text-[var(--muted)]">Browser</span>
            <button
              onClick={() => setExecuteBrowser('chrome')}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${executeBrowser === 'chrome' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'}`}
              title="Run tests in Chrome"
            >
              Chrome
            </button>
            <button
              onClick={() => setExecuteBrowser('firefox')}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${executeBrowser === 'firefox' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'}`}
              title="Run tests in Firefox"
            >
              Firefox
            </button>
            <button
              onClick={() => setExecuteBrowser('safari')}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${executeBrowser === 'safari' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'}`}
              title="Run tests in Safari (macOS only, no headless)"
            >
              Safari
            </button>
            <button
              onClick={() => setExecuteBrowser('edge')}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${executeBrowser === 'edge' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'}`}
              title="Run tests in Microsoft Edge"
            >
              Edge
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
            <span className="px-2 py-1 text-xs text-[var(--muted)]">Display</span>
            <button
              onClick={() => setExecuteHeadless(true)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${executeHeadless ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'}`}
              title="Run tests without opening a visible browser window (default)"
            >
              Headless
            </button>
            <button
              onClick={() => setExecuteHeadless(false)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${!executeHeadless ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'}`}
              title="Run tests with a visible browser window"
            >
              Headed
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
            <span className="px-2 py-1 text-xs text-[var(--muted)]">Sauce</span>
            <button
              type="button"
              onClick={() => setExecuteUseSauce(false)}
              disabled={!sauceConfigured}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${!executeUseSauce ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'} disabled:opacity-40 disabled:cursor-not-allowed`}
              title={
                sauceConfigured
                  ? 'Run on local machine or CI browser (default)'
                  : 'Set SAUCE_USERNAME and SAUCE_ACCESS_KEY in .env and restart dashboard'
              }
            >
              Off
            </button>
            <button
              type="button"
              onClick={() => {
                setExecuteUseSauce(true);
                setExecuteRecordVideo(false);
              }}
              disabled={!sauceConfigured}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${executeUseSauce ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'} disabled:opacity-40 disabled:cursor-not-allowed`}
              title={
                sauceConfigured
                  ? 'Run on Sauce Labs; link to job appears per scenario (no local MP4)'
                  : 'Set SAUCE_USERNAME and SAUCE_ACCESS_KEY in .env and restart dashboard'
              }
            >
              On
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
            <span className="px-2 py-1 text-xs text-[var(--muted)]">Record</span>
            <button
              type="button"
              onClick={() => setExecuteRecordVideo(false)}
              disabled={executeUseSauce}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${!executeRecordVideo ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'} disabled:opacity-40 disabled:cursor-not-allowed`}
              title={
                executeUseSauce
                  ? 'Local video is not used when running on Sauce (use Sauce job link per scenario)'
                  : 'Do not capture screen recordings (default, faster)'
              }
            >
              Off
            </button>
            <button
              type="button"
              onClick={() => setExecuteRecordVideo(true)}
              disabled={executeUseSauce}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${executeRecordVideo ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'} disabled:opacity-40 disabled:cursor-not-allowed`}
              title={
                executeUseSauce
                  ? 'Local video is not used when running on Sauce (use Sauce job link per scenario)'
                  : 'Save MP4 per scenario (wdio-video-reporter); shown under each scenario when done'
              }
            >
              On
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
            <span className="px-2 py-1 text-xs text-[var(--muted)]">Highlight</span>
            <button
              type="button"
              onClick={() => setExecuteHighlight(false)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${!executeHighlight ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'}`}
              title="Default: no element outline or extra delay (faster)"
            >
              Off
            </button>
            <button
              type="button"
              onClick={() => setExecuteHighlight(true)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${executeHighlight ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'}`}
              title="Red outline + delay before clicks/typing (HIGHLIGHT_ELEMENTS=1)"
            >
              On
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
            <span className="px-2 py-1 text-xs text-[var(--muted)]">Parallel</span>
            <button
              type="button"
              onClick={() => setExecuteParallel(false)}
              disabled={executeBrowser === 'safari'}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${!executeParallel ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'} disabled:opacity-40 disabled:cursor-not-allowed`}
              title="Run suite tests one WDIO worker at a time (default)"
            >
              Off
            </button>
            <button
              type="button"
              onClick={() => setExecuteParallel(true)}
              disabled={executeBrowser === 'safari'}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${executeParallel ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20'} disabled:opacity-40 disabled:cursor-not-allowed`}
              title={
                executeBrowser === 'safari'
                  ? 'Safari is limited to 1 worker'
                  : 'Run selected / all automated with multiple browsers (WDIO_MAX_INSTANCES). Best when scenarios live in different .feature files.'
              }
            >
              On
            </button>
            <label className="flex items-center gap-1 px-1 text-xs text-[var(--muted)]">
              <span>Workers</span>
              <select
                value={executeParallelWorkers}
                onChange={(e) => setExecuteParallelWorkers(Number(e.target.value))}
                disabled={!executeParallel || executeBrowser === 'safari'}
                className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs text-[var(--text)] disabled:opacity-40"
                title="Max parallel WebdriverIO workers (capped at 16)"
              >
                <option value={2}>2</option>
                <option value={4}>4</option>
                <option value={6}>6</option>
                <option value={8}>8</option>
              </select>
            </label>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-black/30 disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync from Xray'}
          </button>
          <button
            onClick={() => window.open((API || '').replace(/\/api\/?$/, '') + '/report', '_blank')}
            disabled={!reportExists}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-black/30 disabled:opacity-50 disabled:cursor-not-allowed"
            title={reportExists ? 'Open WebTv Test Report' : 'Run tests first to generate report'}
          >
            WebTv Report
          </button>
          <button
            onClick={() => window.open((API || '').replace(/\/api\/?$/, '') + '/report/cucumber-report.pdf', '_blank')}
            disabled={!reportPdfExists}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-black/30 disabled:opacity-50 disabled:cursor-not-allowed"
            title={reportPdfExists ? 'Open Cucumber PDF report' : 'PDF is created after tests if Puppeteer is installed'}
          >
            Open PDF
          </button>
          <button
            onClick={async () => {
              setRagRefreshLoading(true);
              try {
                const res = await fetch(`${API}/rag/refresh`, { method: 'POST' });
                const data = await res.json();
                if (res.ok && data.success) {
                  await fetchAll();
                  const msg = data.removedFromRuns > 0
                    ? `RAG, failure data, and ${data.removedFromRuns} failed scenario(s) from runs wiped.`
                    : 'RAG vector DB and failure data wiped.';
                  alert(msg);
                } else {
                  alert(data.error || 'Refresh failed');
                }
              } catch (e) {
                alert(e.message || 'Refresh failed');
              } finally {
                setRagRefreshLoading(false);
              }
            }}
            disabled={ragRefreshLoading}
            className="rounded-lg border border-[var(--warning)]/50 bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--warning)] hover:bg-[var(--warning)]/10 disabled:opacity-50"
            title="Wipe RAG memory (.rag-memory.json), failure-screenshots.json, failure-dom.json, and screenshot files. Use when delete only clears UI."
          >
            {ragRefreshLoading ? 'Wiping…' : 'Refresh vector DB'}
          </button>
          <button
            onClick={async () => {
              setRestartStatus('restarting');
              try {
                await fetch(`${API}/restart`, { method: 'POST' });
              } catch (_) {}
              const pollUntilBack = async () => {
                // Phase 1: wait for server to go down (fetch fails)
                for (let i = 0; i < 15; i++) {
                  await new Promise((r) => setTimeout(r, 500));
                  try {
                    await fetch(`${API}/metrics`);
                  } catch (_) {
                    break; // server is down, proceed to phase 2
                  }
                }
                // Phase 2: poll until server is back online
                for (let i = 0; i < 40; i++) {
                  await new Promise((r) => setTimeout(r, 500));
                  try {
                    const res = await fetch(`${API}/metrics`);
                    if (res.ok) {
                      setRestartStatus('back');
                      fetchAll();
                      setTimeout(() => {
                        setRestartStatus(null);
                        window.location.reload();
                      }, 1500);
                      return;
                    }
                  } catch (_) {}
                }
                setRestartStatus(null);
              };
              pollUntilBack();
            }}
            disabled={restartStatus === 'restarting'}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-black/30 hover:text-[var(--text)] disabled:opacity-50 disabled:cursor-not-allowed"
            title="Rebuild dashboard frontend, then restart server"
          >
            {restartStatus === 'restarting' ? 'Rebuilding & restarting…' : restartStatus === 'back' ? '✓ Back online' : 'Rebuild & restart'}
          </button>
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
          <button
            onClick={() => setSelectedProject('all')}
            className={`rounded px-3 py-2 text-sm font-medium transition-colors ${selectedProject === 'all' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20 hover:text-[var(--text)]'}`}
          >
            All
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProject(p.id)}
              className={`rounded px-3 py-2 text-sm font-medium transition-colors ${selectedProject === p.id ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:bg-black/20 hover:text-[var(--text)]'}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </header>

      {syncMessage && (
        <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
          {syncMessage}
        </div>
      )}

      {restartStatus === 'restarting' && (
        <div className="mb-6 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-4 py-3 text-sm text-[var(--accent)]">
          Rebuilding dashboard, then restarting server… Page will refresh when ready.
        </div>
      )}
      {restartStatus === 'back' && (
        <div className="mb-6 rounded-lg border border-[var(--success)]/50 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
          Server restarted successfully.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-[var(--danger)] bg-[var(--danger)]/10 px-4 py-3 text-sm">
          API error: {error}. Ensure the dashboard server is running on port 4000.
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
          Automation Coverage{selectedProject !== 'all' ? ` — ${projects.find((p) => p.id === selectedProject)?.name || selectedProject}` : ''}
        </h2>
        <AutomationCoverage data={automation} />
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
          Test Scenarios by Suite
        </h2>
        <div className="mb-4 flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by key (e.g. 35, 67) or summary (e.g. login, smoke)..."
            value={scenarioSearch}
            onChange={(e) => setScenarioSearch(e.target.value)}
            className="min-w-[280px] rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
          />
          {scenarioSearch && (
            <button
              type="button"
              onClick={() => setScenarioSearch('')}
              className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
            >
              Clear
            </button>
          )}
        </div>
        <div className="space-y-8">
          {suites.map((suite) => (
            <ScenarioList
              key={suite.name}
              scenarios={suite.scenarios}
              title={suite.displayName || suite.name}
              suiteName={syncConfigSuites.includes(suite.name) ? suite.name : null}
              suiteId={suite.name}
              jiraBaseUrl={jiraBaseUrl}
              onRefresh={fetchAll}
              env={executeEnv}
              headless={executeHeadless}
              browser={executeBrowser}
              recordVideo={executeRecordVideo}
              useSauce={executeUseSauce}
              highlightElements={executeHighlight}
              parallel={executeParallel}
              parallelWorkers={executeParallelWorkers}
              executeResults={executeResults}
              fixStatus={fixStatus}
              onFixStart={handleFixStart}
              onFixStop={handleFixStop}
              automateStatus={automateStatus}
              searchQuery={scenarioSearch}
            />
          ))}
          {suites.length === 0 && (
            <div className="rounded-lg bg-[var(--surface)] p-6 text-center text-[var(--muted)]">
              No suites in testcase/. Add folders (e.g. webTv, optools) and sync from Xray.
            </div>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
          Latest Run
        </h2>
        <Metrics
          data={metrics}
          runs={runs}
          failedScenariosRunId={failedScenariosRunId}
          setFailedScenariosRunId={setFailedScenariosRunId}
          onRefresh={fetchAll}
          fixStatus={fixStatus}
          onFixStart={handleFixStart}
          onFixStop={handleFixStop}
          executeEnv={executeEnv}
        />
      </section>

      <section className="mb-8">
        <TrendsChart data={trends} />
      </section>

      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
          Flaky Detection
        </h2>
        <FlakyTable data={flaky} />
      </section>
    </div>
  );
}

export default App;
