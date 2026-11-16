# ProjectGuard AI

**Monitor. Predict. Act.**

ProjectGuard AI is a student-friendly construction project monitoring prototype for the SIH26103 web-based integrated project-monitoring use case. It adds explainable prioritization and early-warning indicators around project records; it does not replace PAIMANA or any source system.

> **Demo mode:** The built-in portfolio is synthetic demonstration data, not official MoSPI data or live PAIMANA records. The risk engine is a transparent rule-based prototype, not a trained machine-learning model. Its weights and thresholds are assumptions, not official standards.

## Features

- Login and registration for demo accounts (scrypt password hashing and expiring HttpOnly sessions).
- Construction portfolio dashboard with risk, physical/financial progress, delay, alert, and data-quality summaries.
- Project search, filters, sorting, details, construction fields, and retained progress history.
- Backend-validated progress updates, recalculated risk, structured risk drivers, and deduplicated open alerts.
- CSV/JSON import preview with row-level validation, duplicate-ID checks, warnings, and valid-row import.
- Downloadable CSV template and safe restoration of missing synthetic demo records.
- Local JSON file persistence with atomic writes and backward-compatible project normalization.
- Supabase PostgreSQL persistence for Vercel deployments.

## Technology

- Frontend: React 18, Vite, JavaScript/JSX, CSS, Fetch API.
- Backend: Node.js ES modules, Express, CORS.
- Local storage: `backend/data/store.json`.
- Hosted storage: Supabase PostgreSQL through the server-side REST API.
- No added runtime framework or third-party dependency is needed for the listed features.

## Folder structure

```text
backend/
  data/store.json
  supabase/schema.sql
  src/
    authService.js
    importService.js
    projectData.js
    riskEngine.js
    server.js
    store.js
  test/
frontend/
  src/
    components/AuthPage.jsx
    App.jsx
    api.js
    styles.css
```

Vercel's service/rewrite configuration is in `vercel.json`.

## Run locally

In separate terminals:

```bash
cd backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API listens at [http://localhost:4000](http://localhost:4000). The first account can be registered through the app; all accounts currently share the same local demo portfolio.

To keep data somewhere else, start the backend with `PROJECTGUARD_DATA_FILE=/absolute/path/store.json`. The parent directory is created if needed. Do not point multiple backend processes at the same JSON file; JSON storage is for a single local prototype process.

## Configure persistent storage on Vercel

Vercel's function filesystem is not a persistent data store. For hosted accounts and project changes, configure Supabase before using the live app:

1. Create a Supabase project.
2. In its SQL Editor, run [`backend/supabase/schema.sql`](backend/supabase/schema.sql).
3. In the Vercel project settings, add these environment variables for Production (and Preview if needed):
   - `SUPABASE_URL`: the Supabase project's API URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: the server-only service role key from the Supabase API settings.
4. Redeploy the Vercel project.

Keep the service role key private: add it only as a Vercel server-side environment variable. Never put it in frontend environment variables, source control, or browser code. When deployed on Vercel without both variables, the API returns a configuration error rather than attempting to write under the deployed app directory. Local development continues to use the JSON file unless both Supabase variables are configured.

## Authentication limitations

Registration and login are demo account features, not government authentication. Passwords are stored as salted scrypt hashes; the browser receives an HttpOnly, SameSite session cookie whose token is stored hashed in the configured data store. Sessions expire after 12 hours. There is no email verification, password reset, account recovery, role authorization, rate limiting, or per-user project isolation. Do not use this prototype to protect sensitive data.

## Project data and CSV/JSON import

The project record includes core fields (`id`, `name`, `projectType`, department/agency, location/district/state, budget/spent, planned/actual/financial progress, start/end dates, status, milestones, update history) and optional construction fields (contractor, revised cost, delay days, land acquisition, tender, work order, inspection date, remarks).

Use **Data import** in the app to preview a `.csv` or `.json` file (2 MB maximum in the browser; 500 records per API import), review valid/warning/invalid rows, and import valid rows only. Duplicate IDs in the portfolio or within the file are invalid. JSON may be an array or `{ "projects": [...] }`. A sample CSV is available at `GET /api/import/sample-csv`; it contains synthetic example rows.

Invalid input is rejected by the backend. Missing optional data is surfaced as a quality warning; missing financial progress is estimated from expenditure and approved budget and explicitly reported as an estimate.

## API

All project, dashboard, alert, insight, and import operations require a signed-in session. `/api/health` and the authentication endpoints are public.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | Create a demo account and session |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/auth/me` | Read current account |
| POST | `/api/auth/logout` | Revoke session |
| GET | `/api/dashboard` | Portfolio summary and priority projects |
| GET | `/api/insights` | Risk causes and project-type analysis |
| GET | `/api/projects` | Risk-sorted project list |
| GET | `/api/projects/:id` | Project detail |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id/updates` | Project progress history |
| POST | `/api/projects/:id/updates` | Record update, recalculate risk, and upsert alert |
| GET | `/api/alerts` | List alerts (optional `level` and `state=open|reviewed` query) |
| PATCH | `/api/alerts/:id/read` | Mark alert reviewed |
| POST | `/api/import/preview` | Validate CSV/JSON content or records |
| POST | `/api/import/projects` | Import valid records |
| GET | `/api/import/sample-csv` | Download synthetic sample CSV |
| POST | `/api/demo/restore` | Restore missing synthetic sample records without replacing existing projects |

## Risk calculation

The backend-only rule engine calculates a 0–100 prototype score with these assumptions:

- Physical progress gap: 35%.
- Cost pressure (budget expenditure/financial progress): 25%.
- Schedule pressure: 25%.
- Delayed milestone ratio: 15%.
- Low: 0–30; Medium: 31–60; High: 61–100.

Structured driver messages and suggested review actions come from project values. Financial progress significantly ahead of physical progress is a review warning, not a claim of overrun or wrongdoing. Completed and cancelled projects have no active delivery risk score. These rules require review with field evidence and are not official MoSPI thresholds.

## Testing

```bash
cd backend
npm test
```

```bash
cd frontend
npm run build
```

Backend tests cover project validation, import parsing/validation, data quality, and risk calculations.

## Limitations and future ML

The project has no live PAIMANA/source-system integration, official project data, trained ML model, production identity service, or authenticated user-specific portfolio. ML integration is a future enhancement requiring authorized historical project data, defined labels, evaluation, and validation; no model is represented as currently deployed.
