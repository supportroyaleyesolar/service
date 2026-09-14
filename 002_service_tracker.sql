-- Service Punch Tracker — adds employee accounts and service punch log
-- Run this once against your existing Royal Eye Solar tracker database.

CREATE TABLE IF NOT EXISTS employees (
  id            SERIAL PRIMARY KEY,
  full_name     TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_punches (
  id            SERIAL PRIMARY KEY,
  employee_id   INTEGER NOT NULL REFERENCES employees(id),
  location_name TEXT NOT NULL,
  notes         TEXT,
  punched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Speeds up "give me today's punches" and location search
CREATE INDEX IF NOT EXISTS idx_service_punches_punched_at ON service_punches (punched_at);
CREATE INDEX IF NOT EXISTS idx_service_punches_location ON service_punches (lower(location_name));
