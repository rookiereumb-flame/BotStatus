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
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blacklist_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    word TEXT NOT NULL,
    UNIQUE(guild_id, word)
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

const addWarning = (guildId, userId, moderatorId, reason) => {
  const stmt = db.prepare(`
    INSERT INTO warnings (guild_id, user_id, moderator_id, reason, timestamp) 
    VALUES (?, ?, ?, ?, ?)
  `);
  const info = stmt.run(guildId, userId, moderatorId, reason, Date.now());
  return info.lastInsertRowid;
};

const getWarnings = (guildId, userId) => {
  const stmt = db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC');
  return stmt.all(guildId, userId);
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

module.exports = {
  db,
  getGuildConfig,
  setLogChannel,
  enableAutomod,
  disableAutomod,
  addWarning,
  getWarnings,
  addBlacklistWord,
  removeBlacklistWord,
  getBlacklistWords
};
