const express = require('express');
const pool = require('../db');

const router = express.Router();

// POST /api/attendance
router.post('/', async (req, res) => {
  const { submittedAt, date, records } = req.body;

  if (!submittedAt || !date || !records) {
    return res.status(400).json({ error: 'Missing required fields: submittedAt, date, records' });
  }

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'records must be a non-empty array' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      'INSERT INTO attendance_sessions (submitted_at, date) VALUES ($1, $2) RETURNING id',
      [submittedAt, date]
    );
    const sessionId = sessionResult.rows[0].id;

    for (const record of records) {
      await client.query(
        'INSERT INTO attendance_records (session_id, roll, name, status, marked_at, note) VALUES ($1, $2, $3, $4, $5, $6)',
        [sessionId, record.roll, record.name, record.status, record.markedAt, record.note]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({ id: sessionId, submittedAt });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/attendance
router.get('/', async (req, res) => {
  try {
    const sessionsResult = await pool.query(
      'SELECT id, submitted_at, date FROM attendance_sessions ORDER BY submitted_at DESC LIMIT 20'
    );

    if (sessionsResult.rows.length === 0) {
      return res.status(200).json([]);
    }

    const sessionIds = sessionsResult.rows.map(s => s.id);

    const recordsResult = await pool.query(
      'SELECT * FROM attendance_records WHERE session_id = ANY($1)',
      [sessionIds]
    );

    const sessions = sessionsResult.rows.map(session => ({
      id: session.id,
      submittedAt: session.submitted_at,
      date: session.date,
      records: recordsResult.rows
        .filter(r => r.session_id === session.id)
        .map(r => ({
          id: r.id,
          roll: r.roll,
          name: r.name,
          status: r.status,
          markedAt: r.marked_at,
          note: r.note,
        })),
    }));

    return res.status(200).json(sessions);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
