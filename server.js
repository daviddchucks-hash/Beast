'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

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
const MAX_BODY_SIZE = 1024 * 1024;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const API_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

const SYSTEM_PROMPT = [
  'You are Drexora AI, a helpful, clear, thoughtful general-purpose assistant.',
  'Answer directly and accurately. If the request is ambiguous, ask one concise clarifying question.',
  'Use markdown-style plain text when it improves readability, but do not include unsafe or fabricated claims.',
  'Be honest about uncertainty and never claim to have performed actions you cannot perform.'
].join(' ');

function fallbackFor(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes('plan') || lower.includes('day')) {
    return 'Here is a simple way to make the day feel more intentional:\n\n1. Choose one outcome that would make today feel successful.\n2. Block a quiet 60–90 minute focus window for it.\n3. Group small tasks into one short admin block.\n4. Leave a little space between commitments so the plan can breathe.\n\nStart with the smallest visible step. Momentum usually follows clarity.';
  }
  if (lower.includes('idea') || lower.includes('project')) {
    return 'Let’s explore it together. A good first pass is to list the audience, the problem they keep running into, and the smallest useful version of the solution.\n\nFrom there, we can compare a few directions by effort, usefulness, and what would make the project distinct.';
  }
  if (lower.includes('explain') || lower.includes('learn')) {
    return 'Absolutely. I’ll keep it clear and build from the basics first. Tell me the topic you want to understand, how familiar you are with it, and whether you prefer an analogy, an example, or a step-by-step explanation.';
  }
  if (lower.includes('write') || lower.includes('message')) {
    return 'I can help shape that. Share the rough version, who it is for, and the tone you want — concise, warm, professional, direct, or something else. I’ll turn it into a clear draft while keeping your voice.';
  }
  return 'That’s a thoughtful question. I can help you break it down, compare options, draft something, or turn the idea into a practical next step. What outcome would be most useful to you?';
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function cleanMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
    .slice(-20)
    .map((message) => ({ role: message.role, content: message.content.trim().slice(0, 8000) }))
    .filter((message) => message.content);
}

function extractReply(data) {
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((part) => part && part.text).filter(Boolean).join('').trim();
  return '';
}

async function answerWithAI(messages) {
  if (!OPENAI_API_KEY) {
    return { reply: fallbackFor(messages[messages.length - 1].content), provider: 'local' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        temperature: 0.7,
        max_tokens: 1400
      })
    });
    if (!response.ok) throw new Error(`provider status ${response.status}`);
    const data = await response.json();
    const reply = extractReply(data);
    if (!reply) throw new Error('provider returned no text');
    return { reply, provider: 'openai' };
  } catch (error) {
    console.error(`AI provider request failed (${error.message}); using local fallback.`);
    return {
      reply: fallbackFor(messages[messages.length - 1].content),
      provider: 'local-fallback'
    };
  }
}

async function handleChat(request, response) {
  try {
    const payload = JSON.parse(await readBody(request));
    const messages = cleanMessages(payload.messages);
    const latest = messages[messages.length - 1];
    if (!latest || latest.role !== 'user') {
      return sendJson(response, 400, { error: 'Include at least one user message.' });
    }
    return sendJson(response, 200, await answerWithAI(messages));
  } catch (error) {
    return sendJson(response, error.message === 'Request body too large' ? 413 : 400, {
      error: 'The chat request could not be processed.'
    });
  }
}

function serveStatic(request, response, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendJson(response, 400, { error: 'Invalid URL.' });
  }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(ROOT, `.${requested}`);
  if (!filePath.startsWith(ROOT + path.sep)) return sendJson(response, 403, { error: 'Forbidden.' });
  fs.stat(filePath, (statError, stats) => {
    const target = !statError && stats.isFile() ? filePath : path.join(ROOT, 'index.html');
    fs.readFile(target, (error, data) => {
      if (error) return sendJson(response, 404, { error: 'Not found.' });
      const extension = path.extname(target).toLowerCase();
      const contentTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml'
      };
      response.writeHead(200, { 'Content-Type': contentTypes[extension] || 'application/octet-stream' });
      response.end(data);
    });
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return response.end();
  }
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { ok: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY) });
  }
  if (request.method === 'POST' && url.pathname === '/api/chat') return handleChat(request, response);
  if (request.method === 'GET') return serveStatic(request, response, url);
  return sendJson(response, 405, { error: 'Method not allowed.' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Drexora AI listening on port ${PORT}`);
  console.log(OPENAI_API_KEY ? `AI provider enabled (${MODEL})` : 'No API key configured; local fallback enabled');
});