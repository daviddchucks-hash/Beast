/* ═══════════════════════════════════════════════════════════════
   Beast AI v3.0 — AI Service Manager (aiServiceManager.js)
   ─────────────────────────────────────────────────────────────
   Single entry-point for all AI requests. Routes to the correct
   provider handler based on PM.getActiveProvider(), handles
   key rotation (OpenRouter), error normalisation, and returns
   a consistent { text, src, error } object to the caller.
   v3.0: Code generation mode — detects code requests and uses
   enhanced system prompt + higher token limits.
   Depends on: PM (providerManager.js), MM (modelManager.js)
   Exposed as global ASM.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

var ASM = (function () {

  var TIMEOUT_MS      = 26000;
  var CODE_TIMEOUT_MS = 55000;  /* code gen needs more time */

  /* ── Helpers ───────────────────────────────────────────── */
  function fetchWithTimeout(url, options, ms) {
    var ctrl = new AbortController();
    var opts = Object.assign({}, options, { signal: ctrl.signal });
    var t = setTimeout(function () { ctrl.abort(); }, ms || TIMEOUT_MS);
    return fetch(url, opts).then(
      function (r) { clearTimeout(t); return r; },
      function (e) { clearTimeout(t); throw e; }
    );
  }

  /* ── Detect code / project generation request ────────── */
  function _isCodeRequest(input) {
    if (window.CodeGen && typeof CodeGen.isCodeRequest === 'function') {
      return CodeGen.isCodeRequest(input);
    }
    return false;
  }

  /* ── Standard system prompt (chat) ──────────────────── */
  function buildSystemPrompt() {
    var now     = new Date();
    var dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    var timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    var prov    = PM.getActiveProviderConfig();
    var model   = MM.getActiveModelInfo();
    return 'You are Beast, a smart and concise AI assistant. Give helpful, direct answers under 150 words unless more detail is needed. ' +
           'Futuristic, confident personality. ' +
           'IMPORTANT: Today\'s date is ' + dateStr + ' and the current time is ' + timeStr + '. ' +
           'Always use this exact date/time for any date/time question — never guess. ' +
           'You are running on ' + prov.name + ' (' + (model ? model.label : MM.getActiveModel()) + ').';
  }

  /* ── Code generation system prompt ──────────────────── */
  function buildCodeSystemPrompt() {
    if (window.CodeGen && typeof CodeGen.buildCodeSystemPrompt === 'function') {
      return CodeGen.buildCodeSystemPrompt();
    }
    return buildSystemPrompt();
  }

  /* Build the messages array for any OpenAI-compatible provider */
  function buildMessages(chatHistory, userInput, isCode) {
    var sysPr = isCode ? buildCodeSystemPrompt() : buildSystemPrompt();
    return [{ role: 'system', content: sysPr }]
      .concat((chatHistory || []).slice(-12))
      .concat([{ role: 'user', content: userInput }])
      .filter(function (m) {
        return m && typeof m.role === 'string' &&
               typeof m.content === 'string' && m.content.trim().length > 0;
      });
  }

  /* ══════════════════════════════════════════════════════════
     PROVIDER: OpenRouter
     Up to 5 API keys — on 429 marks key exhausted (24h) and
     tries the next key. Model cascade: selected → free router.
     ══════════════════════════════════════════════════════════ */
  var _exhausted = {};   /* key → true */

  function _markExhausted(key) {
    _exhausted[key] = true;
    setTimeout(function () { delete _exhausted[key]; }, 24 * 60 * 60 * 1000);
  }

  async function _callOpenRouter(chatHistory, userInput) {
    var kd = PM.getKeys('openrouter');
    var allKeys = kd.keys || [];
    if (!allKeys.length) throw new Error('NO_KEY');

    var isCode  = _isCodeRequest(userInput);
    var maxTok  = isCode ? 4000 : 400;
    var timeOut = isCode ? CODE_TIMEOUT_MS : TIMEOUT_MS;

    /* Primary: user-selected model, then fall back to openrouter/free */
    var selected = MM.getSelectedModel('openrouter');
    var cascade = [selected];
    if (selected !== 'openrouter/free') cascade.push('openrouter/free');
    cascade.push(
      'meta-llama/llama-3.3-70b-instruct:free',
      'deepseek/deepseek-chat:free',
      'mistralai/mistral-7b-instruct:free'
    );
    /* Deduplicate */
    cascade = cascade.filter(function (m, i) { return cascade.indexOf(m) === i; });

    var endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    var referer  = window.location.origin + window.location.pathname;
    var msgs = buildMessages(chatHistory, userInput, isCode);
    var lastErr = null;

    for (var ki = 0; ki < allKeys.length; ki++) {
      var key = allKeys[ki];
      if (_exhausted[key]) continue;

      for (var mi = 0; mi < cascade.length; mi++) {
        var model = cascade[mi];
        console.log('[ASM] OR key#' + (ki + 1) + ' model=' + model + (isCode ? ' [CODE]' : ''));
        try {
          var res = await fetchWithTimeout(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + key,
              'Content-Type': 'application/json',
              'HTTP-Referer': referer,
              'X-Title': 'Beast AI',
            },
            body: JSON.stringify({ model: model, messages: msgs, max_tokens: maxTok, temperature: 0.7 }),
          }, timeOut);

          if (res.status === 429) { _markExhausted(key); lastErr = new Error('QUOTA_EXHAUSTED'); break; }
          if (res.status === 401) { _markExhausted(key); lastErr = new Error('INVALID_KEY'); break; }
          if (res.status === 400 || res.status === 503 || res.status === 529) {
            lastErr = new Error('MODEL_UNAVAILABLE'); continue;
          }
          if (!res.ok) {
            var eb = {}; try { eb = await res.json(); } catch (x) {}
            lastErr = new Error(eb.error ? String(eb.error.message || eb.error).slice(0, 80) : 'HTTP ' + res.status);
            continue;
          }
          var data = await res.json();
          var text = data && data.choices && data.choices[0] &&
                     data.choices[0].message && data.choices[0].message.content;
          if (!text || !text.trim()) { lastErr = new Error('MODEL_UNAVAILABLE'); continue; }
          console.log('[ASM] OR ✓ key#' + (ki + 1) + ' model=' + model);
          return text.trim();
        } catch (e) {
          lastErr = e;
          if (e.message === 'QUOTA_EXHAUSTED' || e.message === 'INVALID_KEY') break;
        }
      }
    }
    /* All keys used */
    var allDone = allKeys.every(function (k) { return !!_exhausted[k]; });
    if (allDone) throw new Error('QUOTA_EXHAUSTED');
    throw lastErr || new Error('OpenRouter unavailable');
  }

  /* ══════════════════════════════════════════════════════════
     PROVIDER: Gemini (native Google AI API — not via OR)
     Uses generateContent REST endpoint.
     ══════════════════════════════════════════════════════════ */
  async function _callGemini(chatHistory, userInput) {
    var kd = PM.getKeys('gemini');
    if (!kd.key) throw new Error('NO_KEY');

    var isCode  = _isCodeRequest(userInput);
    var maxTok  = isCode ? 4000 : 450;
    var timeOut = isCode ? CODE_TIMEOUT_MS : TIMEOUT_MS;

    var modelId  = MM.getSelectedModel('gemini');
    var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' +
                   modelId + ':generateContent?key=' + kd.key;

    /* Convert to Gemini format */
    var systemText = isCode ? buildCodeSystemPrompt() : buildSystemPrompt();
    var contents = [];

    /* Add chat history (skip system messages, they go into systemInstruction) */
    var hist = (chatHistory || []).slice(-12);
    hist.forEach(function (m) {
      if (m.role !== 'system' && m.content && m.content.trim()) {
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        });
      }
    });
    /* Add current user input */
    contents.push({ role: 'user', parts: [{ text: userInput }] });

    /* Gemini requires alternating user/model roles — merge consecutive same-role entries */
    var merged = [];
    contents.forEach(function (c) {
      if (merged.length && merged[merged.length - 1].role === c.role) {
        merged[merged.length - 1].parts[0].text += '\n' + c.parts[0].text;
      } else {
        merged.push({ role: c.role, parts: [{ text: c.parts[0].text }] });
      }
    });
    /* Must start with user role */
    if (merged.length && merged[0].role !== 'user') {
      merged.unshift({ role: 'user', parts: [{ text: '(context)' }] });
    }

    var body = {
      contents: merged,
      systemInstruction: { parts: [{ text: systemText }] },
      generationConfig: { maxOutputTokens: maxTok, temperature: 0.7 },
    };

    var res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, timeOut);

    if (res.status === 401 || res.status === 403) throw new Error('INVALID_KEY');
    if (res.status === 429) throw new Error('QUOTA_EXHAUSTED');
    if (!res.ok) {
      var eb = {}; try { eb = await res.json(); } catch (x) {}
      var msg = eb.error ? (eb.error.message || String(eb.error)).slice(0, 100) : 'HTTP ' + res.status;
      throw new Error('Gemini: ' + msg);
    }

    var data = await res.json();
    /* Handle safety blocks */
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      throw new Error('Gemini blocked: ' + data.promptFeedback.blockReason);
    }
    var text = data && data.candidates && data.candidates[0] &&
               data.candidates[0].content && data.candidates[0].content.parts &&
               data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if (!text || !text.trim()) throw new Error('Gemini returned an empty response');
    return text.trim();
  }

  /* ══════════════════════════════════════════════════════════
     PROVIDER: Groq (OpenAI-compatible REST API)
     ══════════════════════════════════════════════════════════ */
  async function _callGroq(chatHistory, userInput) {
    var kd = PM.getKeys('groq');
    if (!kd.key) throw new Error('NO_KEY');

    var isCode  = _isCodeRequest(userInput);
    var maxTok  = isCode ? 4000 : 400;
    var timeOut = isCode ? CODE_TIMEOUT_MS : TIMEOUT_MS;

    var modelId = MM.getSelectedModel('groq');
    var msgs    = buildMessages(chatHistory, userInput, isCode);

    var res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + kd.key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: modelId, messages: msgs, max_tokens: maxTok, temperature: 0.7 }),
    }, timeOut);

    if (res.status === 401) throw new Error('INVALID_KEY');
    if (res.status === 429) throw new Error('QUOTA_EXHAUSTED');
    if (!res.ok) throw new Error('Groq HTTP ' + res.status);

    var data = await res.json();
    var text = data && data.choices && data.choices[0] &&
               data.choices[0].message && data.choices[0].message.content;
    if (!text || !text.trim()) throw new Error('Groq returned an empty response');
    return text.trim();
  }

  /* ══════════════════════════════════════════════════════════
     PROVIDER: HuggingFace (OpenAI-compatible Inference API)
     ══════════════════════════════════════════════════════════ */
  async function _callHuggingFace(chatHistory, userInput) {
    var kd = PM.getKeys('huggingface');
    if (!kd.key) throw new Error('NO_KEY');

    var isCode  = _isCodeRequest(userInput);
    var maxTok  = isCode ? 3000 : 400;
    var timeOut = isCode ? CODE_TIMEOUT_MS : TIMEOUT_MS;

    var modelId = MM.getSelectedModel('huggingface');
    var msgs    = buildMessages(chatHistory, userInput, isCode);

    var res = await fetchWithTimeout('https://api-inference.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + kd.key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: modelId, messages: msgs, max_tokens: maxTok, temperature: 0.7 }),
    }, timeOut);

    if (res.status === 401 || res.status === 403) throw new Error('INVALID_KEY');
    if (res.status === 429) throw new Error('QUOTA_EXHAUSTED');
    if (!res.ok) throw new Error('HuggingFace HTTP ' + res.status);

    var data = await res.json();
    var text = data && data.choices && data.choices[0] &&
               data.choices[0].message && data.choices[0].message.content;
    if (!text || !text.trim()) throw new Error('HuggingFace returned an empty response');
    return text.trim();
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC: callAI — single entry-point for all AI requests
     Returns: { text: string|null, src: string, error: string|null }
     ══════════════════════════════════════════════════════════ */
  async function callAI(chatHistory, userInput) {
    var provider = PM.getActiveProvider();
    var provName = PM.getActiveProviderConfig().name;
    var isCode   = _isCodeRequest(userInput);
    console.log('[ASM] callAI → provider=' + provider + ' model=' + MM.getActiveModel() + (isCode ? ' [CODE MODE]' : ''));

    try {
      var text;
      switch (provider) {
        case 'openrouter':  text = await _callOpenRouter(chatHistory, userInput);  break;
        case 'gemini':      text = await _callGemini(chatHistory, userInput);      break;
        case 'groq':        text = await _callGroq(chatHistory, userInput);        break;
        case 'huggingface': text = await _callHuggingFace(chatHistory, userInput); break;
        default:            text = await _callOpenRouter(chatHistory, userInput);  break;
      }
      return { text: text, src: provName, error: null };
    } catch (e) {
      console.warn('[ASM] ' + provider + ' error:', e.message);
      return { text: null, src: provName, error: e.message };
    }
  }

  return {
    callAI:            callAI,
    buildSystemPrompt: buildSystemPrompt,
  };
})();
