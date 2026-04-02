const sqlite3 = require('better-sqlite3');
const db = new sqlite3('security.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id       TEXT PRIMARY KEY,
    log_channel_id TEXT,
    antinuke_enabled INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS thresholds (
    guild_id    TEXT,
    event_type  TEXT,
    limit_count INTEGER DEFAULT 3,
    time_window INTEGER DEFAULT 10000,
    PRIMARY KEY (guild_id, event_type)
  );

  CREATE TABLE IF NOT EXISTS trusted_users (
    guild_id TEXT,
    user_id  TEXT,
    level    INTEGER,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS role_memory (
    guild_id     TEXT,
    user_id      TEXT,
    roles        TEXT,
    is_suspended INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    guild_id  TEXT PRIMARY KEY,
    data      TEXT,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS suspension_timers (
    guild_id   TEXT,
    user_id    TEXT,
    expires_at INTEGER,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS counting (
    guild_id     TEXT PRIMARY KEY,
    channel_id   TEXT,
    enabled      INTEGER DEFAULT 0,
    current_count INTEGER DEFAULT 0,
    last_user_id TEXT
  );

  CREATE TABLE IF NOT EXISTS starboard (
    guild_id   TEXT PRIMARY KEY,
    channel_id TEXT,
    enabled    INTEGER DEFAULT 0,
    threshold  INTEGER DEFAULT 3
  );

  CREATE TABLE IF NOT EXISTS starboard_posts (
    guild_id            TEXT,
    message_id          TEXT,
    starboard_message_id TEXT,
    PRIMARY KEY (guild_id, message_id)
  );

  CREATE TABLE IF NOT EXISTS lockdown_backup (
    guild_id   TEXT,
    channel_id TEXT,
    perms_json TEXT,
    PRIMARY KEY (guild_id, channel_id)
  );
`);

module.exports = {
  // Guild config
  getGuildConfig: gid =>
    db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(gid) || {},
  setLogChannel: (gid, cid) =>
    db.prepare('INSERT INTO guild_config (guild_id, log_channel_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET log_channel_id = EXCLUDED.log_channel_id').run(gid, cid),
  setAntinuke: (gid, val) =>
    db.prepare('INSERT INTO guild_config (guild_id, antinuke_enabled) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET antinuke_enabled = EXCLUDED.antinuke_enabled').run(gid, val),

  // Thresholds
  getThreshold: (gid, type) =>
    db.prepare('SELECT * FROM thresholds WHERE guild_id = ? AND event_type = ?').get(gid, type) || { limit_count: 3, time_window: 10000 },
  setThreshold: (gid, type, limit, windowMs) =>
    db.prepare('INSERT INTO thresholds (guild_id, event_type, limit_count, time_window) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, event_type) DO UPDATE SET limit_count = EXCLUDED.limit_count, time_window = EXCLUDED.time_window').run(gid, type, limit, windowMs),
  getAllThresholds: gid =>
    db.prepare('SELECT * FROM thresholds WHERE guild_id = ?').all(gid),

  // Trust
  getTrust: (gid, uid) =>
    db.prepare('SELECT * FROM trusted_users WHERE guild_id = ? AND user_id = ?').get(gid, uid),
  addTrust: (gid, uid, level) =>
    db.prepare('INSERT INTO trusted_users (guild_id, user_id, level) VALUES (?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET level = EXCLUDED.level').run(gid, uid, level),
  removeTrust: (gid, uid) =>
    db.prepare('DELETE FROM trusted_users WHERE guild_id = ? AND user_id = ?').run(gid, uid),
  listTrust: gid =>
    db.prepare('SELECT * FROM trusted_users WHERE guild_id = ?').all(gid),

  // Role memory
  saveRoles: (gid, uid, roles, suspended = 0) =>
    db.prepare('INSERT INTO role_memory (guild_id, user_id, roles, is_suspended) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET roles = EXCLUDED.roles, is_suspended = EXCLUDED.is_suspended').run(gid, uid, roles, suspended),
  getRoles: (gid, uid) =>
    db.prepare('SELECT * FROM role_memory WHERE guild_id = ? AND user_id = ?').get(gid, uid),

  // Snapshots
  saveSnapshot: (gid, data) =>
    db.prepare('INSERT INTO snapshots (guild_id, data, timestamp) VALUES (?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET data = EXCLUDED.data, timestamp = EXCLUDED.timestamp').run(gid, JSON.stringify(data), Date.now()),
  getSnapshot: gid =>
    db.prepare('SELECT * FROM snapshots WHERE guild_id = ?').get(gid),

  // Suspension timers
  setSuspensionTimer: (gid, uid, expiresAt) =>
    db.prepare('INSERT INTO suspension_timers (guild_id, user_id, expires_at) VALUES (?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET expires_at = EXCLUDED.expires_at').run(gid, uid, expiresAt),
  deleteSuspensionTimer: (gid, uid) =>
    db.prepare('DELETE FROM suspension_timers WHERE guild_id = ? AND user_id = ?').run(gid, uid),
  getAllSuspensionTimers: () =>
    db.prepare('SELECT * FROM suspension_timers WHERE expires_at > ?').all(Date.now()),

  // Counting
  getCounting: gid =>
    db.prepare('SELECT * FROM counting WHERE guild_id = ?').get(gid),
  setCounting: (gid, cid, enabled) =>
    db.prepare('INSERT INTO counting (guild_id, channel_id, enabled, current_count, last_user_id) VALUES (?, ?, ?, 0, NULL) ON CONFLICT(guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id, enabled = EXCLUDED.enabled').run(gid, cid, enabled ? 1 : 0),
  updateCount: (gid, count, uid) =>
    db.prepare('UPDATE counting SET current_count = ?, last_user_id = ? WHERE guild_id = ?').run(count, uid, gid),
  resetCount: gid =>
    db.prepare('UPDATE counting SET current_count = 0, last_user_id = NULL WHERE guild_id = ?').run(gid),

  // Starboard
  getStarboard: gid =>
    db.prepare('SELECT * FROM starboard WHERE guild_id = ?').get(gid),
  setStarboard: (gid, cid, enabled, threshold) =>
    db.prepare('INSERT INTO starboard (guild_id, channel_id, enabled, threshold) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id, enabled = EXCLUDED.enabled, threshold = EXCLUDED.threshold').run(gid, cid, enabled ? 1 : 0, threshold),
  disableStarboard: gid =>
    db.prepare('UPDATE starboard SET enabled = 0 WHERE guild_id = ?').run(gid),
  getStarboardPost: (gid, mid) =>
    db.prepare('SELECT * FROM starboard_posts WHERE guild_id = ? AND message_id = ?').get(gid, mid),
  saveStarboardPost: (gid, mid, smid) =>
    db.prepare('INSERT OR REPLACE INTO starboard_posts VALUES (?, ?, ?)').run(gid, mid, smid),

  // Lockdown backup
  saveLockdownBackup: (gid, cid, permsJson) =>
    db.prepare('INSERT OR REPLACE INTO lockdown_backup VALUES (?, ?, ?)').run(gid, cid, permsJson),
  getLockdownBackups: gid =>
    db.prepare('SELECT * FROM lockdown_backup WHERE guild_id = ?').all(gid),
  clearLockdownBackup: gid =>
    db.prepare('DELETE FROM lockdown_backup WHERE guild_id = ?').run(gid),
};
