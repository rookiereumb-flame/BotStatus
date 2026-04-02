const sqlite3 = require('better-sqlite3');
const db = new sqlite3('security.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY,
    log_channel_id TEXT,
    anti_nuke_enabled INTEGER DEFAULT 1,
    anti_everyone_enabled INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS thresholds (
    guild_id TEXT,
    event_type TEXT,
    limit_count INTEGER DEFAULT 3,
    time_window INTEGER DEFAULT 10000,
    PRIMARY KEY (guild_id, event_type)
  );

  CREATE TABLE IF NOT EXISTS trusted_users (
    guild_id TEXT,
    user_id TEXT,
    level INTEGER,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS role_memory (
    guild_id TEXT,
    user_id TEXT,
    roles TEXT,
    is_suspended INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    guild_id TEXT PRIMARY KEY,
    data TEXT,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS counting (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT,
    enabled INTEGER DEFAULT 0,
    current_count INTEGER DEFAULT 0,
    last_user_id TEXT
  );

  CREATE TABLE IF NOT EXISTS starboard (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT,
    enabled INTEGER DEFAULT 0,
    threshold INTEGER DEFAULT 3
  );

  CREATE TABLE IF NOT EXISTS starboard_posts (
    guild_id TEXT,
    message_id TEXT,
    starboard_message_id TEXT,
    PRIMARY KEY (guild_id, message_id)
  );
`);

module.exports = {
  getGuildConfig: (guildId) => db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId) || {},
  updateLogChannel: (guildId, channelId) => db.prepare('INSERT INTO guild_config (guild_id, log_channel_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET log_channel_id = EXCLUDED.log_channel_id').run(guildId, channelId),

  getThreshold: (guildId, type) => db.prepare('SELECT * FROM thresholds WHERE guild_id = ? AND event_type = ?').get(guildId, type) || { limit_count: 3, time_window: 10000 },
  setThreshold: (guildId, type, limit, window) => db.prepare('INSERT INTO thresholds (guild_id, event_type, limit_count, time_window) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, event_type) DO UPDATE SET limit_count = EXCLUDED.limit_count, time_window = EXCLUDED.time_window').run(guildId, type, limit, window),

  getTrust: (guildId, userId) => db.prepare('SELECT level FROM trusted_users WHERE guild_id = ? AND user_id = ?').get(guildId, userId),
  addTrust: (guildId, userId, level) => db.prepare('INSERT INTO trusted_users (guild_id, user_id, level) VALUES (?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET level = EXCLUDED.level').run(guildId, userId, level),
  removeTrust: (guildId, userId) => db.prepare('DELETE FROM trusted_users WHERE guild_id = ? AND user_id = ?').run(guildId, userId),

  saveRoles: (guildId, userId, roles, suspended = 0) => db.prepare('INSERT INTO role_memory (guild_id, user_id, roles, is_suspended) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET roles = EXCLUDED.roles, is_suspended = EXCLUDED.is_suspended').run(guildId, userId, roles, suspended),
  getRoles: (guildId, userId) => db.prepare('SELECT * FROM role_memory WHERE guild_id = ? AND user_id = ?').get(guildId, userId),

  saveSnapshot: (guildId, data) => db.prepare('INSERT INTO snapshots (guild_id, data, timestamp) VALUES (?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET data = EXCLUDED.data, timestamp = EXCLUDED.timestamp').run(guildId, JSON.stringify(data), Date.now()),
  getSnapshot: (guildId) => db.prepare('SELECT * FROM snapshots WHERE guild_id = ?').get(guildId),

  getCounting: (guildId) => db.prepare('SELECT * FROM counting WHERE guild_id = ?').get(guildId),
  setCounting: (guildId, channelId, enabled) => db.prepare('INSERT INTO counting (guild_id, channel_id, enabled, current_count, last_user_id) VALUES (?, ?, ?, 0, NULL) ON CONFLICT(guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id, enabled = EXCLUDED.enabled').run(guildId, channelId, enabled ? 1 : 0),
  updateCount: (guildId, count, userId) => db.prepare('UPDATE counting SET current_count = ?, last_user_id = ? WHERE guild_id = ?').run(count, userId, guildId),
  resetCount: (guildId) => db.prepare('UPDATE counting SET current_count = 0, last_user_id = NULL WHERE guild_id = ?').run(guildId),

  getStarboard: (guildId) => db.prepare('SELECT * FROM starboard WHERE guild_id = ?').get(guildId),
  setStarboard: (guildId, channelId, enabled, threshold) => db.prepare('INSERT INTO starboard (guild_id, channel_id, enabled, threshold) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id, enabled = EXCLUDED.enabled, threshold = EXCLUDED.threshold').run(guildId, channelId, enabled ? 1 : 0, threshold),
  disableStarboard: (guildId) => db.prepare('UPDATE starboard SET enabled = 0 WHERE guild_id = ?').run(guildId),
  getStarboardPost: (guildId, messageId) => db.prepare('SELECT * FROM starboard_posts WHERE guild_id = ? AND message_id = ?').get(guildId, messageId),
  saveStarboardPost: (guildId, messageId, starboardMessageId) => db.prepare('INSERT OR REPLACE INTO starboard_posts (guild_id, message_id, starboard_message_id) VALUES (?, ?, ?)').run(guildId, messageId, starboardMessageId),
};
