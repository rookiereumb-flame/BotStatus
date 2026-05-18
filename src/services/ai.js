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

// ── NSFW / roast config ───────────────────────────────────────────────────────
const NSFW_KEYWORDS = [
  'porn','pornography','nude','naked','nsfw','hentai','erotic',
  'sex scene','explicit','lewd','xxx','onlyfans','generate nude',
  'naked image','sexual image',
];

const YORUICHI_ROASTS = [
  "Ha! Nice try, kid. That's not happening — not now, not ever.",
  "Really? That's what you're coming at me with? Hard pass.",
  "Bold move. Too bad I'm completely unimpressed.",
  "I've taken down captains bare-handed. You think *that* request rattles me? Absolutely not.",
  "You'd have to be a *lot* more interesting to get that from me. Real questions only.",
];

// ── Persona / system prompt ───────────────────────────────────────────────────
const YORUICHI_SYSTEM = `You are Misa™, a helpful Discord bot assistant. Your job is to give clear, complete, and useful answers — that is always the priority.

You have a light personality inspired by Yoruichi Shihoin from Bleach: confident, direct, and occasionally witty. This should come through subtly in your tone — not constantly, and never at the expense of being helpful. Most of the time you just sound like a smart, friendly assistant. The personality is a hint, not a costume.

Guidelines:
- Be genuinely helpful first, always. Complete every task fully.
- Keep a confident, direct tone — no filler phrases or over-explaining
- Light humor or a casual remark is fine occasionally, but don't force it
- Use Discord markdown (bold, italics, code blocks) where it makes responses clearer

== RULES ==
- Always actually complete the task the user asked for.
- If anyone asks for NSFW, sexual, explicit, or inappropriate content — decline playfully and briefly. No lecture.
- Keep conversational replies concise unless detail is actually needed.`;

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
  return YORUICHI_ROASTS[Math.floor(Math.random() * YORUICHI_ROASTS.length)];
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
  const content   = response.text ?? "I couldn't generate a response. Please try again.";
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
  return { text: accumulated || "I couldn't generate a response. Please try again.", truncated };
}

async function streamInteractionReply(interaction, prompt, systemPrompt, prefix = '', maxTokens = MAX_TOKENS) {
  const { text: finalText, truncated } = await streamGemini(
    prompt,
    async (accumulated) => {
      const display = (prefix + accumulated).slice(0, DISCORD_LIMIT) + '▌';
      await interaction.editReply(display).catch(() => {});
    },
    systemPrompt,
    maxTokens
  );
  const fullText = prefix + finalText + (truncated ? '\n\n*(Response cut short — ask me to continue!)*' : '');
  const chunks   = splitIntoChunks(fullText);
  await interaction.editReply(chunks[0]).catch(() => {});
  const channel = interaction.channel;
  for (let i = 1; i < chunks.length; i++) {
    if (channel && 'send' in channel) await channel.send(chunks[i]).catch(() => {});
  }
}

async function askGeminiWithHistory(channelId, userMessage, username, onChunk) {
  const { ai } = await getAI();
  const history = conversationHistory.get(channelId) ?? [];
  history.push({ role: 'user', content: `${username}: ${userMessage}` });
  if (history.length > 100) history.splice(0, history.length - 100);

  const fullPrompt = history.map(m => `${m.role === 'user' ? '' : 'Assistant: '}${m.content}`).join('\n');
  const systemText = `${YORUICHI_SYSTEM}\n\nConversation so far:\n${fullPrompt}\n\nRespond as Misa:`;

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
    reply     = response.text ?? "I couldn't generate a response.";
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
      systemInstruction: YORUICHI_SYSTEM,
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
  return response.text ?? "Couldn't make out what's in this image.";
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

// ── Continuation thread ───────────────────────────────────────────────────────
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
  YORUICHI_SYSTEM,
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
