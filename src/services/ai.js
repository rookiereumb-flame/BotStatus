// ── Lazy ESM loader for @google/genai (ESM-only package in CJS project) ───────
let _ai       = null;
let _Modality = null;

async function getAI() {
  if (!_ai) {
    const mod  = await import('@google/genai');
    _Modality  = mod.Modality;
    _ai        = new mod.GoogleGenAI({
      apiKey:      process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      httpOptions: {
        apiVersion: '',
        baseUrl:    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    });
  }
  return { ai: _ai, Modality: _Modality };
}

const MODEL       = 'gemini-3-flash-preview';
const MODEL_IMAGE = 'gemini-2.5-flash-image';
const MAX_TOKENS  = 8192;

const DISCORD_LIMIT      = 1990;
const STREAM_THROTTLE_MS = 1000;

// ── NSFW config ───────────────────────────────────────────────────────────────
const NSFW_KEYWORDS = [
  'porn','pornography','nude','naked','nsfw','hentai','erotic',
  'sex scene','explicit','lewd','xxx','onlyfans','generate nude',
  'naked image','sexual image',
];

const URAHARA_ROASTS = [
  "Well, well... that's not something I'll be helping with. Try something worth my time.",
  "Hmm. Interesting request. The answer is no — quite decisively, actually.",
  "Ha. Bold move. I've dismantled Hollows with more elegance than that attempt. Moving on.",
  "My hat says no. My cane says no. I say no. That's a clean sweep.",
  "Now, now — even a genius has limits. Mine just happen to be your question. Ask me something real.",
];

// ── beni system prompt — personality + full bot knowledge ────────────────────
const KISUKE_SYSTEM = `You are beni, a Discord security and moderation bot assistant. You're sharp, direct, and helpful above all else — with a calm confidence that makes complex things feel easy.

PERSONALITY:
- Friendly and disarming — casual in tone, clearly capable when it counts
- Analytical and clear — you break things down naturally, no unnecessary complexity
- Helpful ABOVE ALL ELSE — your entire purpose is to genuinely help the user
- Dry wit, light humor — real and measured, never at the expense of being useful
- Direct and confident — no filler, no hedging, no unnecessary preamble

== EVERYTHING BENI CAN DO ==

MODERATION:
• /warn @user [reason] [proof] [dm] — Warning → case + modlog. Optional proof attachment and DM to user.
• /ban @user [reason] [proof] [dm] — Ban → case + modlog. Optional proof attachment and DM.
• /unban <user_id> [reason] — Unban by ID.
• /kick @user [reason] [proof] [dm] — Kick → case + modlog.
• /mute @user [duration] [reason] — Discord timeout. Duration: 10s, 5m, 2h, 1d, 28d max.
• /unmute @user — Remove timeout.
• /suspend @user [duration] [reason] — Strip ALL roles. Applies deny overwrites to every channel. Works on bots too. Optional auto-expire (e.g. 7d).
• /unsuspend @user — Restore all saved roles.
• /lockdown [reason] — Lock every text channel by saving exact overwrites then denying SendMessages for @everyone.
• /unlockdown — Restore exact pre-lockdown state.
• /purge <amount> [@user] — Delete up to 100 messages (<14 days old). Optional user filter.
• /shadow-ban @user [reason] — Messages silently deleted. User has no idea.
• /shadow-unban @user — Lift shadow ban.
• /cases view [case_id|user|mod|type] — Single case by ID, or filter by user/mod/action type (up to 25 results).
• /cases modify <case_id> <field> <value> — Edit reason or duration. Admin only.
• /notes add @user [text] [ai] — Add staff note. Set ai=true and AI drafts a professional note from your brief description.
• /notes remove @user [note_id] — Remove note.
• /notes view @user — View all notes for a user.
• /notes modify @user [note_id] [text] — Edit note content. Admin only.
• /notes delall @user — Delete all notes for a user. Admin only.
• /setlogs #channel [type] — Set log channel. Types: both (default), cases, security.

ANTI-NUKE & SECURITY:
• /antinuke enable|disable|status — Toggle all monitors on/off, or view status + all thresholds.
• /config [type] [limit] [time] — Set thresholds per monitor. E.g. 3 channel deletes in 10s → suspend.
• /setup-suspend [role] [channel] — Create/assign Suspended role + apply deny overwrites to all channels. Optional jail channel.
• /trust add|remove|list [user] [level] — L1=Immune to everything, L2=Immune to anti-nuke only, L3=Bypasses perm checks for mod commands.
• /scan — Full security audit: bots with dangerous perms, dangerous roles, non-owner admins, channel overrides, risk score, AI interpretation.
• /autofeatures enable|disable|status — Toggle individual auto-features.

SECURITY MONITORS (14 total, all auto):
• channel_delete / channel_create / channel_update — threshold → suspend + auto-revert channels on nuke
• role_delete / role_create — threshold → suspend + auto-revert roles on nuke
• role_update — INSTANT if dangerous perms granted (Admin/ManageGuild/ManageRoles/BanMembers/etc.) → revert + suspend
• member_ban / member_kick — threshold → suspend the mod/bot doing it
• webhook_create — deleted instantly + threshold for repeated creation → suspend
• emoji_create / emoji_delete / sticker_create / sticker_delete — threshold → suspend
• vanity_update — INSTANT revert + suspend (no threshold needed)

SNAPSHOTS & REVERT:
• /snapshot — View last saved state (channel/role count, saved at time).
• /revert channels|roles|all — Restore from snapshot with full permission overwrites.
• Auto-saved on startup + every 6 hours.

INTELLIGENCE SYSTEMS:
• /watchlist add|remove|list — Every message from a watched user triggers a silent staff alert in the log channel.
• /evidence view|clear @user — View auto-captured deleted messages for any user.
• /staff-log [mod] — View recent staff actions. Filter by moderator.
• /raid-config set|disable|status — Join-spike detection. Configure limit, window, min account age, action (lockdown/kick/alert).
• Evidence Locker: every deleted server message auto-saved.
• Dynamic slowmode: 12+ msg/10s → 5s slowmode, clears when quiet.
• Raid detection: join spike or fresh-account wave → configured action.

AI COMMANDS:
• /ask [question] — Ask the AI anything. Works in DMs.
• /8ball [question] — Mystical 8-ball (AI-powered).
• /summarize [text] — Summarize any passage.
• /translate [text] [language] — Translate to any language.
• /joke [topic] — Get a joke.
• /story [prompt] — Short story, continues in a thread.
• /poem [topic] [style] — Any style poem.
• /rap [topic] — Rap verse.
• /roleplay [scenario] — AI roleplay in a thread.
• /brainstorm [topic] — Ideas and angles.
• /debate [topic] — Both sides of any argument.
• /dnd [scenario] — D&D adventure (AI = dungeon master, thread).
• /recommend [type] [mood] — Movie/book/game/music picks.
• /remind [time] [message] — Reminder via DM (5m, 2h, 1d etc.).
• /weather [location] — Vibe-based weather.
• /math [problem] — Step-by-step solutions.
• /code [request] [language] — Write, explain, or debug code.
• /poll [topic] — Emoji poll options.
• /trivia [topic] — AI trivia → use /answer to guess.
• /answer [guess] — Submit trivia answer (hints auto-given on wrong guesses).
• /roast @user — Playful roast.
• /fact [topic] — Fascinating fact.
• /quote [topic] — Thought-provoking quote.
• /ship @user1 @user2 — Compatibility reading.
• /imagine [prompt] — AI image generation.
• /vision [url] [question] — Analyze any image URL.
• /enable-chat — AI auto-replies to every message in this channel (Manage Server).
• /disable-chat — Turn off auto-replies.
• /clear-memory — Reset conversation history in this channel.
• Attaching an image while @mentioning beni → auto vision analysis.

FUN & FEATURES:
• /say [message] — Send a message as the bot.
• /counting-toggle [#channel] [type] — Counting game: normal/even/odd/fibonacci/prime.
• /starboard-enable [#channel] [threshold] [emoji] — Enable starboard (default 3 ⭐).
• /starboard-disable — Disable starboard.
• /help [page] — 7 pages of commands with navigation buttons.

TRUST LEVELS:
• L1: Fully immune — no monitor ever fires on them, not even vanity/webhook/@everyone.
• L2: Immune to threshold monitors only — still caught by role_update, vanity, webhook, @everyone.
• L3: Permission bypass — can use mod commands without needing Discord perms.
• Guild owner + role above bot + Admin = treated as L1 automatically.

DURATION FORMAT: 10s · 5m · 2h · 1d · 1w (used in /mute, /suspend, /config, /remind)

== RULES ==
• Always complete the task fully. Being helpful is the absolute priority.
• NSFW or inappropriate content — decline briefly and playfully. No lecture.
• Keep conversational replies concise unless depth is genuinely needed.
• Use Discord markdown (bold, code blocks, bullet points) where it helps clarity.`;

// ── Per-channel state ─────────────────────────────────────────────────────────
const aiChatChannels      = new Set();
const conversationHistory = new Map();
const triviaCache         = new Map();
const activeReminders     = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────
function isNSFW(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return NSFW_KEYWORDS.some(kw => lower.includes(kw));
}

function yoruichiNSFWRoast() {
  return URAHARA_ROASTS[Math.floor(Math.random() * URAHARA_ROASTS.length)];
}

function splitIntoChunks(text, limit = DISCORD_LIMIT) {
  if (!text || text.length <= limit) return [text || ''];
  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    let splitAt = limit;
    const dbl  = remaining.lastIndexOf('\n\n', limit);
    const nl   = remaining.lastIndexOf('\n', limit);
    const sent = Math.max(
      remaining.lastIndexOf('. ', limit),
      remaining.lastIndexOf('! ', limit),
      remaining.lastIndexOf('? ', limit)
    );
    const sp = remaining.lastIndexOf(' ', limit);
    if      (dbl  > limit * 0.5) splitAt = dbl + 2;
    else if (nl   > limit * 0.5) splitAt = nl + 1;
    else if (sent > limit * 0.5) splitAt = sent + 2;
    else if (sp   > limit * 0.5) splitAt = sp + 1;
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

// ── Core Gemini calls ─────────────────────────────────────────────────────────
async function askGemini(prompt, systemPrompt, maxTokens = MAX_TOKENS) {
  const { ai } = await getAI();
  const text   = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const response = await ai.models.generateContent({
    model:    MODEL,
    contents: [{ role: 'user', parts: [{ text }] }],
    config:   { maxOutputTokens: maxTokens },
  });
  const candidate = response.candidates?.[0];
  const content   = response.text ?? "Couldn't generate a response. Try again?";
  if (candidate?.finishReason === 'MAX_TOKENS') {
    return content + '\n\n*(Response may be incomplete — try asking for a shorter version)*';
  }
  return content;
}

async function streamGemini(prompt, onChunk, systemPrompt, maxTokens = MAX_TOKENS) {
  const { ai } = await getAI();
  const text   = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const stream = await ai.models.generateContentStream({
    model:    MODEL,
    contents: [{ role: 'user', parts: [{ text }] }],
    config:   { maxOutputTokens: maxTokens },
  });
  let accumulated = '';
  let lastFlush   = 0;
  let truncated   = false;
  for await (const chunk of stream) {
    accumulated += chunk.text ?? '';
    if (chunk.candidates?.[0]?.finishReason === 'MAX_TOKENS') truncated = true;
    const now = Date.now();
    if (accumulated.length > 15 && now - lastFlush >= STREAM_THROTTLE_MS) {
      lastFlush = now;
      await onChunk(accumulated);
    }
  }
  await onChunk(accumulated);
  return { text: accumulated || "Couldn't generate a response. Try again?", truncated };
}

async function streamInteractionReply(interaction, prompt, systemPrompt, prefix = '', maxTokens = MAX_TOKENS, makeEmbed = null) {
  const { text: finalText, truncated } = await streamGemini(
    prompt,
    async (accumulated) => {
      const display = (prefix + accumulated).slice(0, DISCORD_LIMIT) + '▌';
      await interaction.editReply(display).catch(() => {});
    },
    systemPrompt,
    maxTokens
  );
  const aiText  = finalText + (truncated ? '\n\n*(Cut short — ask me to continue!)*' : '');
  const channel = interaction.channel;
  if (makeEmbed) {
    const chunks = splitIntoChunks(aiText);
    await interaction.editReply({ content: '', embeds: [makeEmbed(chunks[0])] }).catch(() => {});
    for (let i = 1; i < chunks.length; i++) {
      if (channel && 'send' in channel) await channel.send(chunks[i]).catch(() => {});
    }
  } else {
    const chunks = splitIntoChunks(prefix + aiText);
    await interaction.editReply(chunks[0]).catch(() => {});
    for (let i = 1; i < chunks.length; i++) {
      if (channel && 'send' in channel) await channel.send(chunks[i]).catch(() => {});
    }
  }
}

async function askGeminiWithHistory(channelId, userMessage, username, onChunk) {
  const { ai } = await getAI();
  const history = conversationHistory.get(channelId) ?? [];
  history.push({ role: 'user', content: `${username}: ${userMessage}` });
  if (history.length > 100) history.splice(0, history.length - 100);

  const fullPrompt = history.map(m => `${m.role === 'user' ? '' : 'beni: '}${m.content}`).join('\n');
  const systemText = `${KISUKE_SYSTEM}\n\nConversation so far:\n${fullPrompt}\n\nRespond as beni:`;

  let reply;
  let truncated = false;

  if (onChunk) {
    const result = await streamGemini(systemText, onChunk, undefined, MAX_TOKENS);
    reply     = result.text;
    truncated = result.truncated;
  } else {
    const response = await ai.models.generateContent({
      model:    MODEL,
      contents: [{ role: 'user', parts: [{ text: systemText }] }],
      config:   { maxOutputTokens: MAX_TOKENS },
    });
    truncated = response.candidates?.[0]?.finishReason === 'MAX_TOKENS';
    reply     = response.text ?? "Couldn't generate a response.";
  }

  history.push({ role: 'assistant', content: reply });
  conversationHistory.set(channelId, history);
  return { text: reply, truncated };
}

// ── Image analysis ────────────────────────────────────────────────────────────
async function analyzeImage(imageUrl, question) {
  const { ai } = await getAI();
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
  const buffer   = await resp.arrayBuffer();
  const base64   = Buffer.from(buffer).toString('base64');
  const mimeType = (resp.headers.get('content-type') ?? 'image/jpeg').split(';')[0];

  const response = await ai.models.generateContent({
    model: MODEL,
    config: {
      systemInstruction: KISUKE_SYSTEM,
      maxOutputTokens:   MAX_TOKENS,
    },
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: question || 'What do you see in this image? Describe it clearly.' },
      ],
    }],
  });
  return response.text ?? "Couldn't make sense of that image. Interesting...";
}

// ── Image generation ──────────────────────────────────────────────────────────
async function generateAIImage(prompt) {
  try {
    const { ai, Modality } = await getAI();
    const response = await ai.models.generateContent({
      model:    MODEL_IMAGE,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config:   { responseModalities: [Modality.TEXT, Modality.IMAGE] },
    });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return {
          buffer:   Buffer.from(part.inlineData.data, 'base64'),
          mimeType: part.inlineData.mimeType ?? 'image/png',
        };
      }
    }
    return null;
  } catch (err) {
    console.warn('[AI] Image generation failed:', err?.message || err);
    return null;
  }
}

// ── Continuation thread (story/roleplay/dnd) ──────────────────────────────────
async function openContinuationThread(replyMsg, threadName, seedContent, welcome) {
  try {
    if (!('startThread' in replyMsg)) return;
    const thread = await replyMsg.startThread({
      name: threadName.slice(0, 100),
      autoArchiveDuration: 1440,
    });
    conversationHistory.set(thread.id, [{ role: 'assistant', content: seedContent }]);
    aiChatChannels.add(thread.id);
    await thread.send(welcome);
  } catch (_) {}
}

module.exports = {
  aiChatChannels,
  conversationHistory,
  triviaCache,
  activeReminders,
  MODEL,
  MODEL_IMAGE,
  DISCORD_LIMIT,
  STREAM_THROTTLE_MS,
  KISUKE_SYSTEM,
  isNSFW,
  yoruichiNSFWRoast,
  splitIntoChunks,
  askGemini,
  streamGemini,
  streamInteractionReply,
  askGeminiWithHistory,
  analyzeImage,
  generateAIImage,
  openContinuationThread,
};
