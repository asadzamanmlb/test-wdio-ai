import { useEffect, useState } from 'react';
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
  BarChart,
  Bar,
} from 'recharts';

const API = '/api';

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

function Metrics({ data }) {
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

function AutomationCoverage({ data }) {
  if (!data) return null;

  const { optools, webTv, totalAutomated, totalManual, total } = data;
  const barData = [
    { name: 'Optools', automated: optools?.automated ?? 0, manual: optools?.manual ?? 0, total: optools?.total ?? 0 },
    { name: 'WebTV', automated: webTv?.automated ?? 0, manual: webTv?.manual ?? 0, total: webTv?.total ?? 0 },
  ].filter((d) => d.total > 0);

  if (barData.length === 0) {
    return (
      <div className="rounded-lg bg-[var(--surface)] p-6 text-center text-[var(--muted)]">
        No test case data in testcase/optools or testcase/webTv
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Optools Automated" value={optools?.automated ?? 0} sub={`of ${optools?.total ?? 0} total`} variant="success" />
        <Card title="Optools Manual" value={optools?.manual ?? 0} sub={`of ${optools?.total ?? 0} total`} variant="default" />
        <Card title="WebTV Automated" value={webTv?.automated ?? 0} sub={`of ${webTv?.total ?? 0} total`} variant="success" />
        <Card title="WebTV Manual" value={webTv?.manual ?? 0} sub={`of ${webTv?.total ?? 0} total`} variant="default" />
      </div>
      <div className="rounded-lg bg-[var(--surface)] p-4">
        <h4 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--muted)]">Automated vs Manual by Suite</h4>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
            <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={55} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}
              formatter={(value, name) => [value, name === 'automated' ? 'Automated' : 'Manual']}
            />
            <Bar dataKey="automated" fill="var(--success)" name="automated" stackId="a" />
            <Bar dataKey="manual" fill="var(--border)" name="manual" stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>
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
  const [metrics, setMetrics] = useState(null);
  const [trends, setTrends] = useState([]);
  const [flaky, setFlaky] = useState([]);
  const [automation, setAutomation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const [mRes, tRes, fRes, aRes] = await Promise.all([
          fetch(`${API}/metrics`),
          fetch(`${API}/trends?limit=30`),
          fetch(`${API}/flaky?lastN=20`),
          fetch(`${API}/automation`),
        ]);
        if (!mRes.ok) throw new Error('Metrics failed');
        const m = await mRes.json();
        const t = await tRes.json();
        const f = await fRes.json();
        const a = await aRes.json();
        setMetrics(m);
        setTrends(t.trends || []);
        setFlaky(f.flaky || []);
        setAutomation(a);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
    const id = setInterval(fetchAll, 15000);
    return () => clearInterval(id);
  }, []);

  if (loading && !metrics) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[var(--muted)]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--text)]">QA Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Charts, trends, and flaky detection for unified QA platform
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-[var(--danger)] bg-[var(--danger)]/10 px-4 py-3 text-sm">
          API error: {error}. Ensure the dashboard server is running on port 4000.
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
          Automation Coverage (Optools & WebTV)
        </h2>
        <AutomationCoverage data={automation} />
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--muted)]">
          Latest Run
        </h2>
        <Metrics data={metrics} />
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
