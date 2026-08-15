(function () {
  'use strict';

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

  // ── API key storage ───────────────────────────────────────
  var openrouterKey = localStorage.getItem('beast:openrouter_key') || '';
  var geminiKey = localStorage.getItem('beast:gemini_key') || '';
  var selectedProvider = localStorage.getItem('beast:provider') || 'openrouter';
  var selectedModel = localStorage.getItem('beast:model') || null;

  // ── Free models list (verified July 2026) ─────────────────
  var OPENROUTER_MODELS = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-r1:free',
    'deepseek/deepseek-chat-v3-0324:free',
    'google/gemma-4-31b-it:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'nvidia/nemotron-3-nano-30b-a3b:free',
    'openai/gpt-oss-120b:free',
    'openai/gpt-oss-20b:free',
    'cohere/north-mini-code:free',
    'qwen/qwen3-next-80b-a3b-instruct:free'
  ];
  var GEMINI_MODELS = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest'
  ];

  var modelsByProvider = { openrouter: OPENROUTER_MODELS, gemini: GEMINI_MODELS };

  // ── Settings modal ────────────────────────────────────────
  var settingsModal = document.getElementById('settings-modal');
  var settingsClose = document.getElementById('settings-close');
  var settingsSave = document.getElementById('settings-save');
  var settingsClear = document.getElementById('settings-clear');
  var settingsStatus = document.getElementById('settings-status');
  var openrouterKeyInput = document.getElementById('openrouter-key-input');
  var geminiKeyInput = document.getElementById('gemini-key-input');
  var openSettingsBtn = document.getElementById('open-settings');

  function openSettings() {
    if (!settingsModal) return;
    openrouterKeyInput.value = openrouterKey;
    geminiKeyInput.value = geminiKey;
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
    openrouterKey = openrouterKeyInput.value.trim();
    geminiKey = geminiKeyInput.value.trim();
    localStorage.setItem('beast:openrouter_key', openrouterKey);
    localStorage.setItem('beast:gemini_key', geminiKey);
    settingsStatus.style.color = '#63c174';
    settingsStatus.textContent = 'Keys saved!';
    updateConnectionStatus();
    updateProviderTabs();
    showToast('API keys saved');
    setTimeout(closeSettings, 1200);
  });
  if (settingsClear) settingsClear.addEventListener('click', function () {
    openrouterKey = '';
    geminiKey = '';
    openrouterKeyInput.value = '';
    geminiKeyInput.value = '';
    localStorage.removeItem('beast:openrouter_key');
    localStorage.removeItem('beast:gemini_key');
    settingsStatus.style.color = '#ffb4b4';
    settingsStatus.textContent = 'Keys cleared';
    updateConnectionStatus();
    updateProviderTabs();
    showToast('API keys cleared');
  });

  // ── Provider / model UI ───────────────────────────────────
  function updateConnectionStatus() {
    if (selectedProvider === 'openrouter' && openrouterKey) {
      setConnectionStatus('connected', 'OpenRouter ready');
    } else if (selectedProvider === 'gemini' && geminiKey) {
      setConnectionStatus('connected', 'Gemini ready');
    } else if ((selectedProvider === 'openrouter' && geminiKey) || (selectedProvider === 'gemini' && openrouterKey)) {
      setConnectionStatus('warning', 'No key for ' + selectedProvider);
    } else {
      setConnectionStatus('offline', 'Add API key');
    }
  }

  function updateProviderTabs() {
    if (!providerSwitch) return;
    providerSwitch.querySelectorAll('.provider-tab').forEach(function (tab) {
      var p = tab.getAttribute('data-provider');
      var hasKey = (p === 'openrouter' && openrouterKey) || (p === 'gemini' && geminiKey);
      tab.style.opacity = hasKey ? '1' : '0.4';
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
        localStorage.setItem('beast:model', m);
        modelBadge.textContent = sn;
        modelMenu.style.display = 'none';
      });
      modelMenu.appendChild(btn);
    });
    if (models.length && models.indexOf(selectedModel) === -1) {
      selectedModel = models[0];
      localStorage.setItem('beast:model', selectedModel);
    }
    if (selectedModel) modelBadge.textContent = shortModelName(selectedModel);
  }

  function setActiveProvider(provider) {
    selectedProvider = provider;
    localStorage.setItem('beast:provider', provider);
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
    var label = role === 'assistant' ? 'Beast AI' : 'You';
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
    message.innerHTML = '<span class="message-avatar"><img src="assets/drexora-mark.png" alt=""></span><div class="message-body"><span class="message-label">Beast AI</span><span class="typing-dots"><i></i><i></i><i></i></span></div>';
    list.appendChild(message);
    message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return message;
  }

  // ── Direct OpenRouter call (OpenAI-compatible) ─────────────
  async function callOpenRouter(messages, model) {
    if (!openrouterKey) throw new Error('No OpenRouter API key. Click "API Keys & Settings" to add one.');
    var controller = new AbortController();
    activeRequest = controller;
    if (stopBtn) stopBtn.disabled = false;
    updateComposer();

    var systemMsg = { role: 'system', content: 'You are Beast AI, a helpful, concise, friendly assistant.' };
    var apiMessages = [systemMsg].concat(messages);

    var response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + openrouterKey,
        'HTTP-Referer': location.origin,
        'X-Title': 'Beast AI'
      },
      body: JSON.stringify({ model: model, messages: apiMessages, temperature: 0.7 }),
      signal: controller.signal
    });

    if (!response.ok) {
      var errText = await response.text().catch(function () { return ''; });
      var err = new Error('OpenRouter error ' + response.status + ': ' + errText.slice(0, 200));
      throw err;
    }

    var data = await response.json();
    activeRequest = null;
    if (stopBtn) stopBtn.disabled = true;
    updateComposer();

    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content || '';
    }
    throw new Error('OpenRouter returned no response');
  }

  // ── Direct Gemini call (generateContent) ──────────────────
  async function callGemini(messages, model) {
    if (!geminiKey) throw new Error('No Gemini API key. Click "API Keys & Settings" to add one.');
    var controller = new AbortController();
    activeRequest = controller;
    if (stopBtn) stopBtn.disabled = false;
    updateComposer();

    var systemParts = [];
    var contents = [];
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      if (m.role === 'system') { systemParts.push(m.content); continue; }
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
    }
    var systemInstruction = systemParts.length ? { parts: [{ text: systemParts.join('\n') }] } : undefined;

    var body = { contents: contents, generationConfig: { temperature: 0.7 } };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + geminiKey;

    var response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      var errText = await response.text().catch(function () { return ''; });
      throw new Error('Gemini error ' + response.status + ': ' + errText.slice(0, 200));
    }

    var data = await response.json();
    activeRequest = null;
    if (stopBtn) stopBtn.disabled = true;
    updateComposer();

    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      var parts = data.candidates[0].content.parts || [];
      var text = parts.map(function (p) { return p.text || ''; }).join('');
      if (text) return text;
    }
    throw new Error('Gemini returned no response');
  }

  // ── Ask assistant (routes to selected provider) ───────────
  async function askAssistant() {
    var lastUserMsg = chatMessages[chatMessages.length - 1];
    if (!lastUserMsg) throw new Error('No message to send');

    try {
      if (selectedProvider === 'openrouter') {
        setConnectionStatus('connected', 'Asking OpenRouter...');
        var reply = await callOpenRouter(chatMessages, selectedModel || OPENROUTER_MODELS[0]);
        setConnectionStatus('connected', 'OpenRouter ready');
        return reply;
      } else {
        setConnectionStatus('connected', 'Asking Gemini...');
        var reply2 = await callGemini(chatMessages, selectedModel || GEMINI_MODELS[0]);
        setConnectionStatus('connected', 'Gemini ready');
        return reply2;
      }
    } catch (err) {
      activeRequest = null;
      if (stopBtn) stopBtn.disabled = true;
      updateComposer();
      updateConnectionStatus();
      // Auto-fallback to the other provider if it has a key
      if (selectedProvider === 'openrouter' && geminiKey) {
        showToast('OpenRouter failed, trying Gemini...');
        setConnectionStatus('warning', 'Fallback to Gemini');
        try { return await callGemini(chatMessages, GEMINI_MODELS[0]); } catch (e) { throw err; }
      }
      if (selectedProvider === 'gemini' && openrouterKey) {
        showToast('Gemini failed, trying OpenRouter...');
        setConnectionStatus('warning', 'Fallback to OpenRouter');
        try { return await callOpenRouter(chatMessages, OPENROUTER_MODELS[0]); } catch (e) { throw err; }
      }
      throw err;
    }
  }

  // ── Send message flow ─────────────────────────────────────
  async function sendMessage(text) {
    var prompt = text.trim().slice(0, 4000);
    if (!prompt || activeRequest) return;

    if (!openrouterKey && !geminiKey) {
      showToast('Please add an API key first');
      openSettings();
      return;
    }

    input.value = '';
    updateComposer();
    addMessage('user', prompt);
    chatMessages.push({ role: 'user', content: prompt });
    var typing = showTyping();

    try {
      var reply = await askAssistant();
      typing.remove();
      addMessage('assistant', reply);
      chatMessages.push({ role: 'assistant', content: reply });
    } catch (err) {
      typing.remove();
      var errMsg = err.message || String(err);
      addMessage('assistant', 'I could not get a response. ' + errMsg);
      showToast('AI error: ' + errMsg.slice(0, 80));
    }
  }

  // ── Reset / new chat ──────────────────────────────────────
  function resetChat() {
    if (activeRequest) { try { activeRequest.abort(); } catch (e) {} }
    activeRequest = null;
    chatMessages = [];
    conversation.innerHTML = '';
    var freshWelcome = document.createElement('div');
    freshWelcome.className = 'welcome-state';
    freshWelcome.innerHTML = '<div class="welcome-mark"><img src="assets/drexora-mark.png" alt=""></div><h1>How can I help you today?</h1><p>Ask Beast AI to think, write, plan, or explore with you.</p><div class="prompt-grid"><button class="prompt-card" type="button" data-prompt="Help me plan a focused and productive day"><span class="prompt-icon purple" aria-hidden="true">◷</span><span><strong>Plan my day</strong><small>Create a focused routine</small></span><span class="prompt-arrow" aria-hidden="true">↗</span></button><button class="prompt-card" type="button" data-prompt="Give me five creative ideas for a side project"><span class="prompt-icon lime" aria-hidden="true">✦</span><span><strong>Explore ideas</strong><small>Find a fresh direction</small></span><span class="prompt-arrow" aria-hidden="true">↗</span></button><button class="prompt-card" type="button" data-prompt="Explain a complex topic in a simple way"><span class="prompt-icon blue" aria-hidden="true">◇</span><span><strong>Learn something</strong><small>Make it easy to understand</small></span><span class="prompt-arrow" aria-hidden="true">↗</span></button><button class="prompt-card" type="button" data-prompt="Help me write a clear and thoughtful message"><span class="prompt-icon orange" aria-hidden="true">✎</span><span><strong>Write with me</strong><small>Turn thoughts into words</small></span><span class="prompt-arrow" aria-hidden="true">↗</span></button></div>';
    conversation.appendChild(freshWelcome);
    welcomeState = freshWelcome;
    bindPromptCards();
    updateComposer();
    showToast('Started a new chat');
    toggleSidebar(false);
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

  document.querySelectorAll('.history-item').forEach(function (button) {
    button.addEventListener('click', function () {
      document.querySelectorAll('.history-item').forEach(function (item) { item.classList.remove('selected'); });
      button.classList.add('selected');
      toggleSidebar(false);
    });
  });

  document.getElementById('new-chat').addEventListener('click', function () { resetChat(); });
  document.getElementById('clear-history').addEventListener('click', function (event) {
    event.preventDefault();
    historyEl.innerHTML = '';
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
          var role = el.classList.contains('assistant') ? 'Beast AI' : 'You';
          var p = el.querySelector('.message-body p');
          if (p) text += role + ': ' + p.textContent + '\n\n';
        });
        await navigator.clipboard.writeText(text || '');
        showToast('Conversation copied to clipboard');
      } catch (err) { showToast('Failed to copy conversation'); }
    })();
  });

  document.getElementById('toggle-theme').addEventListener('click', function () {
    document.body.classList.toggle('light-mode');
    showToast(document.body.classList.contains('light-mode') ? 'Light mode on' : 'Dark mode on');
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
  updateProviderTabs();
  renderModelMenu();
  updateConnectionStatus();
  updateComposer();

  if (!openrouterKey && !geminiKey) {
    setTimeout(function () {
      showToast('Add your free API key to start chatting');
      openSettings();
    }, 800);
  }
})();
