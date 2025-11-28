const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'bot.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY,
    log_channel_id TEXT,
    automod_enabled INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    is_manual INTEGER DEFAULT 1,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blacklist_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    word TEXT NOT NULL,
    UNIQUE(guild_id, word)
  );

  CREATE TABLE IF NOT EXISTS anti_nuke_settings (
    guild_id TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 0,
    action TEXT DEFAULT 'ban',
    threshold_channels INTEGER DEFAULT 5,
    threshold_roles INTEGER DEFAULT 5,
    threshold_bans INTEGER DEFAULT 3,
    time_window INTEGER DEFAULT 300,
    log_channel_id TEXT
  );

  CREATE TABLE IF NOT EXISTS anti_raid_settings (
    guild_id TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 0,
    action TEXT DEFAULT 'ban',
    threshold_joins INTEGER DEFAULT 5,
    time_window INTEGER DEFAULT 60,
    log_channel_id TEXT
  );

  CREATE TABLE IF NOT EXISTS join_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS moderation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    action TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cases (
    case_id INTEGER,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT NOT NULL,
    duration INTEGER,
    status TEXT DEFAULT 'active',
    timestamp INTEGER NOT NULL,
    PRIMARY KEY (guild_id, case_id)
  );
`);

const getGuildConfig = (guildId) => {
  const stmt = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
  return stmt.get(guildId);
};

const setLogChannel = (guildId, channelId) => {
  const stmt = db.prepare(`
    INSERT INTO guild_config (guild_id, log_channel_id) 
    VALUES (?, ?) 
    ON CONFLICT(guild_id) DO UPDATE SET log_channel_id = ?
  `);
  stmt.run(guildId, channelId, channelId);
};

const enableAutomod = (guildId) => {
  const stmt = db.prepare(`
    INSERT INTO guild_config (guild_id, automod_enabled) 
    VALUES (?, 1) 
    ON CONFLICT(guild_id) DO UPDATE SET automod_enabled = 1
  `);
  stmt.run(guildId);
};

const disableAutomod = (guildId) => {
  const stmt = db.prepare(`
    INSERT INTO guild_config (guild_id, automod_enabled) 
    VALUES (?, 0) 
    ON CONFLICT(guild_id) DO UPDATE SET automod_enabled = 0
  `);
  stmt.run(guildId);
};

const addWarning = (guildId, userId, moderatorId, reason, isManual = 1) => {
  const stmt = db.prepare(`
    INSERT INTO warnings (guild_id, user_id, moderator_id, reason, is_manual, timestamp) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(guildId, userId, moderatorId, reason, isManual, Date.now());
  return info.lastInsertRowid;
};

const getWarnings = (guildId, userId, onlyManual = true) => {
  let query = 'SELECT * FROM warnings WHERE guild_id = ? AND user_id = ?';
  if (onlyManual) query += ' AND is_manual = 1';
  query += ' ORDER BY timestamp DESC';
  const stmt = db.prepare(query);
  return stmt.all(guildId, userId);
};

const removeWarning = (guildId, userId, warningIndex) => {
  const warnings = getWarnings(guildId, userId);
  if (warningIndex >= 0 && warningIndex < warnings.length) {
    const stmt = db.prepare('DELETE FROM warnings WHERE id = ?');
    stmt.run(warnings[warningIndex].id);
    return true;
  }
  return false;
};

const addBlacklistWord = (guildId, word) => {
  try {
    const stmt = db.prepare('INSERT INTO blacklist_words (guild_id, word) VALUES (?, ?)');
    stmt.run(guildId, word.toLowerCase());
    return true;
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      return false;
    }
    throw error;
  }
};

const removeBlacklistWord = (guildId, word) => {
  const stmt = db.prepare('DELETE FROM blacklist_words WHERE guild_id = ? AND word = ?');
  const info = stmt.run(guildId, word.toLowerCase());
  return info.changes > 0;
};

const getBlacklistWords = (guildId) => {
  const stmt = db.prepare('SELECT word FROM blacklist_words WHERE guild_id = ?');
  return stmt.all(guildId).map(row => row.word);
};

const getAntiNukeConfig = (guildId) => {
  const stmt = db.prepare('SELECT * FROM anti_nuke_settings WHERE guild_id = ?');
  return stmt.get(guildId);
};

const setAntiNukeConfig = (guildId, config) => {
  const stmt = db.prepare(`
    INSERT INTO anti_nuke_settings (guild_id, enabled, action, threshold_channels, threshold_roles, threshold_bans, time_window, log_channel_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
    ON CONFLICT(guild_id) DO UPDATE SET enabled = ?, action = ?, threshold_channels = ?, threshold_roles = ?, threshold_bans = ?, time_window = ?, log_channel_id = ?
  `);
  stmt.run(guildId, config.enabled, config.action, config.thresholdChannels, config.thresholdRoles, config.thresholdBans, config.timeWindow, config.logChannelId, config.enabled, config.action, config.thresholdChannels, config.thresholdRoles, config.thresholdBans, config.timeWindow, config.logChannelId);
};

const getAntiRaidConfig = (guildId) => {
  const stmt = db.prepare('SELECT * FROM anti_raid_settings WHERE guild_id = ?');
  return stmt.get(guildId);
};

const setAntiRaidConfig = (guildId, config) => {
  const stmt = db.prepare(`
    INSERT INTO anti_raid_settings (guild_id, enabled, action, threshold_joins, time_window, log_channel_id) 
    VALUES (?, ?, ?, ?, ?, ?) 
    ON CONFLICT(guild_id) DO UPDATE SET enabled = ?, action = ?, threshold_joins = ?, time_window = ?, log_channel_id = ?
  `);
  stmt.run(guildId, config.enabled, config.action, config.thresholdJoins, config.timeWindow, config.logChannelId, config.enabled, config.action, config.thresholdJoins, config.timeWindow, config.logChannelId);
};

const getNextCaseId = (guildId) => {
  const stmt = db.prepare('SELECT MAX(case_id) as max_id FROM cases WHERE guild_id = ?');
  const result = stmt.get(guildId);
  return (result?.max_id || 0) + 1;
};

const createCase = (guildId, userId, moderatorId, action, reason, duration = null) => {
  const caseId = getNextCaseId(guildId);
  const stmt = db.prepare(`
    INSERT INTO cases (case_id, guild_id, user_id, moderator_id, action, reason, duration, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(caseId, guildId, userId, moderatorId, action, reason, duration, Date.now());
  return caseId;
};

const getCase = (guildId, caseId) => {
  const stmt = db.prepare('SELECT * FROM cases WHERE guild_id = ? AND case_id = ?');
  return stmt.get(guildId, caseId);
};

const getCases = (guildId, userId = null) => {
  let query = 'SELECT * FROM cases WHERE guild_id = ?';
  let params = [guildId];
  if (userId) {
    query += ' AND user_id = ?';
    params.push(userId);
  }
  query += ' ORDER BY case_id DESC';
  const stmt = db.prepare(query);
  return stmt.all(...params);
};

const updateCaseStatus = (guildId, caseId, status) => {
  const stmt = db.prepare('UPDATE cases SET status = ? WHERE guild_id = ? AND case_id = ?');
  stmt.run(status, guildId, caseId);
};

const updateCase = (guildId, caseId, updates) => {
  const allowedFields = ['action', 'reason', 'duration', 'status'];
  const setClause = allowedFields.filter(f => f in updates).map(f => `${f} = ?`).join(', ');
  const values = allowedFields.filter(f => f in updates).map(f => updates[f]);
  if (!setClause) return false;
  
  const stmt = db.prepare(`UPDATE cases SET ${setClause} WHERE guild_id = ? AND case_id = ?`);
  values.push(guildId, caseId);
  const info = stmt.run(...values);
  return info.changes > 0;
};

const deleteCase = (guildId, caseId) => {
  const stmt = db.prepare('DELETE FROM cases WHERE guild_id = ? AND case_id = ?');
  const info = stmt.run(guildId, caseId);
  return info.changes > 0;
};

module.exports = {
  db,
  getGuildConfig,
  setLogChannel,
  enableAutomod,
  disableAutomod,
  addWarning,
  getWarnings,
  removeWarning,
  addBlacklistWord,
  removeBlacklistWord,
  getBlacklistWords,
  getAntiNukeConfig,
  setAntiNukeConfig,
  getAntiRaidConfig,
  setAntiRaidConfig,
  getNextCaseId,
  createCase,
  getCase,
  getCases,
  updateCaseStatus,
  updateCase,
  deleteCase
};
