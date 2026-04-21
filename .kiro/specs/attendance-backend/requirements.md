# Requirements Document

## Introduction

This feature adds a Node.js/Express backend to the existing single-file attendance application. The backend connects to a PostgreSQL database hosted on Neon, exposes REST API endpoints for submitting and retrieving attendance records, and the frontend is updated to use these endpoints instead of the local `window.storage` API. Attendance submissions are persisted with full timestamp fields and can be retrieved for display in the history panel.

## Glossary

- **Server**: The Node.js/Express HTTP server that handles API requests.
- **Database**: The PostgreSQL instance hosted on Neon.
- **Attendance_Session**: A single submission event containing a date, a submission timestamp, and one record per student.
- **Attendance_Record**: A single student's attendance entry within an Attendance_Session, containing roll number, name, status, marked-at time, and an optional note.
- **Student**: A row in the `students` table, identified by a unique roll number and a display name.
- **API**: The REST interface exposed by the Server.
- **Frontend**: The existing `attendance.html` single-page application.
- **Client**: The browser running the Frontend.
- **Status**: One of three string values — `"present"`, `"absent"`, or `"unmarked"` — representing a student's attendance state.

---

## Requirements

### Requirement 1: Database Schema

**User Story:** As a developer, I want a well-defined database schema defined in a standalone SQL migration file, so that attendance data is stored consistently and the schema can be applied manually without any auto-creation logic in the server.

#### Acceptance Criteria

1. THE Repository SHALL contain a standalone SQL file named `schema.sql` that defines the complete database schema and is run manually by the developer against the Neon database.
2. THE `schema.sql` file SHALL define a table named `attendance_sessions` with columns: `id` (auto-incrementing primary key), `submitted_at` (timestamptz, not null), and `date` (text, not null).
3. THE `schema.sql` file SHALL define a table named `attendance_records` with columns: `id` (auto-incrementing primary key), `session_id` (integer foreign key referencing `attendance_sessions.id`), `roll` (text, not null), `name` (text, not null), `status` (text, not null), `marked_at` (text, nullable), and `note` (text, nullable).
4. THE `schema.sql` file SHALL enforce a foreign key constraint between `attendance_records.session_id` and `attendance_sessions.id` with `ON DELETE CASCADE`.
5. IF the `attendance_records.status` value is not one of `"present"`, `"absent"`, or `"unmarked"`, THEN THE Database SHALL reject the insert with a constraint violation.
6. THE `schema.sql` file SHALL define a table named `students` with columns: `roll` (text primary key) and `name` (text, not null), pre-populated with the initial 15 students via `INSERT` statements in the same file.
7. THE Server SHALL NOT auto-create or auto-migrate database tables on startup.

---

### Requirement 2: Server Initialization

**User Story:** As a developer, I want the Express server to start and connect to the database on launch, so that the API is available for requests.

#### Acceptance Criteria

1. THE Server SHALL listen on a configurable port read from the `PORT` environment variable, defaulting to `3000`.
2. THE Server SHALL read the Neon PostgreSQL connection string from the `DATABASE_URL` environment variable.
3. WHEN the Server starts, THE Server SHALL verify the database connection is reachable before accepting requests.
4. IF the `DATABASE_URL` environment variable is not set, THEN THE Server SHALL log a descriptive error message and exit with a non-zero status code.
5. THE Server SHALL serve the `attendance.html` file as a static asset at the root path `/`.

---

### Requirement 3: Submit Attendance Endpoint

**User Story:** As a teacher, I want to submit attendance data to the backend, so that it is permanently stored in the database.

#### Acceptance Criteria

1. THE API SHALL expose a `POST /api/attendance` endpoint that accepts a JSON request body.
2. WHEN a valid request body is received, THE Server SHALL insert one row into `attendance_sessions` and one row per student into `attendance_records` within a single database transaction.
3. THE Server SHALL accept a request body matching the structure: `{ submittedAt: string (ISO 8601), date: string, records: [{ roll, name, status, markedAt, note }] }`.
4. IF the request body is missing the `submittedAt`, `date`, or `records` fields, THEN THE Server SHALL respond with HTTP status `400` and a JSON body containing a descriptive `error` field.
5. IF the `records` array is empty, THEN THE Server SHALL respond with HTTP status `400` and a JSON body containing a descriptive `error` field.
6. WHEN the insert succeeds, THE Server SHALL respond with HTTP status `201` and a JSON body containing the created session's `id` and `submittedAt`.
7. IF a database error occurs during insert, THEN THE Server SHALL roll back the transaction and respond with HTTP status `500` and a JSON body containing a descriptive `error` field.

---

### Requirement 4: Fetch Attendance History Endpoint

**User Story:** As a teacher, I want to retrieve past attendance submissions from the backend, so that the history panel shows persisted records.

#### Acceptance Criteria

1. THE API SHALL expose a `GET /api/attendance` endpoint.
2. WHEN the endpoint is called, THE Server SHALL return all Attendance_Sessions ordered by `submitted_at` descending, each including its associated Attendance_Records.
3. THE Server SHALL respond with HTTP status `200` and a JSON array where each element has the shape: `{ id, submittedAt, date, records: [{ id, roll, name, status, markedAt, note }] }`.
4. WHEN no sessions exist in the Database, THE Server SHALL respond with HTTP status `200` and an empty JSON array.
5. IF a database error occurs during the query, THEN THE Server SHALL respond with HTTP status `500` and a JSON body containing a descriptive `error` field.
6. THE Server SHALL limit the response to the 20 most recent Attendance_Sessions.

---

### Requirement 5: Frontend — Submit via API

**User Story:** As a teacher, I want the Submit Attendance button to send data to the backend API, so that submissions are stored in the database instead of local storage.

#### Acceptance Criteria

1. WHEN the Submit Attendance button is clicked, THE Frontend SHALL send a `POST` request to `/api/attendance` with the attendance payload as a JSON body and `Content-Type: application/json`.
2. WHEN the Server responds with HTTP status `201`, THE Frontend SHALL display the success toast notification and reload the history panel.
3. IF the Server responds with a non-2xx status, THEN THE Frontend SHALL display a toast notification with the error message returned by the Server.
4. WHILE the POST request is in flight, THE Frontend SHALL disable the Submit Attendance button and display the text `"Submitting…"`.
5. THE Frontend SHALL remove all calls to `window.storage.set` and `window.storage.get` for attendance submission persistence.

---

### Requirement 6: Frontend — Load History from API

**User Story:** As a teacher, I want the history panel to load past submissions from the backend, so that I can see all previously saved attendance records.

#### Acceptance Criteria

1. WHEN the Frontend page loads, THE Frontend SHALL call `GET /api/attendance` to populate the history panel.
2. WHEN the history panel is toggled open, THE Frontend SHALL call `GET /api/attendance` to refresh the displayed records.
3. WHEN the Server responds with a non-empty array, THE Frontend SHALL render one history entry per session showing the submission date/time, present count, absent count, and unmarked count.
4. WHEN the Server responds with an empty array, THE Frontend SHALL display the "No submissions yet" message in the history panel.
5. IF the `GET /api/attendance` request fails, THEN THE Frontend SHALL display an error message in the history panel instead of crashing.
6. THE Frontend SHALL remove the "Clear all" history button and its associated `clearHistory` function and `window.storage.delete` call, as deletion is not supported by the API.

---

### Requirement 8: Fetch Students Endpoint

**User Story:** As a developer, I want a dedicated endpoint to retrieve the student list from the database, so that the frontend does not rely on a hardcoded array.

#### Acceptance Criteria

1. THE API SHALL expose a `GET /api/students` endpoint.
2. WHEN the endpoint is called, THE Server SHALL return all students from the `students` table ordered by `roll` ascending.
3. THE Server SHALL respond with HTTP status `200` and a JSON array where each element has the shape: `{ roll: string, name: string }`.
4. WHEN no students exist in the Database, THE Server SHALL respond with HTTP status `200` and an empty JSON array.
5. IF a database error occurs during the query, THEN THE Server SHALL respond with HTTP status `500` and a JSON body containing a descriptive `error` field.

---

### Requirement 9: Frontend — Load Students from API

**User Story:** As a teacher, I want the attendance page to load the student list from the backend, so that the list is managed in the database rather than hardcoded in the HTML file.

#### Acceptance Criteria

1. WHEN the Frontend page loads, THE Frontend SHALL call `GET /api/students` to retrieve the student list before rendering the attendance table.
2. WHEN the Server responds with a non-empty array, THE Frontend SHALL populate the attendance table using the returned student data.
3. IF the `GET /api/students` request fails, THEN THE Frontend SHALL display an error message and disable the Submit Attendance button.
4. THE Frontend SHALL remove the hardcoded `students` array from the JavaScript source.

---

### Requirement 7: CORS and Middleware

**User Story:** As a developer, I want the server to handle cross-origin requests and parse JSON bodies, so that the frontend can communicate with the API during local development.

#### Acceptance Criteria

1. THE Server SHALL parse incoming JSON request bodies using Express's built-in `express.json()` middleware.
2. WHERE the `CORS_ORIGIN` environment variable is set, THE Server SHALL allow cross-origin requests from that origin.
3. THE Server SHALL respond to all unmatched routes with HTTP status `404` and a JSON body `{ "error": "Not found" }`.
