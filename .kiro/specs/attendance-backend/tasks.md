# Implementation Plan: Attendance Backend

## Overview

Implement a Node.js/Express backend for the attendance application, connecting to a PostgreSQL database on Neon, exposing REST API endpoints, and updating the existing `attendance.html` frontend to consume those endpoints.

## Tasks

- [x] 1. Set up project structure and dependencies
  - Create `attendance-backend/` directory with `package.json` declaring dependencies: `express`, `pg`, `dotenv`, and `cors`
  - Create `.env` file (gitignored) with placeholder `DATABASE_URL`, `PORT`, and `CORS_ORIGIN` variables
  - Create `.gitignore` excluding `node_modules/` and `.env`
  - _Requirements: 2.1, 2.2_

- [x] 2. Create the database schema file
  - [x] 2.1 Write `schema.sql` with all three table definitions
    - Define `students` table (`roll TEXT PRIMARY KEY`, `name TEXT NOT NULL`) with all 15 `INSERT` statements using `ON CONFLICT DO NOTHING`
    - Define `attendance_sessions` table (`id SERIAL PRIMARY KEY`, `submitted_at TIMESTAMPTZ NOT NULL`, `date TEXT NOT NULL`)
    - Define `attendance_records` table with `session_id` foreign key referencing `attendance_sessions(id) ON DELETE CASCADE` and `CHECK (status IN ('present', 'absent', 'unmarked'))`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 3. Implement the database connection module and server entry point
  - [x] 3.1 Create `db.js` exporting a `pg.Pool` singleton using `process.env.DATABASE_URL`
    - _Requirements: 2.2_

  - [x] 3.2 Create `server.js` with full startup logic
    - Load `.env` via `dotenv`
    - Exit with non-zero code and descriptive error if `DATABASE_URL` is not set
    - Mount `express.json()` middleware
    - Mount `cors()` middleware conditionally when `CORS_ORIGIN` env var is set
    - Serve `attendance.html` as a static file at `GET /`
    - Mount route modules at `/api/students` and `/api/attendance`
    - Add 404 catch-all returning `{ "error": "Not found" }`
    - Verify DB connection with `pool.query('SELECT 1')` before calling `app.listen`; exit with code 1 on failure
    - Listen on `process.env.PORT` defaulting to `3000`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.1, 7.2, 7.3_

- [x] 4. Implement the students route
  - [x] 4.1 Create `routes/students.js` implementing `GET /api/students`
    - Query `SELECT roll, name FROM students ORDER BY roll ASC`
    - Respond `200` with JSON array `[{ roll, name }]`; empty array when no rows
    - Respond `500 { error }` on DB error
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 4.2 Write property test for student list stability
    - **Property 3: Student list stability**
    - **Validates: Requirements 8.2, 8.3**
    - Call `GET /api/students` multiple times and assert the response array is identical each time (same rolls, same names, same order)

- [x] 5. Implement the attendance submission route
  - [x] 5.1 Create `routes/attendance.js` implementing `POST /api/attendance`
    - Validate presence of `submittedAt`, `date`, and `records`; respond `400 { error }` if any are missing
    - Validate `records` is a non-empty array; respond `400 { error }` if empty
    - Open a transaction: `INSERT INTO attendance_sessions`, then bulk `INSERT INTO attendance_records` for all records
    - On success respond `201 { id, submittedAt }`
    - On DB error rollback and respond `500 { error }`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 5.2 Write property test for submit → retrieve round-trip
    - **Property 1: Submit → Retrieve round-trip**
    - **Validates: Requirements 3.6, 4.3**
    - For any valid payload submitted via `POST /api/attendance`, assert that a subsequent `GET /api/attendance` returns a session whose `records` contain every submitted record with identical `roll`, `name`, `status`, `markedAt`, and `note` values

  - [ ]* 5.3 Write property test for transaction atomicity
    - **Property 4: Transaction atomicity**
    - **Validates: Requirements 3.7**
    - Simulate a DB error mid-insert and assert no partial session row exists in `attendance_sessions` after the rollback

- [x] 6. Implement the attendance history route
  - [x] 6.1 Add `GET /api/attendance` to `routes/attendance.js`
    - Fetch the 20 most recent sessions ordered by `submitted_at DESC`
    - Fetch all records for those session IDs in a single query
    - Assemble and respond `200` with array of `{ id, submittedAt, date, records: [...] }`
    - Respond `200` with empty array when no sessions exist
    - Respond `500 { error }` on DB error
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 6.2 Write property test for history cap invariant
    - **Property 2: History cap invariant**
    - **Validates: Requirements 4.6**
    - Submit more than 20 sessions and assert `GET /api/attendance` never returns more than 20 items

- [x] 7. Checkpoint — Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update `attendance.html` — remove legacy storage and hardcoded data
  - Remove the hardcoded `students` array from the `<script>` block
  - Remove all `window.storage.get`, `window.storage.set`, and `window.storage.delete` calls
  - Remove the `clearHistory()` function
  - Remove the `<button class="clear-history">` element from the DOM
  - _Requirements: 5.5, 6.6, 9.4_

- [x] 9. Update `attendance.html` — add API-driven student loading
  - [x] 9.1 Implement `loadStudents()` that calls `GET /api/students`, populates the `students` array and `state` map, and calls `renderTable()`
    - On fetch failure, display an error message and disable the Submit Attendance button
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 9.2 Add `init()` function that calls `loadStudents()` then `loadHistory()`, and replace the bare `renderTable(); loadHistory();` calls at the bottom of the script with `init()`
    - _Requirements: 9.1_

- [x] 10. Update `attendance.html` — replace submit logic with API call
  - Rewrite `submitAttendance()` to `POST /api/attendance` with `Content-Type: application/json`
  - Disable the Submit button and show `"Submitting…"` while the request is in flight
  - On `201` response, show the success toast and call `loadHistory()`
  - On non-2xx response, show a toast with the server's `error` message
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 11. Update `attendance.html` — replace history loading with API call
  - Rewrite `loadHistory()` to call `GET /api/attendance`
  - Render one history entry per session showing date/time, present count, absent count, and unmarked count
  - Display "No submissions yet" when the array is empty
  - Display an error message in the history panel if the request fails (do not crash)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- The server does **not** run any DDL on startup — `schema.sql` must be applied manually against the Neon database before first run
- Property tests validate universal correctness properties; unit tests validate specific examples and edge cases
