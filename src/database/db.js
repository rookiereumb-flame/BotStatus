const sqlite3 = require('better-sqlite3');
const db = new sqlite3('security.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id         TEXT PRIMARY KEY,
    log_channel_id   TEXT,
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
    guild_id      TEXT PRIMARY KEY,
    channel_id    TEXT,
    enabled       INTEGER DEFAULT 0,
    current_count INTEGER DEFAULT 0,
    last_user_id  TEXT,
    high_score    INTEGER DEFAULT 0,
    count_type    TEXT DEFAULT 'normal'
  );
  CREATE TABLE IF NOT EXISTS starboard (
    guild_id   TEXT PRIMARY KEY,
    channel_id TEXT,
    enabled    INTEGER DEFAULT 0,
    threshold  INTEGER DEFAULT 3,
    emoji      TEXT DEFAULT '⭐'
  );
  CREATE TABLE IF NOT EXISTS starboard_posts (
    guild_id             TEXT,
    message_id           TEXT,
    starboard_message_id TEXT,
    PRIMARY KEY (guild_id, message_id)
  );
  CREATE TABLE IF NOT EXISTS lockdown_backup (
    guild_id   TEXT,
    channel_id TEXT,
    perms_json TEXT,
    PRIMARY KEY (guild_id, channel_id)
  );
  CREATE TABLE IF NOT EXISTS bot_managed_role_perms (
    guild_id    TEXT,
    user_id     TEXT,
    role_id     TEXT,
    permissions TEXT,
    PRIMARY KEY (guild_id, user_id, role_id)
  );
  CREATE TABLE IF NOT EXISTS watchlist (
    guild_id TEXT,
    user_id  TEXT,
    reason   TEXT,
    added_by TEXT,
    added_at INTEGER,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS evidence_locker (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT,
    user_id     TEXT,
    channel_id  TEXT,
    message_id  TEXT,
    content     TEXT,
    attachments TEXT,
    timestamp   INTEGER
  );
  CREATE TABLE IF NOT EXISTS shadow_bans (
    guild_id TEXT,
    user_id  TEXT,
    added_by TEXT,
    reason   TEXT,
    added_at INTEGER,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS staff_actions (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id  TEXT,
    mod_id    TEXT,
    action    TEXT,
    target_id TEXT,
    reason    TEXT,
    timestamp INTEGER
  );
  CREATE TABLE IF NOT EXISTS raid_config (
    guild_id     TEXT PRIMARY KEY,
    enabled      INTEGER DEFAULT 1,
    join_limit   INTEGER DEFAULT 10,
    join_window  INTEGER DEFAULT 30000,
    min_age_days INTEGER DEFAULT 7,
    action       TEXT DEFAULT 'lockdown'
  );
`);

// Safely add new columns to existing tables (no-op if already exist)
const addCol = (table, col, def) => {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch (_) {}
};
addCol('counting', 'high_score',      'INTEGER DEFAULT 0');
addCol('counting', 'count_type',      "TEXT DEFAULT 'normal'");
addCol('starboard', 'emoji',          "TEXT DEFAULT '⭐'");
addCol('guild_config', 'antinuke_enabled', 'INTEGER DEFAULT 1');
addCol('thresholds', 'enabled',       'INTEGER DEFAULT 1');
addCol('guild_config', 'suspend_role_id',  'TEXT');
addCol('guild_config', 'jail_channel_id',  'TEXT');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const upsert = (table, keyCol, keyVal, updates) => {
  db.prepare(`INSERT OR IGNORE INTO ${table} (${keyCol}) VALUES (?)`).run(keyVal);
  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE ${table} SET ${sets} WHERE ${keyCol} = ?`).run(...Object.values(updates), keyVal);
};

module.exports = {
  // Guild config
  getGuildConfig: gid =>
    db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(gid) || {},
  setLogChannel: (gid, cid) =>
    upsert('guild_config', 'guild_id', gid, { log_channel_id: cid }),
  setAntinuke: (gid, val) =>
    upsert('guild_config', 'guild_id', gid, { antinuke_enabled: val }),
  setSuspendConfig: (gid, { roleId = null, channelId = null } = {}) => {
    const updates = {};
    if (roleId    !== undefined) updates.suspend_role_id  = roleId;
    if (channelId !== undefined) updates.jail_channel_id  = channelId;
    if (Object.keys(updates).length) upsert('guild_config', 'guild_id', gid, updates);
  },
  getSuspendConfig: gid => {
    const cfg = db.prepare('SELECT suspend_role_id, jail_channel_id FROM guild_config WHERE guild_id = ?').get(gid);
    return cfg || {};
  },

  // Thresholds
  getThreshold: (gid, type) =>
    db.prepare('SELECT * FROM thresholds WHERE guild_id = ? AND event_type = ?').get(gid, type)
    || { limit_count: 3, time_window: 10000, enabled: 1 },
  setThreshold: (gid, type, limit, windowMs) =>
    db.prepare(`INSERT INTO thresholds (guild_id, event_type, limit_count, time_window, enabled) VALUES (?,?,?,?,1)
      ON CONFLICT(guild_id, event_type) DO UPDATE SET limit_count=excluded.limit_count, time_window=excluded.time_window`)
      .run(gid, type, limit, windowMs),
  setMonitorEnabled: (gid, type, val) => {
    db.prepare(`INSERT OR IGNORE INTO thresholds (guild_id, event_type, limit_count, time_window, enabled) VALUES (?,?,3,10000,?)`).run(gid, type, val);
    db.prepare(`UPDATE thresholds SET enabled=? WHERE guild_id=? AND event_type=?`).run(val, gid, type);
  },
  isMonitorEnabled: (gid, type) => {
    const row = db.prepare('SELECT enabled FROM thresholds WHERE guild_id=? AND event_type=?').get(gid, type);
    return row ? row.enabled !== 0 : true; // default on if no row
  },
  getAllThresholds: gid =>
    db.prepare('SELECT * FROM thresholds WHERE guild_id = ?').all(gid),

  // Trust
  getTrust: (gid, uid) =>
    db.prepare('SELECT * FROM trusted_users WHERE guild_id = ? AND user_id = ?').get(gid, uid),
  addTrust: (gid, uid, level) =>
    db.prepare(`INSERT INTO trusted_users (guild_id, user_id, level) VALUES (?,?,?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET level=excluded.level`).run(gid, uid, level),
  removeTrust: (gid, uid) =>
    db.prepare('DELETE FROM trusted_users WHERE guild_id = ? AND user_id = ?').run(gid, uid),
  listTrust: gid =>
    db.prepare('SELECT * FROM trusted_users WHERE guild_id = ?').all(gid),

  // Role memory
  saveRoles: (gid, uid, roles, suspended = 0) =>
    db.prepare(`INSERT INTO role_memory (guild_id, user_id, roles, is_suspended) VALUES (?,?,?,?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET roles=excluded.roles, is_suspended=excluded.is_suspended`)
      .run(gid, uid, roles, suspended),
  getRoles: (gid, uid) =>
    db.prepare('SELECT * FROM role_memory WHERE guild_id = ? AND user_id = ?').get(gid, uid),
  clearRoles: (gid, uid) =>
    db.prepare('DELETE FROM role_memory WHERE guild_id = ? AND user_id = ?').run(gid, uid),

  // Snapshots
  saveSnapshot: (gid, data) =>
    db.prepare(`INSERT INTO snapshots (guild_id, data, timestamp) VALUES (?,?,?)
      ON CONFLICT(guild_id) DO UPDATE SET data=excluded.data, timestamp=excluded.timestamp`)
      .run(gid, JSON.stringify(data), Date.now()),
  getSnapshot: gid =>
    db.prepare('SELECT * FROM snapshots WHERE guild_id = ?').get(gid),

  // Suspension timers
  setSuspensionTimer: (gid, uid, expiresAt) =>
    db.prepare(`INSERT INTO suspension_timers (guild_id, user_id, expires_at) VALUES (?,?,?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET expires_at=excluded.expires_at`).run(gid, uid, expiresAt),
  deleteSuspensionTimer: (gid, uid) =>
    db.prepare('DELETE FROM suspension_timers WHERE guild_id = ? AND user_id = ?').run(gid, uid),
  getAllSuspensionTimers: () =>
    db.prepare('SELECT * FROM suspension_timers').all(),

  // Counting
  getCounting: gid =>
    db.prepare('SELECT * FROM counting WHERE guild_id = ?').get(gid),
  setCounting: (gid, cid, enabled, type = 'normal') => {
    db.prepare('INSERT OR IGNORE INTO counting (guild_id) VALUES (?)').run(gid);
    db.prepare('UPDATE counting SET channel_id=?, enabled=?, current_count=0, last_user_id=NULL, count_type=? WHERE guild_id=?')
      .run(cid, enabled ? 1 : 0, type, gid);
  },
  updateCount: (gid, count, uid) =>
    db.prepare('UPDATE counting SET current_count=?, last_user_id=?, high_score=MAX(COALESCE(high_score,0),?) WHERE guild_id=?')
      .run(count, uid, count, gid),
  resetCount: gid =>
    db.prepare('UPDATE counting SET current_count=0, last_user_id=NULL WHERE guild_id=?').run(gid),

  // Starboard
  getStarboard: gid =>
    db.prepare('SELECT * FROM starboard WHERE guild_id = ?').get(gid),
  setStarboard: (gid, cid, enabled, threshold, emoji = '⭐') =>
    db.prepare(`INSERT INTO starboard (guild_id, channel_id, enabled, threshold, emoji) VALUES (?,?,?,?,?)
      ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id, enabled=excluded.enabled, threshold=excluded.threshold, emoji=excluded.emoji`)
      .run(gid, cid, enabled ? 1 : 0, threshold, emoji),
  disableStarboard: gid =>
    db.prepare('UPDATE starboard SET enabled=0 WHERE guild_id=?').run(gid),
  getStarboardPost: (gid, mid) =>
    db.prepare('SELECT * FROM starboard_posts WHERE guild_id=? AND message_id=?').get(gid, mid),
  saveStarboardPost: (gid, mid, smid) =>
    db.prepare('INSERT OR REPLACE INTO starboard_posts VALUES (?,?,?)').run(gid, mid, smid),

  // Bot managed role permissions (saved during suspension, restored on unsuspend)
  saveBotManagedPerm: (gid, uid, roleId, perms) =>
    db.prepare(`INSERT INTO bot_managed_role_perms (guild_id, user_id, role_id, permissions) VALUES (?,?,?,?)
      ON CONFLICT(guild_id, user_id, role_id) DO UPDATE SET permissions=excluded.permissions`)
      .run(gid, uid, roleId, perms.toString()),
  getBotManagedPerms: (gid, uid) =>
    db.prepare('SELECT * FROM bot_managed_role_perms WHERE guild_id=? AND user_id=?').all(gid, uid),
  clearBotManagedPerms: (gid, uid) =>
    db.prepare('DELETE FROM bot_managed_role_perms WHERE guild_id=? AND user_id=?').run(gid, uid),

  // Watchlist
  addWatchlist: (gid, uid, reason, addedBy) =>
    db.prepare(`INSERT INTO watchlist (guild_id, user_id, reason, added_by, added_at) VALUES (?,?,?,?,?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET reason=excluded.reason, added_by=excluded.added_by, added_at=excluded.added_at`)
      .run(gid, uid, reason, addedBy, Date.now()),
  removeWatchlist: (gid, uid) =>
    db.prepare('DELETE FROM watchlist WHERE guild_id=? AND user_id=?').run(gid, uid),
  getWatchlist: (gid, uid) =>
    db.prepare('SELECT * FROM watchlist WHERE guild_id=? AND user_id=?').get(gid, uid),
  listWatchlist: gid =>
    db.prepare('SELECT * FROM watchlist WHERE guild_id=?').all(gid),

  // Evidence Locker
  addEvidence: (gid, uid, cid, mid, content, attachments) =>
    db.prepare(`INSERT INTO evidence_locker (guild_id, user_id, channel_id, message_id, content, attachments, timestamp)
      VALUES (?,?,?,?,?,?,?)`)
      .run(gid, uid, cid, mid, content, JSON.stringify(attachments), Date.now()),
  getEvidence: (gid, uid, limit = 10) =>
    db.prepare('SELECT * FROM evidence_locker WHERE guild_id=? AND user_id=? ORDER BY timestamp DESC LIMIT ?').all(gid, uid, limit),
  clearEvidence: (gid, uid) =>
    db.prepare('DELETE FROM evidence_locker WHERE guild_id=? AND user_id=?').run(gid, uid),

  // Shadow Bans
  addShadowBan: (gid, uid, addedBy, reason) =>
    db.prepare(`INSERT INTO shadow_bans (guild_id, user_id, added_by, reason, added_at) VALUES (?,?,?,?,?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET added_by=excluded.added_by, reason=excluded.reason, added_at=excluded.added_at`)
      .run(gid, uid, addedBy, reason, Date.now()),
  removeShadowBan: (gid, uid) =>
    db.prepare('DELETE FROM shadow_bans WHERE guild_id=? AND user_id=?').run(gid, uid),
  isShadowBanned: (gid, uid) =>
    !!db.prepare('SELECT 1 FROM shadow_bans WHERE guild_id=? AND user_id=?').get(gid, uid),
  listShadowBans: gid =>
    db.prepare('SELECT * FROM shadow_bans WHERE guild_id=?').all(gid),

  // Staff Actions
  logStaffAction: (gid, modId, action, targetId, reason) =>
    db.prepare(`INSERT INTO staff_actions (guild_id, mod_id, action, target_id, reason, timestamp)
      VALUES (?,?,?,?,?,?)`)
      .run(gid, modId, action, targetId, reason || 'No reason', Date.now()),
  getStaffActions: (gid, modId = null, limit = 15) => modId
    ? db.prepare('SELECT * FROM staff_actions WHERE guild_id=? AND mod_id=? ORDER BY timestamp DESC LIMIT ?').all(gid, modId, limit)
    : db.prepare('SELECT * FROM staff_actions WHERE guild_id=? ORDER BY timestamp DESC LIMIT ?').all(gid, limit),

  // Raid Config
  getRaidConfig: gid =>
    db.prepare('SELECT * FROM raid_config WHERE guild_id=?').get(gid)
    || { enabled: 1, join_limit: 10, join_window: 30000, min_age_days: 7, action: 'lockdown' },
  setRaidConfig: (gid, cfg) =>
    db.prepare(`INSERT INTO raid_config (guild_id, enabled, join_limit, join_window, min_age_days, action)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled, join_limit=excluded.join_limit,
        join_window=excluded.join_window, min_age_days=excluded.min_age_days, action=excluded.action`)
      .run(gid, cfg.enabled ?? 1, cfg.join_limit ?? 10, cfg.join_window ?? 30000, cfg.min_age_days ?? 7, cfg.action ?? 'lockdown'),

  // Lockdown backup
  saveLockdownBackup: (gid, cid, permsJson) =>
    db.prepare('INSERT OR REPLACE INTO lockdown_backup VALUES (?,?,?)').run(gid, cid, permsJson),
  getLockdownBackups: gid =>
    db.prepare('SELECT * FROM lockdown_backup WHERE guild_id=?').all(gid),
  clearLockdownBackup: gid =>
    db.prepare('DELETE FROM lockdown_backup WHERE guild_id=?').run(gid),
};
