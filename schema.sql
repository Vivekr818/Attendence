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
