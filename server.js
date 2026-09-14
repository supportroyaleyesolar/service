const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection setup
let pool = null;
if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  // Run migrations & initial seed if connected to Postgres
  (async () => {
    try {
      const sqlPath = path.join(__dirname, '002_service_tracker.sql');
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await pool.query(sql);
        console.log('✓ Database tables verified / migrated successfully.');
      }

      // Check if employees exist, if not seed default technicians
      const empCheck = await pool.query('SELECT COUNT(*) FROM employees');
      if (parseInt(empCheck.rows[0].count, 10) === 0) {
        const defaultEmployees = [
          { name: 'Arjun Kumar', username: 'arjun', pin: '1234' },
          { name: 'Rahul Singh', username: 'rahul', pin: '1234' },
          { name: 'Suresh Patel', username: 'suresh', pin: '1234' },
          { name: 'Vikram Rao', username: 'vikram', pin: '1234' },
          { name: 'Mohan Das', username: 'mohan', pin: '1234' },
          { name: 'Admin', username: 'admin', pin: '0000' }
        ];

        for (const emp of defaultEmployees) {
          const hash = await bcrypt.hash(emp.pin, 10);
          await pool.query(
            'INSERT INTO employees (full_name, username, password_hash) VALUES ($1, $2, $3)',
            [emp.name, emp.username, hash]
          );
        }
        console.log('✓ Seeded initial employees into database.');
      }
    } catch (err) {
      console.error('Database migration/seed warning:', err.message);
    }
  })();
} else {
  console.log('Running without DATABASE_URL: API running in in-memory fallback mode.');
  // In-memory fallback if no database is connected
  const memoryEmployees = [
    { id: 1, full_name: 'Arjun Kumar', username: 'arjun', password_hash: '$2b$10$w09l5U3YkG9k9Xw0O4pM0.7zYnZ9c8n8tP.rUeH.N2Vp9k9Xw0O4p' },
    { id: 2, full_name: 'Rahul Singh', username: 'rahul', password_hash: '$2b$10$w09l5U3YkG9k9Xw0O4pM0.7zYnZ9c8n8tP.rUeH.N2Vp9k9Xw0O4p' },
    { id: 'admin', full_name: 'Admin', username: 'admin', password_hash: '$2b$10$w09l5U3YkG9k9Xw0O4pM0.7zYnZ9c8n8tP.rUeH.N2Vp9k9Xw0O4p' }
  ];
  const memoryPunches = [];

  pool = {
    query: async (text, params = []) => {
      const q = text.toLowerCase();
      if (q.includes('select id, full_name, password_hash from employees')) {
        const u = params[0];
        const row = memoryEmployees.find(e => e.username === u);
        return { rows: row ? [row] : [] };
      }
      if (q.includes('select sp.id, sp.location_name')) {
        return { rows: [...memoryPunches].reverse() };
      }
      if (q.includes('insert into service_punches')) {
        const [employee_id, location_name, notes] = params;
        const newPunch = {
          id: memoryPunches.length + 1,
          employee_id,
          location_name,
          notes,
          punched_at: new Date().toISOString()
        };
        memoryPunches.push(newPunch);
        return { rows: [newPunch] };
      }
      if (q.includes('select full_name from employees')) {
        const id = params[0];
        const row = memoryEmployees.find(e => e.id == id);
        return { rows: row ? [{ full_name: row.full_name }] : [] };
      }
      return { rows: [] };
    }
  };
}

// Mount service tracker routes
const serviceTrackerRoutes = require('./serviceTracker')(pool);
app.use('/api/service', serviceTrackerRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve frontend static files
app.use(express.static(__dirname));
app.use('/service-tracker', express.static(__dirname));

// Default route serves index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✓ Royal Eye Service Tracker running on port ${PORT}`);
  console.log(`✓ Web interface: http://localhost:${PORT}`);
});
