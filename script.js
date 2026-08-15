(function () {
  'use strict';

  // ── Backend API base URL ──────────────────────────────────
  // When hosted on Render, the frontend is served from the same origin.
  // For local development or GitHub Pages, set API_BASE to the Render URL.
  var API_BASE = '';
  // Auto-detect: if we're NOT on the same origin as the API, use the Render URL.
  // The server serves the frontend at the same origin, so same-origin = API_BASE = ''.
  // If deployed on GitHub Pages, set this to the Render URL.
  if (location.hostname.indexOf('github.io') !== -1) {
    API_BASE = 'https://drexora-ai.onrender.com';
  }

  // ── DOM refs ──────────────────────────────────────────────
  var input = document.getElementById('prompt-input');
  var composer = document.getElementById('composer');
  var sendButton = document.getElementById('send-button');
  var charCount = document.getElementById('char-count');
  var conversation = document.getElementById('conversation');
  var welcomeState = document.getElementById('welcome-state');
  var sidebar = document.getElementById('sidebar');
  var sidebarScrim = document.getElementById('sidebar-scrim');
  var toast = document.getElementById('toast');
  var connectionStatus = document.getElementById('connection-status');
  var activeRequest = null;
  var chatMessages = [];
  var modelPicker = document.getElementById('model-picker');
  var modelMenu = document.getElementById('model-menu');
  var modelBadge = document.getElementById('model-badge');
  var providerSwitch = document.getElementById('provider-switch');
  var regenerateBtn = document.getElementById('regenerate');
  var stopBtn = document.getElementById('stop-generation');
  var historyEl = document.getElementById('history');

  // ── Local settings (provider/model selection only; no API keys) ──
  var selectedProvider = localStorage.getItem('drexora:provider') || 'openrouter';
  var selectedModel = localStorage.getItem('drexora:model') || null;
  var themeMode = localStorage.getItem('drexora:theme') || 'dark';

  // ── Chat history in localStorage ──────────────────────────
  var HISTORY_KEY = 'drexora:conversations';
  var CURRENT_CHAT_KEY = 'drexora:current_chat';

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveHistory(h) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-50))); } catch (e) {}
  }
  function getCurrentChatId() {
    return localStorage.getItem(CURRENT_CHAT_KEY) || null;
  }
  function setCurrentChatId(id) {
    if (id) localStorage.setItem(CURRENT_CHAT_KEY, id);
    else localStorage.removeItem(CURRENT_CHAT_KEY);
  }
  function createChat(title) {
    var h = getHistory();
    var id = 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    h.unshift({ id: id, title: title || 'New chat', messages: [], createdAt: Date.now(), updatedAt: Date.now() });
    saveHistory(h);
    return id;
  }
  function updateChat(id, messages) {
    var h = getHistory();
    for (var i = 0; i < h.length; i++) {
      if (h[i].id === id) {
        h[i].messages = messages;
        h[i].updatedAt = Date.now();
        if (h[i].title === 'New chat' && messages.length > 0) {
          var firstUser = '';
          for (var j = 0; j < messages.length; j++) {
            if (messages[j].role === 'user') { firstUser = messages[j].content; break; }
          }
          h[i].title = firstUser.slice(0, 60);
        }
        break;
      }
    }
    saveHistory(h);
  }
  function deleteChat(id) {
    var h = getHistory().filter(function (c) { return c.id !== id; });
    saveHistory(h);
  }
  function loadChat(id) {
    var h = getHistory();
    for (var i = 0; i < h.length; i++) {
      if (h[i].id === id) return h[i];
    }
    return null;
  }

  // ── Free models (will be fetched from server, with fallback) ──
  var OPENROUTER_MODELS = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-r1:free',
    'deepseek/deepseek-chat-v3-0324:free',
    'google/gemma-4-31b-it:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'nvidia/nemotron-3-nano-30b-a3b:free',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'openai/gpt-oss-120b:free',
    'openai/gpt-oss-20b:free',
    'cohere/north-mini-code:free',
    'poolside/laguna-m.1:free',
    'poolside/laguna-xs-2.1:free',
    'qwen/qwen3-next-80b-a3b-instruct:free'
  ];
  var GEMINI_MODELS = [
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash'
  ];

  var modelsByProvider = { openrouter: OPENROUTER_MODELS, gemini: GEMINI_MODELS };
  var serverProviders = { openrouter: false, gemini: false };

  // Fetch available models + provider status from server
  async function fetchServerConfig() {
    try {
      var resp = await fetch(API_BASE + '/api/health');
      if (resp.ok) {
        var data = await resp.json();
        serverProviders.openrouter = data.providers && data.providers.openrouter;
        serverProviders.gemini = data.providers && data.providers.gemini;
      }
    } catch (e) {}
    try {
      var resp2 = await fetch(API_BASE + '/api/ai/models');
      if (resp2.ok) {
        var data2 = await resp2.json();
        if (data2.byProvider) {
          if (data2.byProvider.openrouter && data2.byProvider.openrouter.length) OPENROUTER_MODELS = data2.byProvider.openrouter;
          if (data2.byProvider.gemini && data2.byProvider.gemini.length) GEMINI_MODELS = data2.byProvider.gemini;
          modelsByProvider = { openrouter: OPENROUTER_MODELS, gemini: GEMINI_MODELS };
        }
      }
    } catch (e) {}
    updateConnectionStatus();
    updateProviderTabs();
    renderModelMenu();
  }

  // ── Settings modal ────────────────────────────────────────
  var settingsModal = document.getElementById('settings-modal');
  var settingsClose = document.getElementById('settings-close');
  var settingsSave = document.getElementById('settings-save');
  var settingsClear = document.getElementById('settings-clear');
  var settingsStatus = document.getElementById('settings-status');
  var openSettingsBtn = document.getElementById('open-settings');
  var defaultProviderSelect = document.getElementById('default-provider-select');
  var themeSelect = document.getElementById('theme-select');

  function openSettings() {
    if (!settingsModal) return;
    if (defaultProviderSelect) defaultProviderSelect.value = selectedProvider === 'gemini' ? 'gemini' : (selectedProvider === 'openrouter' ? 'openrouter' : 'auto');
    if (themeSelect) themeSelect.value = themeMode;
    settingsStatus.textContent = '';
    settingsStatus.style.color = '';
    settingsModal.setAttribute('aria-hidden', 'false');
    settingsModal.style.display = 'flex';
  }
  function closeSettings() {
    if (!settingsModal) return;
    settingsModal.setAttribute('aria-hidden', 'true');
    settingsModal.style.display = 'none';
  }

  if (openSettingsBtn) openSettingsBtn.addEventListener('click', function (ev) { ev.preventDefault(); openSettings(); });
  if (settingsClose) settingsClose.addEventListener('click', closeSettings);
  if (settingsSave) settingsSave.addEventListener('click', function () {
    if (defaultProviderSelect) {
      var prov = defaultProviderSelect.value;
      if (prov === 'auto') prov = 'openrouter';
      selectedProvider = prov;
      localStorage.setItem('drexora:provider', prov);
    }
    if (themeSelect) {
      themeMode = themeSelect.value;
      localStorage.setItem('drexora:theme', themeMode);
      applyTheme();
    }
    settingsStatus.style.color = '#63c174';
    settingsStatus.textContent = 'Settings saved!';
    updateConnectionStatus();
    updateProviderTabs();
    renderModelMenu();
    showToast('Settings saved');
    setTimeout(closeSettings, 1200);
  });
  if (settingsClear) settingsClear.addEventListener('click', function () {
    localStorage.removeItem('drexora:provider');
    localStorage.removeItem('drexora:model');
    localStorage.removeItem('drexora:theme');
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(CURRENT_CHAT_KEY);
    selectedProvider = 'openrouter';
    selectedModel = null;
    themeMode = 'dark';
    applyTheme();
    settingsStatus.style.color = '#ffb4b4';
    settingsStatus.textContent = 'Local data cleared';
    updateConnectionStatus();
    updateProviderTabs();
    renderModelMenu();
    renderHistory();
    showToast('Local data cleared');
  });

  // ── Theme ─────────────────────────────────────────────────
  function applyTheme() {
    if (themeMode === 'light') document.body.classList.add('light-mode');
    else document.body.classList.remove('light-mode');
  }

  // ── Provider / model UI ───────────────────────────────────
  function updateConnectionStatus() {
    var hasProvider = serverProviders.openrouter || serverProviders.gemini;
    if (!hasProvider) {
      setConnectionStatus('offline', 'Connecting...');
      return;
    }
    if (selectedProvider === 'openrouter' && serverProviders.openrouter) {
      setConnectionStatus('connected', 'OpenRouter ready');
    } else if (selectedProvider === 'gemini' && serverProviders.gemini) {
      setConnectionStatus('connected', 'Gemini ready');
    } else if (selectedProvider === 'openrouter' && serverProviders.gemini) {
      setConnectionStatus('warning', 'OpenRouter offline, using Gemini');
    } else if (selectedProvider === 'gemini' && serverProviders.openrouter) {
      setConnectionStatus('warning', 'Gemini offline, using OpenRouter');
    } else {
      setConnectionStatus('offline', 'No provider');
    }
  }

  function updateProviderTabs() {
    if (!providerSwitch) return;
    providerSwitch.querySelectorAll('.provider-tab').forEach(function (tab) {
      var p = tab.getAttribute('data-provider');
      var available = serverProviders[p];
      tab.style.opacity = available ? '1' : '0.4';
      tab.classList.toggle('active', p === selectedProvider);
    });
  }

  function shortModelName(m) {
    return m.replace(':free', '')
      .replace('meta-llama/', '').replace('deepseek/', '')
      .replace('google/', '').replace('nvidia/', '')
      .replace('openai/', '').replace('cohere/', '')
      .replace('qwen/', '').replace('poolside/', '');
  }

  function renderModelMenu() {
    var models = modelsByProvider[selectedProvider] || [];
    modelMenu.innerHTML = '';
    models.forEach(function (m) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'model-item' + (m === selectedModel ? ' active' : '');
      var sn = shortModelName(m);
      btn.textContent = sn;
      btn.title = m;
      btn.addEventListener('click', function () {
        selectedModel = m;
        localStorage.setItem('drexora:model', m);
        modelBadge.textContent = sn;
        modelMenu.style.display = 'none';
      });
      modelMenu.appendChild(btn);
    });
    if (models.length && models.indexOf(selectedModel) === -1) {
      selectedModel = models[0];
      localStorage.setItem('drexora:model', selectedModel);
    }
    if (selectedModel) modelBadge.textContent = shortModelName(selectedModel);
  }

  function setActiveProvider(provider) {
    selectedProvider = provider;
    localStorage.setItem('drexora:provider', provider);
    updateProviderTabs();
    renderModelMenu();
    updateConnectionStatus();
  }

  if (providerSwitch) {
    providerSwitch.querySelectorAll('.provider-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var p = tab.getAttribute('data-provider');
        setActiveProvider(p);
        showToast(p === 'openrouter' ? 'OpenRouter selected' : 'Gemini selected');
      });
    });
  }

  if (modelPicker) {
    modelPicker.addEventListener('click', function () {
      if (!modelMenu) return;
      if (modelMenu.style.display === 'block') modelMenu.style.display = 'none';
      else { modelMenu.style.display = 'block'; renderModelMenu(); }
    });
  }

  document.addEventListener('click', function (e) {
    if (modelMenu && modelMenu.style.display === 'block' && !modelPicker.contains(e.target) && !modelMenu.contains(e.target)) {
      modelMenu.style.display = 'none';
    }
    if (settingsModal && settingsModal.style.display === 'flex' && !settingsModal.querySelector('.auth-panel').contains(e.target) && openSettingsBtn && !openSettingsBtn.contains(e.target)) {
      closeSettings();
    }
  });

  // ── Utilities ─────────────────────────────────────────────
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () { toast.classList.remove('visible'); }, 3000);
  }

  function setConnectionStatus(state, label) {
    connectionStatus.className = 'connection-status ' + state;
    connectionStatus.innerHTML = '<i></i> ' + label;
  }

  function toggleSidebar(open) {
    sidebar.classList.toggle('open', open);
    sidebarScrim.classList.toggle('open', open);
  }

  function resizeInput() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 190) + 'px';
  }

  function updateComposer() {
    var length = input.value.length;
    charCount.textContent = length + ' / 4000';
    sendButton.disabled = input.value.trim().length === 0 || Boolean(activeRequest);
    resizeInput();
  }

  function addMessage(role, text) {
    if (welcomeState) { welcomeState.remove(); welcomeState = null; }
    var list = conversation.querySelector('.message-list');
    if (!list) { list = document.createElement('div'); list.className = 'message-list'; conversation.appendChild(list); }
    var message = document.createElement('article');
    message.className = 'message ' + role;
    var avatar = role === 'assistant'
      ? '<span class="message-avatar"><img src="assets/drexora-mark.png" alt=""></span>'
      : '<span class="message-avatar">You</span>';
    var label = role === 'assistant' ? 'Drexora AI' : 'You';
    message.innerHTML = avatar + '<div class="message-body"><span class="message-label">' + label + '</span><p></p></div>';
    message.querySelector('p').textContent = text;
    list.appendChild(message);
    message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function showTyping() {
    var list = conversation.querySelector('.message-list');
    if (!list) { list = document.createElement('div'); list.className = 'message-list'; conversation.appendChild(list); }
    var message = document.createElement('article');
    message.className = 'message assistant typing-message';
    message.innerHTML = '<span class="message-avatar"><img src="assets/drexora-mark.png" alt=""></span><div class="message-body"><span class="message-label">Drexora AI</span><span class="typing-dots"><i></i><i></i><i></i></span></div>';
    list.appendChild(message);
    message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return message;
  }

  // ── Call backend API (keys stay on server) ───────────────
  async function callBackend(messages, model, provider) {
    var controller = new AbortController();
    activeRequest = controller;
    if (stopBtn) stopBtn.disabled = false;
    updateComposer();

    try {
      var response = await fetch(API_BASE + '/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages, model: model, provider: provider }),
        signal: controller.signal
      });

      if (!response.ok) {
        var errText = await response.text().catch(function () { return ''; });
        throw new Error('Server error ' + response.status + ': ' + errText.slice(0, 200));
      }

      var data = await response.json();
      activeRequest = null;
      if (stopBtn) stopBtn.disabled = true;
      updateComposer();

      if (data.reply) return data.reply;
      if (data.error) throw new Error(data.error);
      throw new Error('No response from server');
    } catch (err) {
      activeRequest = null;
      if (stopBtn) stopBtn.disabled = true;
      updateComposer();
      throw err;
    }
  }

  // ── Ask assistant (routes via backend) ───────────────────
  async function askAssistant() {
    var lastUserMsg = chatMessages[chatMessages.length - 1];
    if (!lastUserMsg) throw new Error('No message to send');

    var provider = selectedProvider;
    var model = selectedModel || (modelsByProvider[selectedProvider] || [])[0] || null;

    try {
      setConnectionStatus('connected', 'Asking ' + (provider === 'gemini' ? 'Gemini' : 'OpenRouter') + '...');
      var reply = await callBackend(chatMessages, model, provider);
      updateConnectionStatus();
      return reply;
    } catch (err) {
      updateConnectionStatus();
      // Auto-fallback to the other provider
      var otherProvider = provider === 'openrouter' ? 'gemini' : 'openrouter';
      if (serverProviders[otherProvider]) {
        showToast((provider === 'gemini' ? 'Gemini' : 'OpenRouter') + ' failed, trying ' + (otherProvider === 'gemini' ? 'Gemini' : 'OpenRouter') + '...');
        setConnectionStatus('warning', 'Fallback to ' + otherProvider);
        try {
          var otherModel = (modelsByProvider[otherProvider] || [])[0] || null;
          var reply2 = await callBackend(chatMessages, otherModel, otherProvider);
          updateConnectionStatus();
          return reply2;
        } catch (e) { throw err; }
      }
      throw err;
    }
  }

  // ── Send message flow ─────────────────────────────────────
  async function sendMessage(text) {
    var prompt = text.trim().slice(0, 4000);
    if (!prompt || activeRequest) return;

    // Check if any provider is available
    if (!serverProviders.openrouter && !serverProviders.gemini) {
      showToast('Server is still connecting. Please wait a moment and try again.');
      return;
    }

    input.value = '';
    updateComposer();
    addMessage('user', prompt);
    chatMessages.push({ role: 'user', content: prompt });

    // Ensure we have a current chat
    var chatId = getCurrentChatId();
    if (!chatId) {
      chatId = createChat(prompt.slice(0, 60));
      setCurrentChatId(chatId);
    }
    updateChat(chatId, chatMessages);
    renderHistory();

    var typing = showTyping();

    try {
      var reply = await askAssistant();
      typing.remove();
      addMessage('assistant', reply);
      chatMessages.push({ role: 'assistant', content: reply });
      updateChat(chatId, chatMessages);
      renderHistory();
    } catch (err) {
      typing.remove();
      var errMsg = err.message || String(err);
      addMessage('assistant', 'I could not get a response. ' + errMsg);
      showToast('AI error: ' + errMsg.slice(0, 80));
    }
  }

  // ── History sidebar ───────────────────────────────────────
  function renderHistory() {
    var h = getHistory();
    historyEl.innerHTML = '';
    if (!h.length) {
      var label = document.createElement('p');
      label.className = 'history-label';
      label.textContent = 'Recent';
      historyEl.appendChild(label);
      var empty = document.createElement('p');
      empty.style.cssText = 'padding: 10px; color: #777; font-size: 0.82rem;';
      empty.textContent = 'No conversations yet';
      historyEl.appendChild(empty);
      return;
    }
    var labelEl = document.createElement('p');
    labelEl.className = 'history-label';
    labelEl.textContent = 'Recent';
    historyEl.appendChild(labelEl);

    var currentId = getCurrentChatId();
    h.forEach(function (chat) {
      var btn = document.createElement('button');
      btn.className = 'history-item' + (chat.id === currentId ? ' selected' : '');
      btn.type = 'button';
      btn.setAttribute('data-chat-id', chat.id);
      var icon = document.createElement('span');
      icon.className = 'history-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '◌';
      var title = document.createElement('span');
      title.textContent = chat.title || 'New chat';
      title.style.overflow = 'hidden';
      title.style.textOverflow = 'ellipsis';
      title.style.whiteSpace = 'nowrap';
      btn.appendChild(icon);
      btn.appendChild(title);

      // Delete button
      var delBtn = document.createElement('span');
      delBtn.className = 'history-action';
      delBtn.setAttribute('aria-hidden', 'true');
      delBtn.textContent = '×';
      delBtn.style.cssText = 'margin-left:auto; padding: 2px 8px; border-radius: 6px; color: #9a9a9a; cursor: pointer; font-size: 1.1rem;';
      delBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        deleteChat(chat.id);
        if (chat.id === getCurrentChatId()) {
          setCurrentChatId(null);
          resetChat();
        }
        renderHistory();
        showToast('Conversation deleted');
      });
      btn.appendChild(delBtn);

      btn.addEventListener('click', function () {
        loadChatIntoView(chat.id);
        toggleSidebar(false);
      });
      historyEl.appendChild(btn);
    });
  }

  function loadChatIntoView(id) {
    var chat = loadChat(id);
    if (!chat) return;
    setCurrentChatId(id);
    chatMessages = chat.messages.slice();
    conversation.innerHTML = '';
    if (!chatMessages.length) {
      showWelcome();
    } else {
      var list = document.createElement('div');
      list.className = 'message-list';
      conversation.appendChild(list);
      chatMessages.forEach(function (m) {
        var message = document.createElement('article');
        message.className = 'message ' + m.role;
        var avatar = m.role === 'assistant'
          ? '<span class="message-avatar"><img src="assets/drexora-mark.png" alt=""></span>'
          : '<span class="message-avatar">You</span>';
        var label = m.role === 'assistant' ? 'Drexora AI' : 'You';
        message.innerHTML = avatar + '<div class="message-body"><span class="message-label">' + label + '</span><p></p></div>';
        message.querySelector('p').textContent = m.content;
        list.appendChild(message);
      });
      welcomeState = null;
    }
    renderHistory();
    updateComposer();
  }

  // ── Reset / new chat ──────────────────────────────────────
  function showWelcome() {
    conversation.innerHTML = '';
    var freshWelcome = document.createElement('div');
    freshWelcome.className = 'welcome-state';
    freshWelcome.id = 'welcome-state';
    freshWelcome.innerHTML = '<div class="welcome-mark"><img src="assets/drexora-mark.png" alt=""></div><h1>How can I help you today?</h1><p>Ask Drexora AI to think, write, plan, or explore with you.</p><div class="prompt-grid"><button class="prompt-card" type="button" data-prompt="Help me plan a focused and productive day"><span class="prompt-icon purple" aria-hidden="true">◷</span><span><strong>Plan my day</strong><small>Create a focused routine</small></span><span class="prompt-arrow" aria-hidden="true">↗</span></button><button class="prompt-card" type="button" data-prompt="Give me five creative ideas for a side project"><span class="prompt-icon lime" aria-hidden="true">✦</span><span><strong>Explore ideas</strong><small>Find a fresh direction</small></span><span class="prompt-arrow" aria-hidden="true">↗</span></button><button class="prompt-card" type="button" data-prompt="Explain a complex topic in a simple way"><span class="prompt-icon blue" aria-hidden="true">◇</span><span><strong>Learn something</strong><small>Make it easy to understand</small></span><span class="prompt-arrow" aria-hidden="true">↗</span></button><button class="prompt-card" type="button" data-prompt="Help me write a clear and thoughtful message"><span class="prompt-icon orange" aria-hidden="true">✎</span><span><strong>Write with me</strong><small>Turn thoughts into words</small></span><span class="prompt-arrow" aria-hidden="true">↗</span></button></div>';
    conversation.appendChild(freshWelcome);
    welcomeState = freshWelcome;
    bindPromptCards();
  }

  function resetChat() {
    if (activeRequest) { try { activeRequest.abort(); } catch (e) {} }
    activeRequest = null;
    chatMessages = [];
    setCurrentChatId(null);
    showWelcome();
    updateComposer();
    showToast('Started a new chat');
    toggleSidebar(false);
    renderHistory();
  }

  function bindPromptCards() {
    document.querySelectorAll('.prompt-card').forEach(function (button) {
      button.addEventListener('click', function () {
        input.value = button.getAttribute('data-prompt') || '';
        updateComposer();
        input.focus();
      });
    });
  }

  function regenerateLast() {
    for (var i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === 'user') {
        chatMessages = chatMessages.slice(0, i + 1);
        var list = conversation.querySelector('.message-list');
        if (list) {
          var nodes = Array.from(list.querySelectorAll('.message'));
          for (var j = nodes.length - 1; j >= 0; j--) {
            if (nodes[j].classList.contains('assistant')) nodes[j].remove();
            else break;
          }
        }
        var typing = showTyping();
        askAssistant().then(function (reply) {
          typing.remove();
          addMessage('assistant', reply);
          chatMessages.push({ role: 'assistant', content: reply });
          var chatId = getCurrentChatId();
          if (chatId) updateChat(chatId, chatMessages);
        }).catch(function (err) {
          typing.remove();
          addMessage('assistant', 'I could not get a response. ' + (err.message || String(err)));
        });
        return;
      }
    }
    showToast('No user message to regenerate');
  }

  // ── Event bindings ────────────────────────────────────────
  bindPromptCards();

  document.getElementById('new-chat').addEventListener('click', function () { resetChat(); });
  document.getElementById('clear-history').addEventListener('click', function (event) {
    event.preventDefault();
    localStorage.removeItem(HISTORY_KEY);
    setCurrentChatId(null);
    resetChat();
    showToast('History cleared');
  });
  document.getElementById('sidebar-open').addEventListener('click', function () { toggleSidebar(true); });
  document.getElementById('sidebar-close').addEventListener('click', function () { toggleSidebar(false); });
  sidebarScrim.addEventListener('click', function () { toggleSidebar(false); });

  document.getElementById('share-chat').addEventListener('click', function () {
    (async function () {
      try {
        var text = '';
        document.querySelectorAll('.message').forEach(function (el) {
          var role = el.classList.contains('assistant') ? 'Drexora AI' : 'You';
          var p = el.querySelector('.message-body p');
          if (p) text += role + ': ' + p.textContent + '\n\n';
        });
        await navigator.clipboard.writeText(text || '');
        showToast('Conversation copied to clipboard');
      } catch (err) { showToast('Failed to copy conversation'); }
    })();
  });

  document.getElementById('toggle-theme').addEventListener('click', function () {
    themeMode = document.body.classList.contains('light-mode') ? 'dark' : 'light';
    localStorage.setItem('drexora:theme', themeMode);
    applyTheme();
    showToast(themeMode === 'light' ? 'Light mode on' : 'Dark mode on');
  });

  if (regenerateBtn) regenerateBtn.addEventListener('click', function () { regenerateLast(); });
  if (stopBtn) stopBtn.addEventListener('click', function () {
    if (activeRequest && activeRequest.abort) { activeRequest.abort(); showToast('Generation stopped'); }
    activeRequest = null; stopBtn.disabled = true; updateComposer();
  });

  document.getElementById('attach-file').addEventListener('click', function () { showToast('File attachments coming soon'); });
  document.getElementById('deep-think').addEventListener('click', function () {
    this.classList.toggle('active');
    showToast(this.classList.contains('active') ? 'Deep thinking on' : 'Deep thinking off');
  });

  input.addEventListener('input', updateComposer);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(input.value); }
  });
  composer.addEventListener('submit', function (event) { event.preventDefault(); sendMessage(input.value); });

  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault(); document.getElementById('new-chat').click();
    }
    if (event.key === 'Escape') { toggleSidebar(false); closeSettings(); }
  });

  // ── Init ──────────────────────────────────────────────────
  applyTheme();
  renderHistory();
  updateProviderTabs();
  renderModelMenu();
  updateConnectionStatus();
  updateComposer();
  fetchServerConfig();
})();
