# Service Punch Tracker — add-on for the Royal Eye Solar tracker app

What this adds: a page where any of your service employees log in, "punch"
a place once they've done the inverter/battery service there, and everyone
else sees it appear on a shared list within seconds — so nobody drives out
to a place that's already done.

## Files in this package

```
002_service_tracker.sql   → new database tables (a migration)
serviceTracker.js         → API endpoints (login, punch, list)
add-employee.js           → command to create employee logins
index.html                → the page workers use (login + dashboard)
```

All five files sit in one flat folder — the instructions below tell you
which folder of your *existing* project each one belongs in.

## 1. Run the migration

Connect to the same Postgres database your existing tracker app uses, then run:

```
psql "$DATABASE_URL" -f migrations/002_service_tracker.sql
```

(Or paste its contents into whatever tool you normally use to run SQL against
your Render database.)

## 2. Copy the files into your project

- Copy `serviceTracker.js` into your existing `routes/` folder.
- Copy `add-employee.js` into your existing `scripts/` folder.
- Create a folder named `service-tracker` inside your existing `public/`
  folder (wherever your app already serves static files from), and put
  `index.html` inside it — so the final path is
  `public/service-tracker/index.html`.

## 3. Install one dependency

```
npm install bcrypt
```

## 4. Wire the routes into your server.js

Add these two lines near where your other routes are mounted. Replace
`require('../db')` inside `add-employee.js` and the `pool` variable below
with whatever your app already uses to connect to Postgres — you likely
already have a `pool` or `db` object created with `pg`.

```js
const serviceTrackerRoutes = require('./routes/serviceTracker')(pool);
app.use('/api/service', serviceTrackerRoutes);
```

Make sure static files are being served (most Express apps already have this
line — if so you don't need to add it again):

```js
app.use(express.static('public'));
```

## 5. Add your employees

Run this once per employee, from your project root:

```
node scripts/add-employee.js "Full Name" username password
```

Example for 5 workers:

```
node scripts/add-employee.js "Arjun Nair" arjun Sun2026pass
node scripts/add-employee.js "Deepak Rao" deepak Sun2026pass
node scripts/add-employee.js "Farhan Sheikh" farhan Sun2026pass
node scripts/add-employee.js "Manoj Kumar" manoj Sun2026pass
node scripts/add-employee.js "Suresh Babu" suresh Sun2026pass
```

Pick real passwords rather than the placeholder above — each person should
have their own.

## 6. Deploy and use it

After you deploy to Render, the page is available at:

```
https://your-app.onrender.com/service-tracker/
```

Each worker opens that link, logs in once (their phone remembers them),
and taps "Punch this service" after finishing a job. The list refreshes
automatically every 15 seconds, and there's a search box to quickly check
whether a place has already been done today.

## Good to know / things to upgrade later if you want

- **Login is intentionally simple.** There's no session or token — the
  logged-in employee's ID is remembered in the browser. That's fine for a
  small trusted team using their own phones, but it means a technically
  savvy person could fake being someone else. If that ever matters, this
  can be upgraded to real sessions.
- **History isn't shown yet** — the dashboard only shows *today's* punches.
  Add a date picker calling `/api/service/punches?date=YYYY-MM-DD` if you
  want to look back at past days.
- **No way to edit or delete a punch** from the UI yet — only add new ones.
  Easy to add if a worker needs to correct a mistake.
