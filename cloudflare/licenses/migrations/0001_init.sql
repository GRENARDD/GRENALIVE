-- GREÑA Live PRO: registro central persistente (Cloudflare D1).
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,
 username TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 salt TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 registered_at INTEGER NOT NULL,
 last_seen_at INTEGER,
 disabled INTEGER NOT NULL DEFAULT 0,
 license_activated_at INTEGER,
 license_expires_at INTEGER,
 license_device_id TEXT,
 license_revoked_at INTEGER,
 license_code_id TEXT
);
CREATE TABLE IF NOT EXISTS user_sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE TABLE IF NOT EXISTS license_codes (
 id TEXT PRIMARY KEY,
 code_hash TEXT NOT NULL UNIQUE,
 suffix TEXT NOT NULL,
 days INTEGER NOT NULL CHECK(days >= 1 AND days <= 3650),
 created_at INTEGER NOT NULL,
 redeemed_at INTEGER,
 used_by TEXT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS rate_limits (
 key TEXT PRIMARY KEY,
 minute INTEGER NOT NULL,
 hits INTEGER NOT NULL
);
