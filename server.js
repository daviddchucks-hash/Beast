'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');

function loadLocalEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = process.env.OPENROUTER_API_URL || 'https://api.openrouter.ai/v1';
const DEFAULT_AI_MODEL = process.env.DEFAULT_AI_MODEL || 'gpt-4o-mini';
const AI_RATE_LIMIT_PER_MINUTE = Number(process.env.AI_RATE_LIMIT_PER_MINUTE) || 60;
// Allow an opt-in public chat mode (no Firebase auth required) when true.
const PUBLIC_CHAT = String(process.env.PUBLIC_CHAT || '').toLowerCase() === 'true';

const SYSTEM_PROMPT = (process.env.SYSTEM_PROMPT || [
  'You are Drexora AI, a helpful, clear, thoughtful general-purpose assistant.',
  'Answer directly and accurately. If the request is ambiguous, ask one concise clarifying question.',
  'Use markdown-style plain text when it improves readability, but do not include unsafe or fabricated claims.',
  'Be honest about uncertainty and never claim to have performed actions you cannot perform.'
].join(' ')).slice(0, 16000);

// Initialize Firebase Admin if credentials provided
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      }),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
    });
    console.log('Firebase Admin initialized');
  } catch (err) {
    console.error('Failed to initialize Firebase Admin:', err.message);
  }
} else {
  console.warn('Firebase Admin credentials not provided; DB and auth routes disabled');
}

const app = express();
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: FRONTEND_URL }));

// Rate limiting - keyed by user UID when available, otherwise by IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: AI_RATE_LIMIT_PER_MINUTE,
  keyGenerator: (req) => (req.user && req.user.uid) || req.ip,
  standardHeaders: true,
  legacyHeaders: false
});

async function verifyFirebaseToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!admin.apps.length) return next();
  if (!auth || !auth.startsWith('Bearer ')) {
    // allow unauthenticated access to the chat endpoints when PUBLIC_CHAT is enabled
    if (PUBLIC_CHAT && req.path && (req.path.startsWith('/api/ai/chat') || req.path === '/api/chat' || req.path.startsWith('/api/ai/chat/stream'))) {
      return next();
    }
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const idToken = auth.split(' ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = { uid: decoded.uid, claims: decoded };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', aiConfigured: Boolean(OPENROUTER_API_KEY) }));

app.get('/api/ai/models', (req, res) => {
  const envList = (process.env.AVAILABLE_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const models = envList.length ? envList : [DEFAULT_AI_MODEL];
  res.json({ models, defaultModel: DEFAULT_AI_MODEL });
});

async function callOpenRouter(messages, model) {
  if (!OPENROUTER_API_KEY) throw new Error('OpenRouter API key not configured');
  const body = { model: model || DEFAULT_AI_MODEL, messages, temperature: 0.7 };
  const resp = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`OpenRouter request failed: ${resp.status} ${text}`);
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

function sanitizeMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system') && typeof m.content === 'string')
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 12000) }));
}

app.post('/api/ai/chat', verifyFirebaseToken, limiter, async (req, res) => {
  try {
    const { messages, model, conversationId } = req.body || {};
    const userMessages = sanitizeMessages(messages);
    if (!userMessages.length) return res.status(400).json({ error: 'No messages provided' });

    // Fetch relevant memories for the user and include them as system context
    let prepared = [{ role: 'system', content: SYSTEM_PROMPT }];
    if (admin.apps.length && req.user && req.user.uid) {
      try {
        const uid = req.user.uid;
        const memSnap = await admin.database().ref(`users/${uid}/memories`).orderByChild('createdAt').limitToLast(5).once('value');
        const mems = memSnap.val() || {};
        const memList = Object.keys(mems).map((k) => mems[k]).map((m) => m.content).filter(Boolean);
        if (memList.length) {
          prepared.push({ role: 'system', content: 'Relevant memories:\n' + memList.join('\n') });
        }
      } catch (err) {
        console.error('Failed to load memories:', err.message);
      }
    }
    prepared = prepared.concat(userMessages);

    // Call OpenRouter
    let provider = 'local-fallback';
    let reply = '';
    let providerData = null;
    try {
      const data = await callOpenRouter(prepared, model);
      providerData = data;
      // attempt to extract text
      if (data && data.choices && data.choices[0]) {
        reply = (data.choices[0].message && data.choices[0].message.content) || (data.choices[0].text || '');
      }
      provider = 'openrouter';
    } catch (err) {
      console.error('OpenRouter error:', err.message);
      reply = 'I’m having trouble connecting to the AI provider right now.';
    }

    // Persist conversation & usage if Firebase available
    if (admin.apps.length && req.user && req.user.uid) {
      try {
        const uid = req.user.uid;
        const db = admin.database();
        const convRef = conversationId
          ? db.ref(`users/${uid}/conversations/${conversationId}`)
          : db.ref(`users/${uid}/conversations`).push();
        const now = Date.now();
        const update = {
          updatedAt: now,
          model: model || DEFAULT_AI_MODEL
        };
        // if creating new conversation, set title and createdAt
        if (!conversationId) {
          update.createdAt = now;
          update.title = userMessages[0] ? userMessages[0].content.slice(0, 120) : 'New conversation';
        }
        await convRef.update(update);
        // push messages
        const msgsRef = convRef.child('messages');
        await msgsRef.push({ role: 'user', content: userMessages[userMessages.length - 1].content, createdAt: Date.now() });
        await msgsRef.push({ role: 'assistant', content: reply, createdAt: Date.now() });

        // record usage (use provider metadata when available)
        const usageRef = db.ref(`users/${uid}/usage`).push();
        const usageRecord = { conversationId: convRef.key || conversationId, model: model || DEFAULT_AI_MODEL, inputTokens: null, outputTokens: null, totalTokens: null, estimatedCost: null, createdAt: Date.now() };
        if (providerData && providerData.usage) {
          usageRecord.inputTokens = providerData.usage.input_tokens || providerData.usage.prompt_tokens || null;
          usageRecord.outputTokens = providerData.usage.output_tokens || providerData.usage.completion_tokens || null;
          usageRecord.totalTokens = providerData.usage.total_tokens || null;
          if (providerData.usage.estimated_cost) usageRecord.estimatedCost = providerData.usage.estimated_cost;
        }
        await usageRef.set(usageRecord);
      } catch (err) {
        console.error('Failed to persist conversation:', err.message);
      }

      // Simple memory extraction heuristics: save short, explicit statements about the user
      try {
        const lastUser = userMessages[userMessages.length - 1] && userMessages[userMessages.length - 1].content;
        if (lastUser) {
          const match = lastUser.match(/\b(I am|I'm|I\s+work|I\s+like|I\s+love|I\s+build)\b(.{0,200})/i);
          if (match) {
            const memRef = admin.database().ref(`users/${uid}/memories`).push();
            await memRef.set({ content: match[0].slice(0, 500), category: 'auto', importance: 1, createdAt: Date.now(), updatedAt: Date.now() });
          }
        }
      } catch (err) {
        console.error('Memory extraction failed:', err.message);
      }
    }

    return res.json({ reply, provider });
  } catch (err) {
    console.error('Chat handler error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Simple auth info endpoint
app.get('/api/auth/me', verifyFirebaseToken, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  return res.json({ uid: req.user.uid, claims: req.user.claims || {} });
});

// Conversations CRUD
app.get('/api/conversations', verifyFirebaseToken, async (req, res) => {
  if (!admin.apps.length || !req.user) return res.status(501).json({ error: 'Not available' });
  try {
    const uid = req.user.uid;
    const snap = await admin.database().ref(`users/${uid}/conversations`).orderByChild('updatedAt').once('value');
    const items = snap.val() || {};
    const list = Object.keys(items).map((k) => ({ id: k, ...items[k] })).sort((a, b) => b.updatedAt - a.updatedAt);
    res.json({ conversations: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.post('/api/conversations', verifyFirebaseToken, async (req, res) => {
  if (!admin.apps.length || !req.user) return res.status(501).json({ error: 'Not available' });
  try {
    const uid = req.user.uid;
    const { title, model } = req.body || {};
    const now = Date.now();
    const ref = await admin.database().ref(`users/${uid}/conversations`).push({ title: title || 'New conversation', model: model || DEFAULT_AI_MODEL, createdAt: now, updatedAt: now });
    res.json({ id: ref.key });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

app.get('/api/conversations/:id', verifyFirebaseToken, async (req, res) => {
  if (!admin.apps.length || !req.user) return res.status(501).json({ error: 'Not available' });
  try {
    const uid = req.user.uid;
    const id = req.params.id;
    const snap = await admin.database().ref(`users/${uid}/conversations/${id}`).once('value');
    const data = snap.val();
    if (!data) return res.status(404).json({ error: 'Not found' });
    // limit messages returned
    const msgsSnap = await admin.database().ref(`users/${uid}/conversations/${id}/messages`).orderByChild('createdAt').limitToLast(200).once('value');
    const messages = msgsSnap.val() || {};
    const list = Object.keys(messages).map((k) => ({ id: k, ...messages[k] }));
    res.json({ id, ...data, messages: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

app.patch('/api/conversations/:id', verifyFirebaseToken, async (req, res) => {
  if (!admin.apps.length || !req.user) return res.status(501).json({ error: 'Not available' });
  try {
    const uid = req.user.uid;
    const id = req.params.id;
    const update = req.body || {};
    update.updatedAt = Date.now();
    await admin.database().ref(`users/${uid}/conversations/${id}`).update(update);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update' });
  }
});

app.delete('/api/conversations/:id', verifyFirebaseToken, async (req, res) => {
  if (!admin.apps.length || !req.user) return res.status(501).json({ error: 'Not available' });
  try {
    const uid = req.user.uid;
    const id = req.params.id;
    await admin.database().ref(`users/${uid}/conversations/${id}`).remove();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// Memories
app.get('/api/memory', verifyFirebaseToken, async (req, res) => {
  if (!admin.apps.length || !req.user) return res.status(501).json({ error: 'Not available' });
  try {
    const uid = req.user.uid;
    const snap = await admin.database().ref(`users/${uid}/memories`).orderByChild('createdAt').once('value');
    const data = snap.val() || {};
    const list = Object.keys(data).map((k) => ({ id: k, ...data[k] }));
    res.json({ memories: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch memories' });
  }
});

app.delete('/api/memory/:id', verifyFirebaseToken, async (req, res) => {
  if (!admin.apps.length || !req.user) return res.status(501).json({ error: 'Not available' });
  try {
    const uid = req.user.uid;
    const id = req.params.id;
    await admin.database().ref(`users/${uid}/memories/${id}`).remove();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

app.delete('/api/memory', verifyFirebaseToken, async (req, res) => {
  if (!admin.apps.length || !req.user) return res.status(501).json({ error: 'Not available' });
  try {
    const uid = req.user.uid;
    await admin.database().ref(`users/${uid}/memories`).remove();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear memories' });
  }
});

// Settings
app.get('/api/settings', verifyFirebaseToken, async (req, res) => {
  if (!admin.apps.length || !req.user) return res.status(501).json({ error: 'Not available' });
  try {
    const uid = req.user.uid;
    const snap = await admin.database().ref(`users/${uid}/settings`).once('value');
    res.json({ settings: snap.val() || {} });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.patch('/api/settings', verifyFirebaseToken, async (req, res) => {
  if (!admin.apps.length || !req.user) return res.status(501).json({ error: 'Not available' });
  try {
    const uid = req.user.uid;
    await admin.database().ref(`users/${uid}/settings`).update(req.body || {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Usage
app.get('/api/usage', verifyFirebaseToken, async (req, res) => {
  if (!admin.apps.length || !req.user) return res.status(501).json({ error: 'Not available' });
  try {
    const uid = req.user.uid;
    const snap = await admin.database().ref(`users/${uid}/usage`).orderByChild('createdAt').limitToLast(200).once('value');
    const data = snap.val() || {};
    const list = Object.keys(data).map((k) => ({ id: k, ...data[k] }));
    res.json({ usage: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// Serve static frontend
app.use(express.static(ROOT));
app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Drexora AI (Express) listening on port ${PORT}`);
  console.log(OPENROUTER_API_KEY ? `OpenRouter enabled (${DEFAULT_AI_MODEL})` : 'No OpenRouter key configured; AI calls will fail');
});

// Backwards-compatible route used by older frontends
app.post('/api/chat', verifyFirebaseToken, limiter, async (req, res) => {
  // reuse the same handler logic by calling the /api/ai/chat handler
  try {
    // delegate by calling the same logic inline
    const { messages, model, conversationId } = req.body || {};
    const userMessages = sanitizeMessages(messages);
    if (!userMessages.length) return res.status(400).json({ error: 'No messages provided' });
    // Fetch relevant memories and include them
    let prepared = [{ role: 'system', content: SYSTEM_PROMPT }];
    if (admin.apps.length && req.user && req.user.uid) {
      try {
        const uid = req.user.uid;
        const memSnap = await admin.database().ref(`users/${uid}/memories`).orderByChild('createdAt').limitToLast(5).once('value');
        const mems = memSnap.val() || {};
        const memList = Object.keys(mems).map((k) => mems[k]).map((m) => m.content).filter(Boolean);
        if (memList.length) prepared.push({ role: 'system', content: 'Relevant memories:\n' + memList.join('\n') });
      } catch (err) { console.error('Failed to load memories (stream):', err.message); }
    }
    prepared = prepared.concat(userMessages);
    let provider = 'local-fallback';
    let reply = '';
    let providerData = null;
    try {
      const data = await callOpenRouter(prepared, model);
      providerData = data;
      if (data && data.choices && data.choices[0]) {
        reply = (data.choices[0].message && data.choices[0].message.content) || (data.choices[0].text || '');
      }
      provider = 'openrouter';
    } catch (err) {
      console.error('OpenRouter error:', err.message);
      reply = 'I’m having trouble connecting to the AI provider right now.';
    }
    if (admin.apps.length && req.user && req.user.uid) {
      try {
        const uid = req.user.uid;
        const db = admin.database();
        const convRef = conversationId
          ? db.ref(`users/${uid}/conversations/${conversationId}`)
          : db.ref(`users/${uid}/conversations`).push();
        const now = Date.now();
        const update = { updatedAt: now, model: model || DEFAULT_AI_MODEL };
        if (!conversationId) { update.createdAt = now; update.title = userMessages[0] ? userMessages[0].content.slice(0, 120) : 'New conversation'; }
        await convRef.update(update);
        const msgsRef = convRef.child('messages');
        await msgsRef.push({ role: 'user', content: userMessages[userMessages.length - 1].content, createdAt: Date.now() });
        await msgsRef.push({ role: 'assistant', content: reply, createdAt: Date.now() });
        const usageRef = db.ref(`users/${uid}/usage`).push();
        const usageRecord = { conversationId: convRef.key || conversationId, model: model || DEFAULT_AI_MODEL, inputTokens: null, outputTokens: null, totalTokens: null, estimatedCost: null, createdAt: Date.now() };
        if (providerData && providerData.usage) {
          usageRecord.inputTokens = providerData.usage.input_tokens || providerData.usage.prompt_tokens || null;
          usageRecord.outputTokens = providerData.usage.output_tokens || providerData.usage.completion_tokens || null;
          usageRecord.totalTokens = providerData.usage.total_tokens || null;
          if (providerData.usage.estimated_cost) usageRecord.estimatedCost = providerData.usage.estimated_cost;
        }
        await usageRef.set(usageRecord);
      } catch (err) {
        console.error('Failed to persist conversation:', err.message);
      }
    }
    return res.json({ reply, provider });
  } catch (err) {
    console.error('Chat handler error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Streaming chat endpoint (SSE-style chunks). If provider streaming is available, replace simulation with provider stream.
app.post('/api/ai/chat/stream', verifyFirebaseToken, limiter, async (req, res) => {
  try {
    const { messages, model, conversationId } = req.body || {};
    const userMessages = sanitizeMessages(messages);
    if (!userMessages.length) return res.status(400).json({ error: 'No messages provided' });
    const prepared = [{ role: 'system', content: SYSTEM_PROMPT }, ...userMessages];

    // Call provider (single response) and then stream it back in chunks to the client.
    let providerData = null;
    let fullReply = '';
    try {
      const data = await callOpenRouter(prepared, model);
      providerData = data;
      if (data && data.choices && data.choices[0]) {
        fullReply = (data.choices[0].message && data.choices[0].message.content) || (data.choices[0].text || '');
      }
    } catch (err) {
      console.error('OpenRouter error:', err.message);
      fullReply = 'I’m having trouble connecting to the AI provider right now.';
    }

    // Persist messages as usual (fire-and-forget)
    if (admin.apps.length && req.user && req.user.uid) {
      (async () => {
        try {
          const uid = req.user.uid;
          const db = admin.database();
          const convRef = conversationId
            ? db.ref(`users/${uid}/conversations/${conversationId}`)
            : db.ref(`users/${uid}/conversations`).push();
          const now = Date.now();
          const update = { updatedAt: now, model: model || DEFAULT_AI_MODEL };
          if (!conversationId) { update.createdAt = now; update.title = userMessages[0] ? userMessages[0].content.slice(0, 120) : 'New conversation'; }
          await convRef.update(update);
          const msgsRef = convRef.child('messages');
          await msgsRef.push({ role: 'user', content: userMessages[userMessages.length - 1].content, createdAt: Date.now() });
          await msgsRef.push({ role: 'assistant', content: fullReply, createdAt: Date.now() });
          const usageRef = db.ref(`users/${uid}/usage`).push();
          const usageRecord = { conversationId: convRef.key || conversationId, model: model || DEFAULT_AI_MODEL, inputTokens: null, outputTokens: null, totalTokens: null, estimatedCost: null, createdAt: Date.now() };
          if (providerData && providerData.usage) {
            usageRecord.inputTokens = providerData.usage.input_tokens || providerData.usage.prompt_tokens || null;
            usageRecord.outputTokens = providerData.usage.output_tokens || providerData.usage.completion_tokens || null;
            usageRecord.totalTokens = providerData.usage.total_tokens || null;
            if (providerData.usage.estimated_cost) usageRecord.estimatedCost = providerData.usage.estimated_cost;
          }
          await usageRef.set(usageRecord);
        } catch (err) {
          console.error('Failed to persist conversation (stream):', err.message);
        }
        // Simple memory extraction
        try {
          const lastUser = userMessages[userMessages.length - 1] && userMessages[userMessages.length - 1].content;
          if (lastUser) {
            const match = lastUser.match(/\b(I am|I'm|I\s+work|I\s+like|I\s+love|I\s+build)\b(.{0,200})/i);
            if (match) {
              const memRef = admin.database().ref(`users/${uid}/memories`).push();
              await memRef.set({ content: match[0].slice(0, 500), category: 'auto', importance: 1, createdAt: Date.now(), updatedAt: Date.now() });
            }
          }
        } catch (err) { console.error('Memory extraction failed (stream):', err.message); }
      })();
    }

    // Stream reply back to client using SSE-style text/event-stream
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive'
    });

    // Send an initial ping
    res.write('event: meta\n');
    res.write('data: {"status":"ok"}\n\n');

    // Simulate streaming by splitting reply into chunks
    const chunkSize = 80;
    for (let i = 0; i < fullReply.length; i += chunkSize) {
      const chunk = fullReply.slice(i, i + chunkSize);
      res.write('data: ' + JSON.stringify({ delta: chunk }) + '\n\n');
      // small delay between chunks to give streaming effect
      await new Promise((r) => setTimeout(r, 50));
    }

    // final end event
    res.write('event: done\n');
    res.write('data: {"ok":true}\n\n');
    res.end();
  } catch (err) {
    console.error('Stream handler error:', err.message);
    try { res.status(500).json({ error: 'Stream error' }); } catch (e) {}
  }
});