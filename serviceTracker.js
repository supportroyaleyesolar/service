// routes/serviceTracker.js
//
// Service Punch Tracker routes.
// Wire this into your existing Express app — see README-SERVICE-TRACKER.md.
//
// Usage in your server.js:
//   const pool = require('./db');   // however you already export your pg Pool
//   const serviceTrackerRoutes = require('./routes/serviceTracker')(pool);
//   app.use('/api/service', serviceTrackerRoutes);

const express = require('express');
const bcrypt = require('bcrypt');

module.exports = function (pool) {
  const router = express.Router();

  // POST /api/service/login
  // body: { username, password }
  // returns: { id, full_name } on success
  router.post('/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    try {
      const result = await pool.query(
        'SELECT id, full_name, password_hash FROM employees WHERE username = $1 AND active = true',
        [username.trim().toLowerCase()]
      );
      const employee = result.rows[0];
      if (!employee) {
        return res.status(401).json({ error: 'Incorrect username or password.' });
      }
      const ok = await bcrypt.compare(password, employee.password_hash);
      if (!ok) {
        return res.status(401).json({ error: 'Incorrect username or password.' });
      }
      return res.json({ id: employee.id, full_name: employee.full_name });
    } catch (err) {
      console.error('Service tracker login error:', err);
      return res.status(500).json({ error: 'Something went wrong. Try again.' });
    }
  });

  // GET /api/service/punches?date=YYYY-MM-DD
  // Defaults to today (server's local date) when no date is given.
  router.get('/punches', async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    try {
      const result = await pool.query(
        `SELECT sp.id, sp.location_name, sp.notes, sp.punched_at, e.full_name
         FROM service_punches sp
         JOIN employees e ON e.id = sp.employee_id
         WHERE sp.punched_at::date = $1::date
         ORDER BY sp.punched_at DESC`,
        [date]
      );
      return res.json(result.rows);
    } catch (err) {
      console.error('Service tracker list error:', err);
      return res.status(500).json({ error: 'Could not load punches.' });
    }
  });

  // POST /api/service/punches
  // body: { employeeId, location_name, notes }
  router.post('/punches', async (req, res) => {
    const { employeeId, location_name, notes } = req.body || {};
    if (!employeeId || !location_name || !location_name.trim()) {
      return res.status(400).json({ error: 'employeeId and location_name are required.' });
    }
    try {
      const result = await pool.query(
        `INSERT INTO service_punches (employee_id, location_name, notes)
         VALUES ($1, $2, $3)
         RETURNING id, location_name, notes, punched_at`,
        [employeeId, location_name.trim(), (notes || '').trim() || null]
      );
      const employeeResult = await pool.query('SELECT full_name FROM employees WHERE id = $1', [employeeId]);
      return res.status(201).json({
        ...result.rows[0],
        full_name: employeeResult.rows[0] ? employeeResult.rows[0].full_name : null,
      });
    } catch (err) {
      console.error('Service tracker punch error:', err);
      return res.status(500).json({ error: 'Could not save the punch.' });
    }
  });

  return router;
};
