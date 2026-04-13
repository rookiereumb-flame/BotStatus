// ─── AutoMod Suspicion Score Engine ──────────────────────────────────────────
// Behavior-based moderation. Scores are purely in-memory (fast + lightweight).
// Config (enabled, thresholds, link whitelist) is read from DB per message.
// AI scores can be injected externally via addExternalScore() when AI is added later.

const { PermissionFlagsBits } = require('discord.js');

// ── In-memory state ───────────────────────────────────────────────────────────
const _scores    = new Map(); // `${gid}:${uid}` → { score, escalation }
const _msgHist   = new Map(); // `${gid}:${uid}` → [{ content, ts }]
const _burst     = new Map(); // `${gid}:${uid}` → [timestamps]
const _mentions  = new Map(); // `${gid}:${mid}` → { uid, count, ts }

// ── Tunable constants ─────────────────────────────────────────────────────────
const BURST_LIMIT    = 5;        // messages within BURST_WINDOW before flagging
const BURST_WINDOW   = 3_000;    // ms
const DECAY_INTERVAL = 60_000;   // ms between score decay ticks
const DECAY_AMOUNT   = 1;        // points removed per tick
const MUTE_DURATION  = 60_000;   // 60s Discord timeout

const DEFAULT_WARN = 5;
const DEFAULT_MUTE = 8;
const DEFAULT_KICK = 12;

const LINK_RE   = /https?:\/\/\S+/i;
const INVITE_RE = /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/\S+/i;

// ── Score decay — runs every 60s, lightweight, no guild polling ───────────────
setInterval(() => {
  for (const [key, data] of _scores) {
    data.score = Math.max(0, data.score - DECAY_AMOUNT);
    if (data.score === 0) _scores.delete(key);
  }
}, DECAY_INTERVAL);

// ── Internal helpers ──────────────────────────────────────────────────────────
function getScore(gid, uid) {
  const key = `${gid}:${uid}`;
  if (!_scores.has(key)) _scores.set(key, { score: 0, escalation: 0 });
  return _scores.get(key);
}

function addScore(gid, uid, pts) {
  const d = getScore(gid, uid);
  d.score += pts;
  return d;
}

// Moderators (ManageMessages+) are immune to automod
function isImmune(member) {
  return member.permissions.has(PermissionFlagsBits.ManageMessages);
}

// Fast positional similarity — avoids heavy Levenshtein on long strings
function isSimilar(a, b) {
  if (!a || !b || a.length < 8 || b.length < 8) return false;
  if (Math.abs(a.length - b.length) > a.length * 0.4) return false;
  const len = Math.min(a.length, b.length, 60);
  let matches = 0;
  for (let i = 0; i < len; i++) if (a[i] === b[i]) matches++;
  return matches / len > 0.8;
}

// ── Main analyze function (call from messageCreate) ───────────────────────────
async function analyze(message, cfg, sendLog, securityEmbed) {
  const { guild, author, channel, content = '', mentions, member } = message;
  if (!member || isImmune(member)) return;

  const gid = guild.id;
  const uid = author.id;
  const now = Date.now();
  const key = `${gid}:${uid}`;

  let added   = 0;
  const flags = [];

  // ── 1. Burst detection ─────────────────────────────────────────────────────
  if (!_burst.has(key)) _burst.set(key, []);
  const burstArr = _burst.get(key).filter(t => t > now - BURST_WINDOW);
  burstArr.push(now);
  _burst.set(key, burstArr);
  if (burstArr.length >= BURST_LIMIT) { added += 2; flags.push('message burst'); }

  // ── 2. Duplicate / pattern spam ────────────────────────────────────────────
  if (!_msgHist.has(key)) _msgHist.set(key, []);
  const hist = _msgHist.get(key).filter(m => m.ts > now - 30_000);

  if (content.length >= 5) {
    if (hist.some(m => m.content === content)) {
      added += 2; flags.push('duplicate message');
    } else if (hist.some(m => isSimilar(m.content, content))) {
      added += 2; flags.push('pattern spam');
    }
  }
  hist.push({ content: content.slice(0, 120), ts: now });
  _msgHist.set(key, hist.slice(-10)); // keep last 10

  // ── 3. Excessive caps (>70% caps, length > 8) ─────────────────────────────
  if (content.length > 8) {
    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (letters.length > 5 && (content.match(/[A-Z]/g) || []).length / letters.length > 0.7) {
      added += 1; flags.push('excessive caps');
    }
  }

  // ── 4. Link / invite detection ────────────────────────────────────────────
  if (LINK_RE.test(content) || INVITE_RE.test(content)) {
    const whitelist = cfg?.link_whitelist ? cfg.link_whitelist.split(',').map(s => s.trim()) : [];
    const safe = whitelist.some(w => content.toLowerCase().includes(w.toLowerCase()));
    if (!safe) { added += 3; flags.push('link/invite'); }
  }

  // ── 5. Mass mentions (3+ @user, not @everyone) ────────────────────────────
  const mentionCount = mentions.users.size;
  if (mentionCount >= 3 && !mentions.everyone) {
    added += 4; flags.push(`mass mention (${mentionCount})`);
  }

  // Track message for ghost ping detection (mentionDelete cross-reference)
  if (mentionCount > 0 && !mentions.everyone) {
    _mentions.set(`${gid}:${message.id}`, { uid, count: mentionCount, ts: now });
    setTimeout(() => _mentions.delete(`${gid}:${message.id}`), 30_000);
  }

  if (!added) return;

  const data = addScore(gid, uid, added);
  const warn = cfg?.warn_score ?? DEFAULT_WARN;
  const mute = cfg?.mute_score ?? DEFAULT_MUTE;
  const kick = cfg?.kick_score ?? DEFAULT_KICK;

  let action = null;
  if (data.score >= kick)      action = 'kick';
  else if (data.score >= mute) action = 'mute';
  else if (data.score >= warn) action = 'warn';

  await sendLog(guild, securityEmbed(0xf39c12,
    `⚠️ AutoMod: ${author.username}`,
    [
      ['Member',  `<@${uid}> [${author.tag}]`],
      ['Channel', `<#${channel.id}>`],
      ['Flags',   flags.join(', ')],
      ['Score',   `+${added} → **${data.score}** total`],
      ['Action',  action ? `**${action.toUpperCase()}**` : 'monitoring']
    ]
  ));

  if (!action) return;
  data.escalation++;

  if (action === 'warn') {
    await channel.send({
      content: `⚠️ <@${uid}>, slow down — AutoMod has flagged your messages. (score: ${data.score})`,
      allowedMentions: { users: [uid] }
    }).catch(() => {});

  } else if (action === 'mute') {
    await member.timeout(MUTE_DURATION, `AutoMod: ${flags.join(', ')}`).catch(() => {});
    await channel.send({
      content: `🔇 <@${uid}> has been muted for 60s by AutoMod. (score: ${data.score})`,
      allowedMentions: { users: [uid] }
    }).catch(() => {});

  } else if (action === 'kick') {
    await channel.send({
      content: `👟 <@${uid}> was removed by AutoMod. (score: ${data.score})`,
      allowedMentions: { users: [uid] }
    }).catch(() => {});
    await member.kick(`AutoMod: ${flags.join(', ')}`).catch(() => {});
  }
}

// ── Ghost ping detection (call from messageDelete) ────────────────────────────
async function onDelete(message, sendLog, securityEmbed) {
  if (!message.guild || !message.author || message.author.bot) return;
  const tracked = _mentions.get(`${message.guild.id}:${message.id}`);
  if (!tracked) return;
  _mentions.delete(`${message.guild.id}:${message.id}`);

  const data = addScore(message.guild.id, message.author.id, 3);
  await sendLog(message.guild, securityEmbed(0xe67e22,
    `👻 Ghost Ping: ${message.author.username}`,
    [
      ['Member',   `<@${message.author.id}> [${message.author.tag}]`],
      ['Channel',  `<#${message.channel.id}>`],
      ['Mentions', `${tracked.count} user(s) pinged then deleted`],
      ['Score',    `+3 → **${data.score}** total`]
    ]
  ));
}

// ── External score injection (reserved for AI integration later) ──────────────
function addExternalScore(gid, uid, pts, label) {
  return addScore(gid, uid, pts);
}

function getScoreData(gid, uid) {
  return _scores.get(`${gid}:${uid}`) || { score: 0, escalation: 0 };
}

function resetScore(gid, uid) {
  const key = `${gid}:${uid}`;
  _scores.delete(key);
  _msgHist.delete(key);
  _burst.delete(key);
}

module.exports = { analyze, onDelete, addExternalScore, getScoreData, resetScore };
