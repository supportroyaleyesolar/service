// scripts/add-employee.js
//
// Adds one employee login for the Service Punch Tracker.
// Run from your existing project root (needs the same pg connection your app uses):
//
//   node scripts/add-employee.js "Full Name" username password
//
// Example:
//   node scripts/add-employee.js "Arjun Nair" arjun MySecurePass123

const bcrypt = require('bcrypt');
const pool = require('../db'); // <-- update this path to wherever your app exports its pg Pool

async function main() {
  const [fullName, username, password] = process.argv.slice(2);

  if (!fullName || !username || !password) {
    console.error('Usage: node scripts/add-employee.js "Full Name" username password');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      `INSERT INTO employees (full_name, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, username`,
      [fullName, username.trim().toLowerCase(), passwordHash]
    );
    console.log('Employee added:', result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      console.error(`Username "${username}" is already taken.`);
    } else {
      console.error('Failed to add employee:', err.message);
    }
  } finally {
    await pool.end();
  }
}

main();
