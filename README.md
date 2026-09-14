# Royal Eye Solar — Service Tracker

Live service punch tracker and dispatch portal for Royal Eye Solar field technicians.

---

## 🌐 1. Live Frontend (GitHub Pages)

This repository includes a standalone, mobile-optimized frontend that works directly in the browser.

To enable GitHub Pages:
1. Go to repository **Settings** > **Pages**
2. Under **Build and deployment**, set **Source** to `Deploy from a branch`
3. Select branch: `main`, folder: `/ (root)`
4. Click **Save**

Your site will be live at:
```
https://supportroyaleyesolar.github.io/service/
```

### Technician Default Logins:
- **Arjun Kumar** (Technician) — PIN: `1234`
- **Rahul Singh** (Technician) — PIN: `1234`
- **Suresh Patel** (Senior Tech) — PIN: `1234`
- **Vikram Rao** (Technician) — PIN: `1234`
- **Mohan Das** (Lead Tech) — PIN: `1234`
- **Admin** (Manager) — PIN: `0000`

---

## 🚀 2. Full-Stack Service (Render Deployment)

For live real-time synchronization between technician phones using a PostgreSQL database:

### One-Click Deploy on Render:
1. Log in to [Render Dashboard](https://dashboard.render.com/)
2. Click **New +** > **Blueprint**
3. Connect your repository: `https://github.com/supportroyaleyesolar/service`
4. Render automatically reads `render.yaml` and spins up:
   - **Web Service** (Node.js Express running `server.js`)
   - **PostgreSQL Database** (`royal-eye-service-db`)
5. Click **Apply**. Database tables and technicians will be initialized automatically!

---

## 📁 Repository Structure

- `index.html` — Full responsive technician dashboard & punch portal
- `server.js` — Standalone Express server with Postgres & fallback modes
- `serviceTracker.js` — API routes (`/api/service/login`, `/api/service/punches`)
- `002_service_tracker.sql` — PostgreSQL database schema and indexes
- `add-employee.js` — CLI tool to add custom employees
- `render.yaml` — 1-click Render blueprint specification
