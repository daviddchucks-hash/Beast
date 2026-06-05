/* ═══════════════════════════════════════════════════════════════
   Beast AI v2.5 — Model Manager (modelManager.js)
   ─────────────────────────────────────────────────────────────
   Manages: model catalogue per provider, selected model per
   provider, persistence in localStorage.
   Depends on: PM (providerManager.js must load first)
   Exposed as global MM.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

var MM = (function () {

  /* ── Model catalogue ───────────────────────────────────── */
  var MODELS = {
    openrouter: [
      { id: 'openrouter/free',                         label: 'Auto (Free Router)',   desc: 'Best available free model right now' },
      { id: 'openai/gpt-4o-mini',                      label: 'GPT-4o Mini',          desc: 'OpenAI — fast, smart, affordable' },
      { id: 'anthropic/claude-sonnet-4',               label: 'Claude Sonnet 4',      desc: 'Anthropic — nuanced, thoughtful' },
      { id: 'google/gemini-2.0-flash-001',             label: 'Gemini 2.0 Flash',     desc: 'Google — fast multimodal model' },
      { id: 'deepseek/deepseek-chat:free',             label: 'DeepSeek Chat ✦',      desc: 'Strong reasoning (free tier)' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B ✦',     desc: "Meta's open-source flagship (free)" },
      { id: 'mistralai/mistral-7b-instruct:free',     label: 'Mistral 7B ✦',         desc: 'Efficient & fast (free tier)' },
    ],
    gemini: [
      { id: 'gemini-2.0-flash',       label: 'Gemini 2.0 Flash',      desc: 'Fastest — great for chat' },
      { id: 'gemini-2.0-flash-lite',  label: 'Gemini 2.0 Flash Lite', desc: 'Ultra-fast, lightweight' },
      { id: 'gemini-1.5-flash',       label: 'Gemini 1.5 Flash',      desc: 'Reliable and fast' },
      { id: 'gemini-1.5-pro',         label: 'Gemini 1.5 Pro',        desc: 'Most capable Gemini model' },
    ],
    groq: [
      { id: 'llama-3.3-70b-versatile',  label: 'Llama 3.3 70B',        desc: 'Best quality on Groq' },
      { id: 'llama-3.1-8b-instant',     label: 'Llama 3.1 8B Instant', desc: 'Ultra-fast, great for chat' },
      { id: 'mixtral-8x7b-32768',       label: 'Mixtral 8x7B',         desc: '32 K context, great reasoning' },
      { id: 'gemma2-9b-it',            label: 'Gemma 2 9B',            desc: "Google's compact open model" },
    ],
    huggingface: [
      { id: 'meta-llama/Llama-3.1-8B-Instruct',        label: 'Llama 3.1 8B',    desc: "Meta's fast open-source model" },
      { id: 'Qwen/Qwen2.5-72B-Instruct',               label: 'Qwen 2.5 72B',    desc: 'Alibaba — high quality responses' },
      { id: 'microsoft/Phi-3-mini-4k-instruct',        label: 'Phi-3 Mini',      desc: "Microsoft's compact powerhouse" },
      { id: 'mistralai/Mistral-7B-Instruct-v0.3',      label: 'Mistral 7B v0.3', desc: 'Reliable and well-rounded' },
    ],
  };

  /* Default model for each provider */
  var DEFAULTS = {
    openrouter:  'openrouter/free',
    gemini:      'gemini-2.0-flash',
    groq:        'llama-3.3-70b-versatile',
    huggingface: 'meta-llama/Llama-3.1-8B-Instruct',
  };

  /* ── Storage ───────────────────────────────────────────── */
  var STORAGE_KEY = 'beast_model_v1';

  function _load() {
    try { var s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : {}; }
    catch (e) { return {}; }
  }
  function _save(st) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(st)); } catch (e) {}
  }

  var _state = _load();

  /* ── Public API ────────────────────────────────────────── */
  function getModels(providerId) { return MODELS[providerId] || []; }

  function getSelectedModel(providerId) {
    var saved  = _state[providerId];
    var models = MODELS[providerId] || [];
    if (saved && models.some(function (m) { return m.id === saved; })) return saved;
    return DEFAULTS[providerId] || (models[0] ? models[0].id : '');
  }

  function setSelectedModel(providerId, modelId) {
    _state[providerId] = modelId;
    _save(_state);
  }

  function getModelInfo(providerId, modelId) {
    var models = MODELS[providerId] || [];
    for (var i = 0; i < models.length; i++) {
      if (models[i].id === modelId) return models[i];
    }
    return null;
  }

  /* Convenience helpers using the currently active provider */
  function getActiveModel() {
    return getSelectedModel(PM.getActiveProvider());
  }

  function getActiveModelInfo() {
    var p = PM.getActiveProvider();
    return getModelInfo(p, getSelectedModel(p));
  }

  /* Short display label for the model button */
  function getActiveModelLabel() {
    var info = getActiveModelInfo();
    return info ? info.label : getActiveModel();
  }

  return {
    getModels:          getModels,
    getSelectedModel:   getSelectedModel,
    setSelectedModel:   setSelectedModel,
    getModelInfo:       getModelInfo,
    getActiveModel:     getActiveModel,
    getActiveModelInfo: getActiveModelInfo,
    getActiveModelLabel: getActiveModelLabel,
    MODELS:             MODELS,
  };
})();
