-- GREÑA Live · Dinámicas multistreamer (D1)
-- Aplicar en una migración separada; nunca borrar las tablas de identidad o licencias.
CREATE TABLE IF NOT EXISTS dynamics_rooms (
 id TEXT PRIMARY KEY, host_user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS dynamics_members (
 room_id TEXT NOT NULL, user_id TEXT NOT NULL,
 gamertag TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1,
 joined_at INTEGER NOT NULL,
 PRIMARY KEY(room_id,user_id),
 FOREIGN KEY(room_id) REFERENCES dynamics_rooms(id)
);
CREATE TABLE IF NOT EXISTS dynamics_invitations (
 id TEXT PRIMARY KEY, room_id TEXT NOT NULL,
 sender_id TEXT NOT NULL, recipient_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 FOREIGN KEY(room_id) REFERENCES dynamics_rooms(id)
);
CREATE INDEX IF NOT EXISTS dynamics_invitations_inbox ON dynamics_invitations(recipient_id,status,expires_at);
CREATE TABLE IF NOT EXISTS dynamics_events (
 id TEXT PRIMARY KEY, room_id TEXT NOT NULL, streamer_id TEXT NOT NULL,
 event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL,
 FOREIGN KEY(room_id) REFERENCES dynamics_rooms(id)
);
CREATE INDEX IF NOT EXISTS dynamics_events_by_room ON dynamics_events(room_id,created_at);
CREATE TABLE IF NOT EXISTS dynamics_votes (
 event_id TEXT NOT NULL, streamer_id TEXT NOT NULL,
 platform TEXT NOT NULL, viewer_id TEXT NOT NULL, choice TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(event_id,platform,viewer_id),
 FOREIGN KEY(event_id) REFERENCES dynamics_events(id)
);
