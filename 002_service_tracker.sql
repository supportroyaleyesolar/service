-- Service Tracker — employees, service jobs, activity log, heartbeats
-- Safe to re-run: all statements use IF NOT EXISTS

-- ── EMPLOYEES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id            SERIAL PRIMARY KEY,
  full_name     TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── SERVICE JOBS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_jobs (
  id            TEXT PRIMARY KEY,
  date          TEXT NOT NULL,
  title         TEXT NOT NULL,
  location      TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'general',
  priority      TEXT NOT NULL DEFAULT 'medium',
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'open',  -- open | claimed | done
  claimed_by    TEXT,
  claimed_at    BIGINT,
  done_at       BIGINT,
  deleted       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_jobs_date    ON service_jobs (date);
CREATE INDEX IF NOT EXISTS idx_service_jobs_status  ON service_jobs (status);
CREATE INDEX IF NOT EXISTS idx_service_jobs_deleted ON service_jobs (deleted);

-- ── ACTIVITY LOG ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  type       TEXT NOT NULL,   -- punch | complete | release | add
  msg        TEXT NOT NULL,
  ts         BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_date ON activity_log (date);

-- ── HEARTBEATS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS heartbeats (
  employee_id  TEXT PRIMARY KEY,
  last_seen    BIGINT NOT NULL
);

-- ── LEGACY punch log (kept for backward compatibility) ─────────────────────
CREATE TABLE IF NOT EXISTS service_punches (
  id            SERIAL PRIMARY KEY,
  employee_id   INTEGER NOT NULL,
  location_name TEXT NOT NULL,
  notes         TEXT,
  punched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_punches_punched_at ON service_punches (punched_at);
CREATE INDEX IF NOT EXISTS idx_service_punches_location   ON service_punches (lower(location_name));
