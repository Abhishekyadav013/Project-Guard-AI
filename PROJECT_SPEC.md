# ProjectGuard AI Project Specification

## Product identity

- Name: ProjectGuard AI
- Tagline: Monitor. Predict. Act.
- Team: CyberSathi
- SIH problem statement: SIH26103 — web-based integrated project-monitoring platform use case.
- Purpose: help monitoring users find construction projects that need attention and see which data indicators explain that priority.

ProjectGuard AI is an analysis, prioritization, and early-warning layer around project information. It is not a PAIMANA replacement.

## Truthful demo positioning

The local portfolio records are synthetic construction demonstrations and are labelled in the UI as **Demo / Synthetic Construction Data**. They are not official or live government records. The engine is rule-based; there is no deployed or trained ML model. Prototype weights and bands are assumptions, not official MoSPI policy.

Authentication is also a prototype feature. Demo accounts use salted scrypt password hashes and expiring HttpOnly sessions, but users share a local portfolio. There is no production identity, role authorization, account recovery, email verification, or user-level record isolation.

## Architecture

```text
React/Vite dashboard
    ↓ same-origin /api proxy
Express API + session checks
    ↓
Project validation / import service / rule-based risk engine
    ↓                         ↓
Local atomic JSON store       Supabase PostgreSQL on Vercel
```

No separate ML service or external project data integration is connected.

## Construction record

Core fields:

- `id`, `name`, `projectType`, `department`, `implementingAgency`
- `location`, `district`, `state`
- `budget`, `spent`, `plannedProgress`, `actualProgress`, `financialProgress`
- `startDate`, `endDate`, `status`
- `totalMilestones`, `completedMilestones`, `delayedMilestones`
- `updatedAt`, `updates`

Construction details:

- `contractor`, `revisedCost`, `delayDays`
- `landAcquisitionStatus`, `tenderStatus`, `workOrderStatus`
- `lastInspectionDate`, `remarks`, `dataOrigin`

Project types are descriptive strings. The UI suggests common infrastructure categories but does not restrict new categories.

Statuses include Planned, Tendering, Awarded, Under Construction, Active, Delayed, On Hold, Completed, and Cancelled. Completed and Cancelled records are excluded from active delivery risk scoring.

## Risk engine

`backend/src/riskEngine.js` is the sole risk calculation implementation:

```text
Risk = progress gap × 35%
     + cost pressure × 25%
     + schedule gap × 25%
     + delayed milestone ratio × 15%
```

The result is bounded to 0–100. Bands are Low 0–30, Medium 31–60, and High 61–100. Structured drivers include a name, value, severity, and data-grounded message. Review recommendations are generated from those drivers. The financial-vs-physical variance is an indicator to verify figures, not a formal overrun finding.

## Workflow

1. Register/sign into the demo workspace.
2. Review portfolio cards and risk-sorted projects needing attention.
3. Filter/search projects or open construction details and data-quality checks.
4. Record dated physical/financial progress, expenditure, milestone, status, and remarks.
5. Backend validation preserves the update history and recalculates risk.
6. A single open alert per project is updated when elevated risk persists; review state is retained.
7. Preview CSV/JSON imports, fix invalid records, and import the valid rows.

## Import contract

CSV uses a header row and standard double-quote escaping. JSON accepts an array or `{ "projects": [...] }`. Imports are limited to 500 records and 5 MB at the API boundary. Required project measurements and dates are checked server-side; duplicate IDs are reported before import. Invalid rows are skipped when the user imports valid rows. Missing optional fields are quality warnings.

## APIs

Public: `GET /api/health`, `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`.

Authenticated: `GET /api/dashboard`, `GET /api/insights`, `GET /api/projects`, `GET /api/projects/:id`, `POST /api/projects`, `GET /api/projects/:id/updates`, `POST /api/projects/:id/updates`, `GET /api/alerts`, `PATCH /api/alerts/:id/read`, `POST /api/import/preview`, `POST /api/import/projects`, `GET /api/import/sample-csv`, `POST /api/demo/restore`.

## Persistence

Local development stores projects, alerts, demo users, and hashed session records in `backend/data/store.json`. Writes use temporary files plus rename. Existing project/alert records are normalized when read; malformed JSON or invalid top-level structure causes an explicit error and is not silently replaced. `PROJECTGUARD_DATA_FILE` can select an alternate absolute path for local tests or demos.

Vercel uses the Supabase table defined in `backend/supabase/schema.sql`. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as server-side environment variables in Vercel; the service role key must never be exposed to the frontend. Hosted requests fail explicitly if storage is not configured instead of writing to Vercel's temporary function filesystem. Local development continues to use JSON unless both Supabase variables are set.

The local JSON store is for a single prototype process, not concurrent production deployment. Supabase provides durable persistence but does not add production identity features or per-user data isolation.

## Run and validate

Start backend and frontend in separate terminals:

```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

Checks:

```bash
cd backend && npm test
cd frontend && npm run build
```

## Known limitations

- No live PAIMANA, MoSPI, or other official data feed.
- Synthetic data exists only for demonstration.
- No trained/evaluated ML predictor.
- Demo users share data and roles are UI-only.
- No production-grade authentication controls (rate limiting, account verification/recovery, authorization policy).
- Local JSON storage is not a concurrent multi-instance database.
- Risk thresholds and weights need domain validation before operational decisions.
