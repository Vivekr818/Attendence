require('dotenv').config();

if (!process.env.DATABASE_URL) {
  process.stderr.write('Error: DATABASE_URL environment variable is not set. Please configure it in your .env file.\n');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');

const app = express();

app.use(express.json());

if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN }));
}

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'attendance.html'));
});

app.use('/api/students', require('./routes/students'));
app.use('/api/attendance', require('./routes/attendance'));

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('Failed to connect to the database:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
})();
