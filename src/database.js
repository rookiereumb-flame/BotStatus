const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'bot.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT PRIMARY KEY,
    log_channel_id TEXT,
    lg_log_channel_id TEXT,
    automod_enabled INTEGER DEFAULT 0,
    lgbl_enabled INTEGER DEFAULT 0,
    custom_prefix TEXT,
    prefix_set_timestamp INTEGER
  );
`);

// Add missing columns if they don't exist
try {
  db.prepare('SELECT custom_prefix FROM guild_config LIMIT 1').get();
} catch (e) {
  db.exec(`ALTER TABLE guild_config ADD COLUMN custom_prefix TEXT;`);
}

try {
  db.prepare('SELECT prefix_set_timestamp FROM guild_config LIMIT 1').get();
} catch (e) {
  db.exec(`ALTER TABLE guild_config ADD COLUMN prefix_set_timestamp INTEGER;`);
}

try {
  db.prepare('SELECT lg_log_channel_id FROM guild_config LIMIT 1').get();
} catch (e) {
  db.exec(`ALTER TABLE guild_config ADD COLUMN lg_log_channel_id TEXT;`);
}

try {
  db.prepare('SELECT lgbl_enabled FROM guild_config LIMIT 1').get();
} catch (e) {
  db.exec(`ALTER TABLE guild_config ADD COLUMN lgbl_enabled INTEGER DEFAULT 0;`);
}

db.exec(`

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

  CREATE TABLE IF NOT EXISTS lgbl_words (
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

  CREATE TABLE IF NOT EXISTS anti_spam_settings (
    guild_id TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 0,
    max_messages INTEGER DEFAULT 5,
    time_window INTEGER DEFAULT 10,
    action TEXT DEFAULT 'mute',
    mute_duration INTEGER DEFAULT 300
  );

  CREATE TABLE IF NOT EXISTS spam_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auto_role_settings (
    guild_id TEXT PRIMARY KEY,
    role_id TEXT NOT NULL
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

const setLgLogChannel = (guildId, channelId) => {
  const stmt = db.prepare(`
    INSERT INTO guild_config (guild_id, lg_log_channel_id) 
    VALUES (?, ?) 
    ON CONFLICT(guild_id) DO UPDATE SET lg_log_channel_id = ?
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

const enableLGBL = (guildId) => {
  const stmt = db.prepare(`
    INSERT INTO guild_config (guild_id, lgbl_enabled) 
    VALUES (?, 1) 
    ON CONFLICT(guild_id) DO UPDATE SET lgbl_enabled = 1
  `);
  stmt.run(guildId);
};

const disableLGBL = (guildId) => {
  const stmt = db.prepare(`
    INSERT INTO guild_config (guild_id, lgbl_enabled) 
    VALUES (?, 0) 
    ON CONFLICT(guild_id) DO UPDATE SET lgbl_enabled = 0
  `);
  stmt.run(guildId);
};

const setCustomPrefix = (guildId, prefix) => {
  const stmt = db.prepare(`
    INSERT INTO guild_config (guild_id, custom_prefix, prefix_set_timestamp) 
    VALUES (?, ?, ?) 
    ON CONFLICT(guild_id) DO UPDATE SET custom_prefix = ?, prefix_set_timestamp = ?
  `);
  const now = Date.now();
  stmt.run(guildId, prefix, now, prefix, now);
};

const getCustomPrefix = (guildId) => {
  const stmt = db.prepare('SELECT custom_prefix FROM guild_config WHERE guild_id = ?');
  const result = stmt.get(guildId);
  return result?.custom_prefix || null;
};

const getPrefixCooldown = (guildId) => {
  const stmt = db.prepare('SELECT custom_prefix, prefix_set_timestamp FROM guild_config WHERE guild_id = ?');
  const result = stmt.get(guildId);
  if (!result?.custom_prefix || !result?.prefix_set_timestamp) return null;
  
  const now = Date.now();
  const elapsedMs = now - result.prefix_set_timestamp;
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  const remainingDays = Math.max(0, 30 - elapsedDays);
  
  return {
    prefix: result.custom_prefix,
    setTimestamp: result.prefix_set_timestamp,
    elapsedDays,
    remainingDays,
    canChange: remainingDays === 0
  };
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

const addLgblWord = (guildId, word) => {
  try {
    const stmt = db.prepare('INSERT INTO lgbl_words (guild_id, word) VALUES (?, ?)');
    stmt.run(guildId, word.toLowerCase());
    return true;
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      return false;
    }
    throw error;
  }
};

const removeLgblWord = (guildId, word) => {
  const stmt = db.prepare('DELETE FROM lgbl_words WHERE guild_id = ? AND word = ?');
  const info = stmt.run(guildId, word.toLowerCase());
  return info.changes > 0;
};

const getLgblWords = (guildId) => {
  const stmt = db.prepare('SELECT word FROM lgbl_words WHERE guild_id = ?');
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

const enableAntiSpam = (guildId) => {
  const stmt = db.prepare(`
    INSERT INTO anti_spam_settings (guild_id, enabled) 
    VALUES (?, 1) 
    ON CONFLICT(guild_id) DO UPDATE SET enabled = 1
  `);
  stmt.run(guildId);
};

const disableAntiSpam = (guildId) => {
  const stmt = db.prepare(`
    INSERT INTO anti_spam_settings (guild_id, enabled) 
    VALUES (?, 0) 
    ON CONFLICT(guild_id) DO UPDATE SET enabled = 0
  `);
  stmt.run(guildId);
};

const getAntiSpamConfig = (guildId) => {
  const stmt = db.prepare('SELECT * FROM anti_spam_settings WHERE guild_id = ?');
  return stmt.get(guildId);
};

const setAntiSpamConfig = (guildId, config) => {
  const stmt = db.prepare(`
    INSERT INTO anti_spam_settings (guild_id, enabled, max_messages, time_window, action, mute_duration) 
    VALUES (?, ?, ?, ?, ?, ?) 
    ON CONFLICT(guild_id) DO UPDATE SET enabled = ?, max_messages = ?, time_window = ?, action = ?, mute_duration = ?
  `);
  stmt.run(guildId, config.enabled, config.maxMessages, config.timeWindow, config.action, config.muteDuration, config.enabled, config.maxMessages, config.timeWindow, config.action, config.muteDuration);
};

const trackSpamMessage = (guildId, userId) => {
  const stmt = db.prepare('INSERT INTO spam_tracking (guild_id, user_id, timestamp) VALUES (?, ?, ?)');
  stmt.run(guildId, userId, Date.now());
};

const getRecentMessages = (guildId, userId, windowSeconds) => {
  const stmt = db.prepare('SELECT * FROM spam_tracking WHERE guild_id = ? AND user_id = ? AND timestamp > ? ORDER BY timestamp DESC');
  return stmt.all(guildId, userId, Date.now() - (windowSeconds * 1000));
};

const cleanupSpamTracking = () => {
  const stmt = db.prepare('DELETE FROM spam_tracking WHERE timestamp < ?');
  stmt.run(Date.now() - (3600 * 1000));
};

const setAutoRole = (guildId, roleId) => {
  const stmt = db.prepare(`
    INSERT INTO auto_role_settings (guild_id, role_id) 
    VALUES (?, ?) 
    ON CONFLICT(guild_id) DO UPDATE SET role_id = ?
  `);
  stmt.run(guildId, roleId, roleId);
};

const removeAutoRole = (guildId) => {
  const stmt = db.prepare('DELETE FROM auto_role_settings WHERE guild_id = ?');
  stmt.run(guildId);
};

const getAutoRole = (guildId) => {
  const stmt = db.prepare('SELECT role_id FROM auto_role_settings WHERE guild_id = ?');
  const result = stmt.get(guildId);
  return result?.role_id || null;
};

// Add language_guardian_config table if it doesn't exist
try {
  db.prepare('SELECT * FROM language_guardian_config LIMIT 1').get();
} catch (e) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS language_guardian_config (
      guild_id TEXT PRIMARY KEY,
      strike_limit INTEGER DEFAULT 3,
      timeout_seconds INTEGER DEFAULT 600,
      action TEXT DEFAULT 'mute'
    );
  `);
}

// Add action column if it doesn't exist
try {
  db.prepare('SELECT action FROM language_guardian_config LIMIT 1').get();
} catch (e) {
  db.exec(`ALTER TABLE language_guardian_config ADD COLUMN action TEXT DEFAULT 'mute';`);
}

// Add whitelist tables
try {
  db.prepare('SELECT * FROM whitelist_roles LIMIT 1').get();
} catch (e) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS whitelist_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      UNIQUE(guild_id, role_id)
    );
    
    CREATE TABLE IF NOT EXISTS whitelist_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      UNIQUE(guild_id, user_id)
    );
    
    CREATE TABLE IF NOT EXISTS whitelist_bypass_config (
      guild_id TEXT PRIMARY KEY,
      bypass_anti_spam INTEGER DEFAULT 0,
      bypass_language_guardian INTEGER DEFAULT 0,
      bypass_anti_nuke INTEGER DEFAULT 0,
      bypass_anti_raid INTEGER DEFAULT 0
    );
  `);
}

const setLanguageGuardianConfig = (guildId, config) => {
  const stmt = db.prepare(`
    INSERT INTO language_guardian_config (guild_id, strike_limit, timeout_seconds, action) 
    VALUES (?, ?, ?, ?) 
    ON CONFLICT(guild_id) DO UPDATE SET strike_limit = ?, timeout_seconds = ?, action = ?
  `);
  stmt.run(guildId, config.strikeLimit, config.timeoutSeconds, config.action || 'mute', config.strikeLimit, config.timeoutSeconds, config.action || 'mute');
};

const getLanguageGuardianConfig = (guildId) => {
  const stmt = db.prepare('SELECT * FROM language_guardian_config WHERE guild_id = ?');
  const result = stmt.get(guildId);
  return result || { strikeLimit: 3, timeoutSeconds: 600, action: 'mute' };
};

const addWhitelistRole = (guildId, roleId) => {
  try {
    const stmt = db.prepare('INSERT INTO whitelist_roles (guild_id, role_id) VALUES (?, ?)');
    stmt.run(guildId, roleId);
    return true;
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') return false;
    throw error;
  }
};

const removeWhitelistRole = (guildId, roleId) => {
  const stmt = db.prepare('DELETE FROM whitelist_roles WHERE guild_id = ? AND role_id = ?');
  const info = stmt.run(guildId, roleId);
  return info.changes > 0;
};

const getWhitelistRoles = (guildId) => {
  const stmt = db.prepare('SELECT role_id FROM whitelist_roles WHERE guild_id = ?');
  return stmt.all(guildId).map(row => row.role_id);
};

const addWhitelistMember = (guildId, userId) => {
  try {
    const stmt = db.prepare('INSERT INTO whitelist_members (guild_id, user_id) VALUES (?, ?)');
    stmt.run(guildId, userId);
    return true;
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') return false;
    throw error;
  }
};

const removeWhitelistMember = (guildId, userId) => {
  const stmt = db.prepare('DELETE FROM whitelist_members WHERE guild_id = ? AND user_id = ?');
  const info = stmt.run(guildId, userId);
  return info.changes > 0;
};

const getWhitelistMembers = (guildId) => {
  const stmt = db.prepare('SELECT user_id FROM whitelist_members WHERE guild_id = ?');
  return stmt.all(guildId).map(row => row.user_id);
};

const isUserWhitelisted = (guildId, userId, member, system = null) => {
  const whitelistMembers = getWhitelistMembers(guildId);
  const isWhitelisted = whitelistMembers.includes(userId);
  
  if (!isWhitelisted && member && member.roles) {
    const whitelistRoles = getWhitelistRoles(guildId);
    if (!member.roles.cache.some(role => whitelistRoles.includes(role.id))) {
      return false;
    }
  } else if (!isWhitelisted) {
    return false;
  }
  
  // If user is whitelisted, check if system allows bypass
  if (system) {
    const stmt = db.prepare('SELECT * FROM whitelist_bypass_config WHERE guild_id = ?');
    const config = stmt.get(guildId) || {};
    const bypassKey = `bypass_${system}`;
    return config[bypassKey] === 1;
  }
  
  return true;
};

const setWhitelistBypassConfig = (guildId, config) => {
  const stmt = db.prepare(`
    INSERT INTO whitelist_bypass_config (guild_id, bypass_anti_spam, bypass_language_guardian, bypass_anti_nuke, bypass_anti_raid)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET bypass_anti_spam = ?, bypass_language_guardian = ?, bypass_anti_nuke = ?, bypass_anti_raid = ?
  `);
  stmt.run(guildId, config.bypassAntiSpam || 0, config.bypassLanguageGuardian || 0, config.bypassAntiNuke || 0, config.bypassAntiRaid || 0,
           config.bypassAntiSpam || 0, config.bypassLanguageGuardian || 0, config.bypassAntiNuke || 0, config.bypassAntiRaid || 0);
};

const getWhitelistBypassConfig = (guildId) => {
  const stmt = db.prepare('SELECT * FROM whitelist_bypass_config WHERE guild_id = ?');
  return stmt.get(guildId) || { bypassAntiSpam: 0, bypassLanguageGuardian: 0, bypassAntiNuke: 0, bypassAntiRaid: 0 };
};

// Audit log tracking for server report
try {
  db.prepare('SELECT * FROM audit_logs LIMIT 1').get();
} catch (e) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_category INTEGER NOT NULL,
      action_id TEXT,
      action_name TEXT NOT NULL,
      action_user TEXT,
      action_target TEXT,
      action_timestamp INTEGER NOT NULL,
      action_data TEXT
    );
  `);
}

const addAuditLog = (guildId, actionType, category, actionId, actionName, actionUser, actionTarget, timestamp, data) => {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (guild_id, action_type, action_category, action_id, action_name, action_user, action_target, action_timestamp, action_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(guildId, actionType, category, actionId, actionName, actionUser, actionTarget, timestamp, JSON.stringify(data || {}));
};

const getAuditLogsByTimeRange = (guildId, fromTime, toTime) => {
  const stmt = db.prepare(`
    SELECT * FROM audit_logs 
    WHERE guild_id = ? AND action_timestamp BETWEEN ? AND ?
    ORDER BY action_timestamp DESC
  `);
  return stmt.all(guildId, fromTime, toTime);
};

// Suspend/Suspension system
try {
  db.prepare('SELECT * FROM suspended_users LIMIT 1').get();
} catch (e) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS suspended_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      suspend_role_id TEXT,
      previous_roles TEXT,
      suspend_timestamp INTEGER NOT NULL,
      suspend_reason TEXT,
      UNIQUE(guild_id, user_id)
    );
  `);
}

const suspendUser = (guildId, userId, suspendRoleId, previousRoles, reason) => {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO suspended_users (guild_id, user_id, suspend_role_id, previous_roles, suspend_timestamp, suspend_reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(guildId, userId, suspendRoleId, JSON.stringify(previousRoles || []), Date.now(), reason || '');
};

const unsuspendUser = (guildId, userId) => {
  const stmt = db.prepare('SELECT previous_roles FROM suspended_users WHERE guild_id = ? AND user_id = ?');
  const record = stmt.get(guildId, userId);
  
  const deleteStmt = db.prepare('DELETE FROM suspended_users WHERE guild_id = ? AND user_id = ?');
  deleteStmt.run(guildId, userId);
  
  return record ? JSON.parse(record.previous_roles || '[]') : [];
};

const getSuspendedUsers = (guildId) => {
  const stmt = db.prepare('SELECT * FROM suspended_users WHERE guild_id = ?');
  return stmt.all(guildId);
};

const isUserSuspended = (guildId, userId) => {
  const stmt = db.prepare('SELECT id FROM suspended_users WHERE guild_id = ? AND user_id = ?');
  return stmt.get(guildId, userId) !== undefined;
};

module.exports = {
  db,
  getGuildConfig,
  setLogChannel,
  setLgLogChannel,
  enableAutomod,
  disableAutomod,
  enableLGBL,
  disableLGBL,
  setCustomPrefix,
  getCustomPrefix,
  getPrefixCooldown,
  addWarning,
  getWarnings,
  removeWarning,
  addBlacklistWord,
  removeBlacklistWord,
  getBlacklistWords,
  addLgblWord,
  removeLgblWord,
  getLgblWords,
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
  deleteCase,
  enableAntiSpam,
  disableAntiSpam,
  getAntiSpamConfig,
  setAntiSpamConfig,
  trackSpamMessage,
  getRecentMessages,
  cleanupSpamTracking,
  setAutoRole,
  removeAutoRole,
  getAutoRole,
  setLanguageGuardianConfig,
  getLanguageGuardianConfig,
  addWhitelistRole,
  removeWhitelistRole,
  getWhitelistRoles,
  addWhitelistMember,
  removeWhitelistMember,
  getWhitelistMembers,
  isUserWhitelisted,
  setWhitelistBypassConfig,
  getWhitelistBypassConfig,
  addAuditLog,
  getAuditLogsByTimeRange,
  suspendUser,
  unsuspendUser,
  getSuspendedUsers,
  isUserSuspended
};
