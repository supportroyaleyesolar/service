// routes/serviceTracker.js
//
// Full Service Tracker API with multi-device real-time sync.
// Handles jobs, status transitions, activity feed, online heartbeats, and authentication.

const express = require('express');
const bcrypt = require('bcrypt');

module.exports = function (pool) {
  const router = express.Router();
  const isMemory = !pool || pool.isMemory;

  // In-memory fallback state (shared across all requests while server is up)
  const mem = {
    jobs: [],
    activity: [
      {
        id: 'init_1',
        date: new Date().toISOString().slice(0, 10),
        type: 'add',
        msg: '<strong>System</strong> Service tracker started',
        ts: Date.now()
      }
    ],
    heartbeats: {},
    lastUpdated: Date.now()
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function formatJobRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      date: typeof row.date === 'string' ? row.date.slice(0, 10) : (row.date ? new Date(row.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
      title: row.title,
      location: row.location,
      type: row.type || 'general',
      priority: row.priority || 'medium',
      note: row.note || '',
      status: row.status || 'open',
      claimedBy: row.claimed_by || null,
      claimedAt: row.claimed_at ? Number(row.claimed_at) : null,
      doneAt: row.done_at ? Number(row.done_at) : null
    };
  }

  // ── GET FULL STATE ────────────────────────────────────────────────────────
  // All devices poll this to stay 100% synchronized
  router.get('/state', async (req, res) => {
    try {
      if (isMemory) {
        // Clean heartbeats older than 10 mins in memory
        const cutoff = Date.now() - 10 * 60 * 1000;
        for (const k in mem.heartbeats) {
          if (mem.heartbeats[k] < cutoff) delete mem.heartbeats[k];
        }
        return res.json({
          jobs: mem.jobs.filter(j => !j.deleted),
          activity: mem.activity.slice(0, 100),
          heartbeats: mem.heartbeats,
          lastUpdated: mem.lastUpdated
        });
      }

      // Postgres queries
      const [jobsRes, actRes, hbRes] = await Promise.all([
        pool.query('SELECT * FROM service_jobs WHERE deleted = false ORDER BY created_at ASC'),
        pool.query('SELECT * FROM activity_log ORDER BY ts DESC LIMIT 100'),
        pool.query('SELECT employee_id, last_seen FROM heartbeats WHERE last_seen > $1', [Date.now() - 10 * 60 * 1000])
      ]);

      const jobs = jobsRes.rows.map(formatJobRow);
      const activity = actRes.rows.map(r => ({
        id: r.id,
        date: r.date,
        type: r.type,
        msg: r.msg,
        ts: Number(r.ts)
      }));

      const heartbeats = {};
      for (const r of hbRes.rows) {
        heartbeats[r.employee_id] = Number(r.last_seen);
      }

      return res.json({
        jobs,
        activity,
        heartbeats,
        lastUpdated: Date.now()
      });
    } catch (err) {
      console.error('Error fetching state:', err);
      // Fallback to in-memory if DB fails
      return res.json({
        jobs: mem.jobs.filter(j => !j.deleted),
        activity: mem.activity,
        heartbeats: mem.heartbeats,
        lastUpdated: mem.lastUpdated
      });
    }
  });

  // ── CREATE NEW JOB ────────────────────────────────────────────────────────
  router.post('/jobs', async (req, res) => {
    const { id, date, title, location, type, priority, note, createdBy } = req.body || {};
    if (!title || !location) {
      return res.status(400).json({ error: 'Title and location are required.' });
    }

    const jobId = id || uid();
    const jobDate = date || new Date().toISOString().slice(0, 10);
    const jobType = type || 'general';
    const jobPriority = priority || 'medium';
    const jobNote = (note || '').trim();
    const creator = createdBy || 'User';
    const now = Date.now();

    const newJob = {
      id: jobId,
      date: jobDate,
      title: title.trim(),
      location: location.trim(),
      type: jobType,
      priority: jobPriority,
      note: jobNote,
      status: 'open',
      claimedBy: null,
      claimedAt: null,
      doneAt: null,
      deleted: false
    };

    const actItem = {
      id: uid(),
      date: jobDate,
      type: 'add',
      msg: `<strong>${creator}</strong> added: ${newJob.title}`,
      ts: now
    };

    if (isMemory) {
      mem.jobs.push(newJob);
      mem.activity.unshift(actItem);
      mem.lastUpdated = now;
      return res.status(201).json(newJob);
    }

    try {
      await pool.query(
        `INSERT INTO service_jobs (id, date, title, location, type, priority, note, status, deleted)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', false)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           location = EXCLUDED.location,
           type = EXCLUDED.type,
           priority = EXCLUDED.priority,
           note = EXCLUDED.note,
           deleted = false,
           updated_at = now()`,
        [jobId, jobDate, newJob.title, newJob.location, jobType, jobPriority, jobNote]
      );

      await pool.query(
        'INSERT INTO activity_log (id, date, type, msg, ts) VALUES ($1, $2, $3, $4, $5)',
        [actItem.id, actItem.date, actItem.type, actItem.msg, actItem.ts]
      );

      return res.status(201).json(newJob);
    } catch (err) {
      console.error('Error inserting job into DB:', err);
      // fallback in-memory
      mem.jobs.push(newJob);
      mem.activity.unshift(actItem);
      mem.lastUpdated = now;
      return res.status(201).json(newJob);
    }
  });

  // ── UPDATE JOB STATUS (Punch In / Done / Release / Reopen) ─────────────────
  router.patch('/jobs/:id', async (req, res) => {
    const { id } = req.params;
    const { action, employeeId, employeeName } = req.body || {};
    const name = employeeName || 'Employee';
    const now = Date.now();

    if (isMemory) {
      const job = mem.jobs.find(j => j.id === id && !j.deleted);
      if (!job) return res.status(404).json({ error: 'Job not found.' });

      let actType = 'punch';
      let actMsg = '';

      if (action === 'punchIn') {
        if (job.status === 'claimed' && job.claimedBy && job.claimedBy !== employeeId) {
          return res.status(409).json({ error: 'This job was just claimed by another technician!' });
        }
        job.status = 'claimed';
        job.claimedBy = employeeId;
        job.claimedAt = now;
        actType = 'punch';
        actMsg = `<strong>${name}</strong> punched in for: ${job.title}`;
      } else if (action === 'markDone') {
        job.status = 'done';
        job.doneAt = now;
        actType = 'complete';
        actMsg = `<strong>${name}</strong> completed: ${job.title}`;
      } else if (action === 'release') {
        job.status = 'open';
        job.claimedBy = null;
        job.claimedAt = null;
        actType = 'release';
        actMsg = `<strong>${name}</strong> released: ${job.title}`;
      } else if (action === 'reopen') {
        job.status = 'open';
        job.claimedBy = null;
        job.claimedAt = null;
        job.doneAt = null;
        actType = 'release';
        actMsg = `<strong>${name}</strong> reopened: ${job.title}`;
      }

      if (actMsg) {
        mem.activity.unshift({ id: uid(), date: new Date().toISOString().slice(0, 10), type: actType, msg: actMsg, ts: now });
      }
      mem.lastUpdated = now;
      return res.json(job);
    }

    try {
      const checkRes = await pool.query('SELECT * FROM service_jobs WHERE id = $1 AND deleted = false', [id]);
      if (checkRes.rows.length === 0) {
        return res.status(404).json({ error: 'Job not found.' });
      }
      const existing = checkRes.rows[0];

      let newStatus = existing.status;
      let newClaimedBy = existing.claimed_by;
      let newClaimedAt = existing.claimed_at;
      let newDoneAt = existing.done_at;
      let actType = 'punch';
      let actMsg = '';

      if (action === 'punchIn') {
        if (existing.status === 'claimed' && existing.claimed_by && String(existing.claimed_by) !== String(employeeId)) {
          return res.status(409).json({ error: 'This job was just claimed by another technician!' });
        }
        newStatus = 'claimed';
        newClaimedBy = String(employeeId);
        newClaimedAt = now;
        actType = 'punch';
        actMsg = `<strong>${name}</strong> punched in for: ${existing.title}`;
      } else if (action === 'markDone') {
        newStatus = 'done';
        newDoneAt = now;
        actType = 'complete';
        actMsg = `<strong>${name}</strong> completed: ${existing.title}`;
      } else if (action === 'release') {
        newStatus = 'open';
        newClaimedBy = null;
        newClaimedAt = null;
        actType = 'release';
        actMsg = `<strong>${name}</strong> released: ${existing.title}`;
      } else if (action === 'reopen') {
        newStatus = 'open';
        newClaimedBy = null;
        newClaimedAt = null;
        newDoneAt = null;
        actType = 'release';
        actMsg = `<strong>${name}</strong> reopened: ${existing.title}`;
      }

      const updateRes = await pool.query(
        `UPDATE service_jobs
         SET status = $1, claimed_by = $2, claimed_at = $3, done_at = $4, updated_at = now()
         WHERE id = $5
         RETURNING *`,
        [newStatus, newClaimedBy, newClaimedAt, newDoneAt, id]
      );

      if (actMsg) {
        await pool.query(
          'INSERT INTO activity_log (id, date, type, msg, ts) VALUES ($1, $2, $3, $4, $5)',
          [uid(), new Date().toISOString().slice(0, 10), actType, actMsg, now]
        );
      }

      return res.json(formatJobRow(updateRes.rows[0]));
    } catch (err) {
      console.error('Error updating job:', err);
      return res.status(500).json({ error: 'Failed to update job status.' });
    }
  });

  // ── DELETE JOB (Admin) ────────────────────────────────────────────────────
  router.delete('/jobs/:id', async (req, res) => {
    const { id } = req.params;
    const { employeeName } = req.body || {};
    const name = employeeName || 'Admin';
    const now = Date.now();

    if (isMemory) {
      const idx = mem.jobs.findIndex(j => j.id === id);
      let title = 'service';
      if (idx >= 0) {
        title = mem.jobs[idx].title;
        mem.jobs[idx].deleted = true;
      }
      mem.activity.unshift({
        id: uid(),
        date: new Date().toISOString().slice(0, 10),
        type: 'release',
        msg: `<strong>Admin (${name})</strong> deleted: ${title}`,
        ts: now
      });
      mem.lastUpdated = now;
      return res.json({ success: true });
    }

    try {
      const checkRes = await pool.query('SELECT title FROM service_jobs WHERE id = $1', [id]);
      const title = checkRes.rows[0] ? checkRes.rows[0].title : 'service';

      await pool.query('UPDATE service_jobs SET deleted = true, updated_at = now() WHERE id = $1', [id]);

      await pool.query(
        'INSERT INTO activity_log (id, date, type, msg, ts) VALUES ($1, $2, $3, $4, $5)',
        [uid(), new Date().toISOString().slice(0, 10), 'release', `<strong>Admin (${name})</strong> deleted: ${title}`, now]
      );

      return res.json({ success: true });
    } catch (err) {
      console.error('Error deleting job:', err);
      return res.status(500).json({ error: 'Failed to delete job.' });
    }
  });

  // ── RESET TODAY'S JOBS (Admin) ────────────────────────────────────────────
  router.post('/reset-today', async (req, res) => {
    const today = req.body.date || new Date().toISOString().slice(0, 10);
    const now = Date.now();

    if (isMemory) {
      mem.jobs = mem.jobs.map(j => {
        if (j.date === today) j.deleted = true;
        return j;
      });
      mem.activity.unshift({
        id: uid(),
        date: today,
        type: 'release',
        msg: '<strong>Admin</strong> reset all jobs for today',
        ts: now
      });
      mem.lastUpdated = now;
      return res.json({ success: true });
    }

    try {
      await pool.query('UPDATE service_jobs SET deleted = true, updated_at = now() WHERE date = $1', [today]);
      await pool.query(
        'INSERT INTO activity_log (id, date, type, msg, ts) VALUES ($1, $2, $3, $4, $5)',
        [uid(), today, 'release', '<strong>Admin</strong> reset all jobs for today', now]
      );
      return res.json({ success: true });
    } catch (err) {
      console.error('Error resetting today jobs:', err);
      return res.status(500).json({ error: 'Failed to reset today jobs.' });
    }
  });

  // ── HEARTBEAT (Online presence) ───────────────────────────────────────────
  router.post('/heartbeat', async (req, res) => {
    const { employeeId } = req.body || {};
    if (!employeeId) return res.status(400).json({ error: 'employeeId required' });
    const now = Date.now();

    if (isMemory) {
      mem.heartbeats[employeeId] = now;
      return res.json({ ok: true });
    }

    try {
      await pool.query(
        `INSERT INTO heartbeats (employee_id, last_seen)
         VALUES ($1, $2)
         ON CONFLICT (employee_id) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
        [String(employeeId), now]
      );
      return res.json({ ok: true });
    } catch (err) {
      console.error('Error saving heartbeat:', err);
      mem.heartbeats[employeeId] = now;
      return res.json({ ok: true });
    }
  });

  // ── USER LOGIN ────────────────────────────────────────────────────────────
  router.post('/login', async (req, res) => {
    const { username, password, pin, id } = req.body || {};
    const inputUser = (username || id || '').trim().toLowerCase();
    const inputPass = password || pin;

    if (!inputUser || !inputPass) {
      return res.status(400).json({ error: 'Username and password/PIN are required.' });
    }

    // Standard PINs for fallback
    const defaultPins = {
      '1': '1234',
      '2': '1234',
      '3': '1234',
      '4': '1234',
      '5': '1234',
      'admin': '0000',
      'jithu': '1234',
      'appunni': '1234',
      'jishil': '1234',
      'shahid': '1234',
      'kichu': '1234'
    };

    const names = {
      '1': 'JITHU',
      '2': 'APPUNNI',
      '3': 'JISHIL',
      '4': 'SHAHID',
      '5': 'KICHU',
      'admin': 'Admin'
    };

    if (isMemory) {
      if (defaultPins[inputUser] === inputPass) {
        const canonicalId = inputUser === 'jithu' ? '1' : (inputUser === 'appunni' ? '2' : (inputUser === 'jishil' ? '3' : (inputUser === 'shahid' ? '4' : (inputUser === 'kichu' ? '5' : inputUser))));
        return res.json({ id: canonicalId, full_name: names[canonicalId] || inputUser });
      }
      return res.status(401).json({ error: 'Incorrect PIN or username.' });
    }

    try {
      const result = await pool.query(
        'SELECT id, full_name, username, password_hash FROM employees WHERE username = $1 AND active = true',
        [inputUser]
      );
      const employee = result.rows[0];
      if (employee) {
        const ok = await bcrypt.compare(inputPass, employee.password_hash);
        if (ok) {
          return res.json({ id: String(employee.id), full_name: employee.full_name });
        }
      }

      // Check default fallback pins if DB row doesn't match yet
      if (defaultPins[inputUser] === inputPass) {
        const canonicalId = inputUser === 'jithu' ? '1' : (inputUser === 'appunni' ? '2' : (inputUser === 'jishil' ? '3' : (inputUser === 'shahid' ? '4' : (inputUser === 'kichu' ? '5' : inputUser))));
        return res.json({ id: canonicalId, full_name: names[canonicalId] || inputUser });
      }

      return res.status(401).json({ error: 'Incorrect username or password.' });
    } catch (err) {
      console.error('Service tracker login error:', err);
      // Fallback
      if (defaultPins[inputUser] === inputPass) {
        return res.json({ id: inputUser, full_name: names[inputUser] || inputUser });
      }
      return res.status(500).json({ error: 'Something went wrong. Try again.' });
    }
  });

  // ── LEGACY PUNCHES (kept for backward compatibility) ───────────────────────
  router.get('/punches', async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    if (isMemory) return res.json([]);
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
      return res.status(500).json({ error: 'Could not load punches.' });
    }
  });

  router.post('/punches', async (req, res) => {
    const { employeeId, location_name, notes } = req.body || {};
    if (!employeeId || !location_name || !location_name.trim()) {
      return res.status(400).json({ error: 'employeeId and location_name are required.' });
    }
    if (isMemory) {
      return res.status(201).json({ id: 1, location_name, notes, punched_at: new Date().toISOString() });
    }
    try {
      const result = await pool.query(
        `INSERT INTO service_punches (employee_id, location_name, notes)
         VALUES ($1, $2, $3)
         RETURNING id, location_name, notes, punched_at`,
        [parseInt(employeeId, 10) || 1, location_name.trim(), (notes || '').trim() || null]
      );
      return res.status(201).json(result.rows[0]);
    } catch (err) {
      return res.status(500).json({ error: 'Could not save the punch.' });
    }
  });

  return router;
};
