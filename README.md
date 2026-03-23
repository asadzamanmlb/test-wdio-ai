# Unified AI QA Platform

Includes:
- Xray → WDIO generator
- Self-healing: on element-not-found during WebTV tests, captures real-time DOM, parses with Cheerio, and suggests alternative selectors (id, data-testid, aria-label, text locators) in `.selfheal-report.json`
- Multi-agent system
- **Dashboard (React + API)**: Charts, trends, flaky detection. Run `npm run dashboard` then open http://localhost:4000. **Login is required** by default: first **Sign up** becomes an **admin** (all suites: WebTV, Optools, Core App). Admins open **Admin** to create users and assign **suite access** (e.g. only `webTv` → user sees only that project). Set `DASHBOARD_AUTH_DISABLED=1` in `.env` to turn auth off for local dev. Use **Stop test** in the header to kill the current WDIO run.
- RAG memory: TF-IDF search (built-in) + optional OpenAI embeddings for similar-fix retrieval. **Domain/product context** is seeded from `rag/domain-knowledge.json` (merged into search; **not** removed by dashboard **RAG refresh**, which only clears `.rag-memory.json`). Human-readable notes: `docs/webtv-domain-context.md`.

## Run

```bash
npm install
node platform.js
```

## WebTV Login Test (WSTE-35, WSTE-36)

Steps adapted from webTv-temp: Okta selectors, BETA pre-auth, cookie consent, logout.

```bash
# Set credentials in .env:
# TEST_EMAIL=your_email@example.com
# TEST_PASSWORD=your_password
# BETA_USERNAME, BETA_PASSWORD (optional, for BETA pre-auth form)

# Default: BETA, headed (no HEADLESS)
npm run test:webtv

# QA when needed
npm run test:webtv:qa

# Explicit beta / headless
npm run test:webtv:beta
npm run test:webtv:headless

# Local parallel workers (multiple .feature files can run at once; default is 1)
# Safari always uses 1 worker. Cap: 16.
WDIO_MAX_INSTANCES=4 npm run test:webtv
# or
npm run test:webtv:parallel
```

**QA Dashboard:** use header **Parallel → On** and **Workers** (2–8) for **Run selected** / **Run all** — the API sets `WDIO_MAX_INSTANCES` for that run. Single-scenario **Execute** always uses 1 worker.

## Dockerized test grid (parallel runs)

Selenium Grid 4 with 4 Chrome nodes for parallel test execution.

```bash
# Start Docker first (Colima or Docker Desktop)
npm run docker:start           # Colima
npm run docker:start:desktop   # Docker Desktop

# Start the grid (4 Chrome nodes)
npm run grid:up

# Run tests in parallel against the grid
npm run test:grid        # or test:grid:qa / test:grid:beta

# Stop the grid
npm run grid:down

# Or run full flow: up → test → down
npm run grid:run
```

| Script | Description |
|--------|-------------|
| `docker:start` | Start Colima |
| `docker:start:desktop` | Start Docker Desktop |
| `grid:up` | Start Selenium Grid (4 Chrome nodes) |
| `grid:down` | Stop the grid |
| `grid:logs` | Tail grid logs |
| `grid:run` | Full flow: grid up → tests → grid down |
| `test:grid` | Run tests in parallel (QA env) |

Grid UI: http://localhost:4444

## Sauce Labs (cloud browsers)

Runs the same Cucumber features on Sauce Labs VMs (no local Chrome). Set credentials either in `.env` **or** export them in your shell profile (`~/.zshrc` / `~/.bash_profile`):

```bash
export SAUCE_USERNAME=your_username
export SAUCE_ACCESS_KEY=your_access_key
```

If both are set, **environment variables take precedence** over `.env` (dotenv does not override them).

**Check credentials (no tests run):**

```bash
npm run sauce:auth
```

```bash
npm run test:sauce:qa      # ENV=qa
npm run test:sauce:beta    # ENV=beta
npm run test:sauce         # uses ENV from .env / default

# One feature only
npx wdio run wdio.sauce.conf.js --spec features/webtv/media-center.feature

# Login scenarios only (WSTE-35 / WSTE-36)
npm run test:sauce:login        # QA
npm run test:sauce:login:beta   # Beta
```

Optional: `SAUCE_WDIO_REGION` (`us` | `eu`; legacy `SAUCE_REGION=eu-central-1` maps to `eu`), `SAUCE_PLATFORM`, `SAUCE_BROWSER`, `DEVICE` / `SAUCE_DEVICE_LABEL` (job name prefix), `SAUCE_CAPTURE_PERFORMANCE=1`, `SAUCE_CONNECT=1` (Sauce Connect tunnel — default off for public QA URLs). See `wdio.sauce.conf.js` header.

After a Sauce run finishes, the job URL is printed in the terminal (and listed again at the very end). URLs are also saved under `reports/sauce-jobs.txt` (gitignored with `reports/`).

**Run tests in Docker** (tests run in a container, grid on host):

```bash
npm run grid:up
docker build -f Dockerfile.test -t qa-tests .
docker run --rm --network host -e ENV=qa qa-tests
```

Override grid host when tests run in a different network: `SELENIUM_HOST=selenium-router npm run test:grid`

> If `docker compose` fails, use `docker-compose` (standalone binary). The scripts use `docker-compose`.

## QA Dashboard

Charts, trends, and flaky detection for test runs.

```bash
# Build the React UI (once)
npm run dashboard:build

# Start dashboard server
npm run dashboard
```

Open http://localhost:4000

- **Latest run**: Pass/fail/skip counts, pass rate, breakdown by feature
- **Trends**: Pass rate over last 30 runs
- **Flaky detection**: Scenarios that pass and fail across runs (last 20 runs)

Run `npm run test:webtv:qa` to populate data; results are persisted to `dashboard/data/runs.json`.

## Xray Test Cases

Test cases are exported from Jira Xray into JSON under `testcase/`.

| Source | Folder | Tests | Format |
|--------|--------|-------|--------|
| WSTE-796 (WebTV Post Release) | `testcase/webTv/` | 26 | Gherkin (Cucumber) |
| WQO-1147 (Optools Post Release) | `testcase/optools/` | 80 | Gherkin (converted from Manual) |

### Sync all from Xray

```bash
# Sync all folders (fetches from Xray + converts to Cucumber)
npm run sync:xray
```

Config: `testcase/sync-config.json` maps folder → Xray issue key:
```json
{
  "webTv": "WSTE-796",
  "optools": "WQO-1147"
}
```

### Manual commands

```bash
# List test cases for an execution
npm run xray WSTE-796

# Export single folder
npm run xray:export WSTE-796 webTv

# Convert Manual → Cucumber for a folder
npm run optools:convert optools
```

### JSON format

Each test case (`testcase/<folder>/<KEY>.json`) contains:

- `id`, `key`, `summary`, `description`, `status`, `testType`
- **Gherkin:** `gherkin` field with Given/When/Then
- **Optools:** Convert Manual steps to Gherkin with `npm run optools:convert`
