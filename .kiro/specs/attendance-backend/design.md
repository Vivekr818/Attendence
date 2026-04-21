# Design Document

## Overview

This document describes the technical design for adding a Node.js/Express backend to the attendance application. The backend connects to a PostgreSQL database on Neon, exposes REST endpoints for students, attendance submission, and history retrieval, and the existing `attendance.html` frontend is updated to consume those endpoints.

---

## Architecture

```
Browser (attendance.html)
        │
        │  HTTP (REST JSON)
        ▼
  Express Server (server.js)
        │
        │  pg (node-postgres)
        ▼
  PostgreSQL on Neon
```

The project is intentionally flat — no build step, no ORM, no framework beyond Express.

### File Structure

```
attendance-backend/
├── server.js          # Express app entry point
├── db.js              # pg Pool singleton
├── routes/
│   ├── students.js    # GET /api/students
│   └── attendance.js  # POST /api/attendance, GET /api/attendance
├── schema.sql         # Manual migration — run once against Neon
├── attendance.html    # Existing frontend (updated)
├── .env               # Local env vars (gitignored)
├── package.json
└── README.md
```

---

## Database Schema (`schema.sql`)

The schema is applied manually by the developer:

```sql
-- Run once: psql $DATABASE_URL -f schema.sql

CREATE TABLE IF NOT EXISTS students (
  roll TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

INSERT INTO students (roll, name) VALUES
  ('CS001', 'Aarav Sharma'),
  ('CS002', 'Priya Nair'),
  ('CS003', 'Rahul Verma'),
  ('CS004', 'Sneha Reddy'),
  ('CS005', 'Karan Mehta'),
  ('CS006', 'Divya Pillai'),
  ('CS007', 'Rohit Gupta'),
  ('CS008', 'Ananya Iyer'),
  ('CS009', 'Vikram Joshi'),
  ('CS010', 'Meera Patel'),
  ('CS011', 'Arjun Das'),
  ('CS012', 'Lakshmi Rao'),
  ('CS013', 'Siddharth Bose'),
  ('CS014', 'Pooja Singh'),
  ('CS015', 'Nikhil Kulkarni')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id           SERIAL PRIMARY KEY,
  submitted_at TIMESTAMPTZ NOT NULL,
  date         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id         SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  roll       TEXT NOT NULL,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('present', 'absent', 'unmarked')),
  marked_at  TEXT,
  note       TEXT
);
```

The server does **not** run any DDL on startup.

---

## Backend Components

### `db.js` — Connection Pool

```js
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;
```

`server.js` calls `pool.query('SELECT 1')` at startup to verify connectivity and exits with code 1 if it fails.

---

### `server.js` — Entry Point

Responsibilities:
- Load `.env` via `dotenv`
- Validate `DATABASE_URL` is set; exit with error if missing
- Mount `express.json()` middleware
- Mount CORS middleware when `CORS_ORIGIN` env var is set
- Serve `attendance.html` as a static file at `GET /`
- Mount route modules under `/api`
- 404 catch-all for unmatched routes
- Verify DB connection before calling `app.listen`

---

### `routes/students.js` — `GET /api/students`

```
GET /api/students
→ 200  [{ roll, name }, ...]
→ 500  { error: "..." }
```

Query: `SELECT roll, name FROM students ORDER BY roll ASC`

---

### `routes/attendance.js` — Submit & History

#### `POST /api/attendance`

Request body:
```json
{
  "submittedAt": "2025-01-15T09:30:00.000Z",
  "date": "1/15/2025",
  "records": [
    { "roll": "CS001", "name": "Aarav Sharma", "status": "present", "markedAt": "09:28:00", "note": "" }
  ]
}
```

Validation:
- `submittedAt`, `date`, `records` must be present → 400 if missing
- `records` must be a non-empty array → 400 if empty

On success:
1. `BEGIN` transaction
2. `INSERT INTO attendance_sessions` → get `session_id`
3. Bulk `INSERT INTO attendance_records` for all records
4. `COMMIT`
5. Respond `201 { id, submittedAt }`

On DB error: `ROLLBACK`, respond `500 { error }`.

#### `GET /api/attendance`

```
GET /api/attendance
→ 200  [{ id, submittedAt, date, records: [...] }, ...]   (max 20, newest first)
→ 500  { error: "..." }
```

Query strategy: fetch the 20 most recent sessions, then fetch all records for those session IDs in a single query, and assemble in JavaScript.

Response shape per session:
```json
{
  "id": 1,
  "submittedAt": "2025-01-15T09:30:00.000Z",
  "date": "1/15/2025",
  "records": [
    { "id": 1, "roll": "CS001", "name": "Aarav Sharma", "status": "present", "markedAt": "09:28:00", "note": "" }
  ]
}
```

---

## Frontend Changes (`attendance.html`)

### Remove

- The hardcoded `students` array
- All `window.storage.get` / `window.storage.set` / `window.storage.delete` calls
- The `clearHistory()` function
- The "Clear all" `<button class="clear-history">` element

### Add / Update

#### Page load sequence

```js
async function init() {
  await loadStudents();  // fetch GET /api/students, build state map, render table
  await loadHistory();   // fetch GET /api/attendance, render history panel
}
```

#### `loadStudents()`

```js
async function loadStudents() {
  const res = await fetch('/api/students');
  if (!res.ok) {
    // show error, disable submit button
    return;
  }
  students = await res.json();          // replaces hardcoded array
  students.forEach(s => state[s.roll] = { name: s.name, status: null, time: null, note: '' });
  renderTable();
}
```

#### `submitAttendance()` — updated

Replaces `window.storage` calls with:

```js
const res = await fetch('/api/attendance', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
if (!res.ok) {
  const err = await res.json();
  showToast(err.error || 'Submission failed');
  return;
}
showToast(`Submitted · ${p}P / ${a}A`);
loadHistory();
```

#### `loadHistory()` — updated

Replaces `window.storage.get` with:

```js
const res = await fetch('/api/attendance');
if (!res.ok) {
  list.innerHTML = '<div class="no-records">Failed to load history</div>';
  return;
}
const stored = await res.json();
```

---

## Environment Variables

| Variable       | Required | Default | Description                          |
|----------------|----------|---------|--------------------------------------|
| `DATABASE_URL` | Yes      | —       | Neon PostgreSQL connection string    |
| `PORT`         | No       | `3000`  | Port the Express server listens on   |
| `CORS_ORIGIN`  | No       | —       | Allowed CORS origin (e.g. `http://localhost:5500`) |

---

## Error Handling Summary

| Scenario                          | HTTP Status | Response body              |
|-----------------------------------|-------------|----------------------------|
| Missing required body fields      | 400         | `{ error: "..." }`         |
| Empty records array               | 400         | `{ error: "..." }`         |
| DB error on insert                | 500         | `{ error: "..." }`         |
| DB error on query                 | 500         | `{ error: "..." }`         |
| Unmatched route                   | 404         | `{ error: "Not found" }`   |
| Missing `DATABASE_URL` at startup | process exit 1 | stderr log              |

---

## Correctness Properties

### Property 1: Submit → Retrieve round-trip

For any valid attendance payload submitted via `POST /api/attendance`, a subsequent `GET /api/attendance` SHALL return a session whose `records` array contains every submitted record with identical `roll`, `name`, `status`, `markedAt`, and `note` values.

### Property 2: History cap invariant

Regardless of how many sessions are submitted, `GET /api/attendance` SHALL never return more than 20 sessions.

### Property 3: Student list stability

`GET /api/students` SHALL return the same set of students on every call (order by roll ascending), as the `students` table is populated once via `schema.sql` and has no mutation endpoint.

### Property 4: Transaction atomicity

IF a database error occurs after the `attendance_sessions` insert but before all `attendance_records` inserts complete, THEN THE Database SHALL contain no partial session — the transaction is rolled back in full.
