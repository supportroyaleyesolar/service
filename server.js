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

      // Check if employees exist, if not seed Royal Eye technicians
      const empCheck = await pool.query('SELECT COUNT(*) FROM employees');
      if (parseInt(empCheck.rows[0].count, 10) === 0) {
        const defaultEmployees = [
          { name: 'JITHU', username: '1', pin: '1234' },
          { name: 'APPUNNI', username: '2', pin: '1234' },
          { name: 'JISHIL', username: '3', pin: '1234' },
          { name: 'SHAHID', username: '4', pin: '1234' },
          { name: 'KICHU', username: '5', pin: '1234' },
          { name: 'Admin', username: 'admin', pin: '0000' }
        ];

        for (const emp of defaultEmployees) {
          const hash = await bcrypt.hash(emp.pin, 10);
          await pool.query(
            'INSERT INTO employees (full_name, username, password_hash) VALUES ($1, $2, $3)',
            [emp.name, emp.username, hash]
          );
        }
        console.log('✓ Seeded initial Royal Eye employees into database.');
      }
    } catch (err) {
      console.error('Database migration/seed warning:', err.message);
    }
  })();
} else {
  console.log('Running without DATABASE_URL: API running in shared in-memory mode.');
  pool = { isMemory: true };
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Royal Eye Service Tracker running on port ${PORT}`);
  console.log(`✓ Web interface: http://localhost:${PORT}`);
});
