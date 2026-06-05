/* ═══════════════════════════════════════════════════════════════
   Beast AI v2.5 — Provider Manager (providerManager.js)
   ─────────────────────────────────────────────────────────────
   Manages: provider catalogue, active provider, API keys per
   provider, key migration from v3 format, status indicators.
   Exposed as global PM (no bundler needed for static hosting).
   ═══════════════════════════════════════════════════════════════ */
'use strict';

var PM = (function () {

  /* ── Provider catalogue ────────────────────────────────── */
  var PROVIDERS = {
    openrouter: {
      id: 'openrouter',
      name: 'OpenRouter',
      shortName: 'OR',
      accentVar: '--accent',          /* CSS variable for colour */
      description: 'Access 200+ models with auto key-rotation',
      docsUrl: 'https://openrouter.ai/settings/keys',
      keyLabel: 'OpenRouter API Key',
      keyPlaceholder: 'sk-or-v1-...',
      keyMinLen: 10,
      supportsMultiKey: true,
    },
    gemini: {
      id: 'gemini',
      name: 'Gemini',
      shortName: 'GEM',
      accentVar: '--accent5',
      description: "Google's Gemini — native API (not via OR)",
      docsUrl: 'https://aistudio.google.com/app/apikey',
      keyLabel: 'Gemini API Key',
      keyPlaceholder: 'AIza...',
      keyMinLen: 20,
      supportsMultiKey: false,
    },
    groq: {
      id: 'groq',
      name: 'Groq',
      shortName: 'GROQ',
      accentVar: '--accent4',
      description: 'Ultra-fast Llama & Mixtral inference',
      docsUrl: 'https://console.groq.com/keys',
      keyLabel: 'Groq API Key',
      keyPlaceholder: 'gsk_...',
      keyMinLen: 20,
      supportsMultiKey: false,
    },
    huggingface: {
      id: 'huggingface',
      name: 'HuggingFace',
      shortName: 'HF',
      accentVar: '--accent3',
      description: 'Open-source models via HF Inference API',
      docsUrl: 'https://huggingface.co/settings/tokens',
      keyLabel: 'HuggingFace Token',
      keyPlaceholder: 'hf_...',
      keyMinLen: 10,
      supportsMultiKey: false,
    },
  };

  var PROVIDER_ORDER = ['openrouter', 'gemini', 'groq', 'huggingface'];

  /* ── Storage ───────────────────────────────────────────── */
  var STATE_KEY = 'beast_provider_v1';
  var KEY_STORE = 'beast_keys_v4';
  var LEGACY_KEY = 'beast_ai_keys_v3';

  function _loadState() {
    try { var s = localStorage.getItem(STATE_KEY); return s ? JSON.parse(s) : {}; }
    catch (e) { return {}; }
  }
  function _saveState(st) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch (e) {}
  }

  function _loadKeys() {
    var k = {};
    try { var s = localStorage.getItem(KEY_STORE); if (s) k = JSON.parse(s); } catch (e) {}

    /* Migrate from legacy beast_ai_keys_v3 on first run */
    if (!k._migrated) {
      try {
        var old = localStorage.getItem(LEGACY_KEY);
        if (old) {
          var o = JSON.parse(old);
          if (!k.openrouter_keys && o.OR_KEYS && o.OR_KEYS.length) k.openrouter_keys = o.OR_KEYS;
          if (!k.groq_key && o.GROQ_API_KEY) k.groq_key = o.GROQ_API_KEY;
          if (!k.huggingface_key && o.HUGGINGFACE_TOKEN) k.huggingface_key = o.HUGGINGFACE_TOKEN;
        }
      } catch (e) {}
      k._migrated = true;
    }
    return k;
  }

  function _saveKeys(k) {
    try { localStorage.setItem(KEY_STORE, JSON.stringify(k)); } catch (e) {}

    /* Keep legacy format alive so any code still reading beast_ai_keys_v3 works */
    try {
      var orKeys = k.openrouter_keys || [];
      localStorage.setItem(LEGACY_KEY, JSON.stringify({
        OR_KEYS: orKeys,
        OPENROUTER_API_KEY: orKeys[0] || '',
        HUGGINGFACE_TOKEN: k.huggingface_key || '',
        GROQ_API_KEY: k.groq_key || '',
      }));
    } catch (e) {}
  }

  var _state = _loadState();
  var _keys  = _loadKeys();

  /* ── Active provider ───────────────────────────────────── */
  function getActiveProvider() { return _state.provider || 'openrouter'; }

  function setActiveProvider(id) {
    if (!PROVIDERS[id]) return;
    _state.provider = id;
    _saveState(_state);
  }

  function getProvider(id) { return PROVIDERS[id] || null; }
  function getActiveProviderConfig() { return PROVIDERS[getActiveProvider()]; }
  function getProviderList() { return PROVIDER_ORDER.map(function (id) { return PROVIDERS[id]; }); }

  /* ── Key management ────────────────────────────────────── */
  function getKeys(providerId) {
    var id = providerId || getActiveProvider();
    switch (id) {
      case 'openrouter':
        var ks = _keys.openrouter_keys || [];
        return { keys: ks, key: ks[0] || '' };
      case 'gemini':      return { key: _keys.gemini_key || '' };
      case 'groq':        return { key: _keys.groq_key || '' };
      case 'huggingface': return { key: _keys.huggingface_key || '' };
      default:            return { key: '' };
    }
  }

  function setKeys(providerId, keyData) {
    switch (providerId) {
      case 'openrouter':  _keys.openrouter_keys = keyData.keys || []; break;
      case 'gemini':      _keys.gemini_key      = keyData.key  || ''; break;
      case 'groq':        _keys.groq_key        = keyData.key  || ''; break;
      case 'huggingface': _keys.huggingface_key = keyData.key  || ''; break;
    }
    _saveKeys(_keys);
  }

  function reload() { _keys = _loadKeys(); }

  /* ── Status ────────────────────────────────────────────── */
  /* Returns: 'ready' | 'no-key' */
  function getStatus(providerId) {
    var id  = providerId || getActiveProvider();
    var prov = PROVIDERS[id];
    if (!prov) return 'no-key';
    var kd = getKeys(id);
    if (id === 'openrouter') {
      return (kd.keys && kd.keys.length > 0) ? 'ready' : 'no-key';
    }
    return (kd.key && kd.key.length >= prov.keyMinLen) ? 'ready' : 'no-key';
  }

  return {
    getActiveProvider:       getActiveProvider,
    setActiveProvider:       setActiveProvider,
    getProvider:             getProvider,
    getActiveProviderConfig: getActiveProviderConfig,
    getProviderList:         getProviderList,
    getKeys:                 getKeys,
    setKeys:                 setKeys,
    getStatus:               getStatus,
    reload:                  reload,
    PROVIDERS:               PROVIDERS,
    PROVIDER_ORDER:          PROVIDER_ORDER,
  };
})();
