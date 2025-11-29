const fs = require('fs-extra');
const path = require('path');
const translate = require('translate-google');

const DATA_DIR = path.resolve('./data');
const BLACKLIST_FILE = path.join(DATA_DIR, 'blacklist.json');
const STRIKES_FILE = path.join(DATA_DIR, 'strikes.json');

// Ensure directories exist
fs.ensureDirSync(DATA_DIR);

// Initialize files
if (!fs.existsSync(BLACKLIST_FILE))
  fs.writeJsonSync(BLACKLIST_FILE, { words: [] }, { spaces: 2 });

if (!fs.existsSync(STRIKES_FILE))
  fs.writeJsonSync(STRIKES_FILE, {}, { spaces: 2 });

let blacklist = new Set(fs.readJsonSync(BLACKLIST_FILE).words.map(w => w.toLowerCase()));
let strikes = fs.readJsonSync(STRIKES_FILE);

function saveBlacklist() {
  fs.writeJsonSync(BLACKLIST_FILE, { words: [...blacklist] }, { spaces: 2 });
}

function saveStrikes() {
  fs.writeJsonSync(STRIKES_FILE, strikes, { spaces: 2 });
}

async function sendModLog(guild, text) {
  const MOD_LOG_CHANNEL = process.env.MOD_LOG_CHANNEL;
  if (!MOD_LOG_CHANNEL) return;
  try {
    const ch = await guild.channels.fetch(MOD_LOG_CHANNEL).catch(() => null);
    if (ch) ch.send(text);
  } catch (e) {}
}

function addStrike(guildId, userId) {
  if (!strikes[guildId]) strikes[guildId] = {};
  strikes[guildId][userId] = (strikes[guildId][userId] || 0) + 1;
  saveStrikes();
  return strikes[guildId][userId];
}

function resetStrikesFor(guildId, userId) {
  if (!strikes[guildId]) return;
  delete strikes[guildId][userId];
  saveStrikes();
}

function getStrikes(guildId, userId) {
  return strikes[guildId]?.[userId] || 0;
}

function matchesBlacklist(text) {
  const lc = text.toLowerCase();
  // Match only whole words, not substrings
  const words = lc.split(/\s+|[.,!?;:\-]/);
  for (const bad of blacklist) {
    for (const word of words) {
      if (word === bad || word.includes(bad)) {
        return bad;
      }
    }
  }
  return null;
}

async function safeTranslate(text) {
  try {
    const translated = await translate(text, { to: 'en' });
    return typeof translated === 'string' ? translated : text;
  } catch {
    return text;
  }
}

function addWord(word) {
  blacklist.add(word.toLowerCase());
  saveBlacklist();
}

function removeWord(word) {
  blacklist.delete(word.toLowerCase());
  saveBlacklist();
}

function getWords() {
  return [...blacklist];
}

module.exports = {
  blacklist,
  strikes,
  saveBlacklist,
  saveStrikes,
  sendModLog,
  addStrike,
  resetStrikesFor,
  getStrikes,
  matchesBlacklist,
  safeTranslate,
  addWord,
  removeWord,
  getWords
};
