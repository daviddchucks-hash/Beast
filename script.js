(function () {
  'use strict';

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
  var responseTimer;
  var activeRequest = null;
  var chatMessages = [];
  var authButton = document.getElementById('auth-button');
  var authModal = document.getElementById('auth-modal');
  var authClose = document.getElementById('auth-close');
  var authForm = document.getElementById('auth-form');
  var authTitle = document.getElementById('auth-title');
  var authEmail = document.getElementById('auth-email');
  var authPassword = document.getElementById('auth-password');
  var authSubmit = document.getElementById('auth-submit');
  var authSwitch = document.getElementById('auth-switch');
  var authReset = document.getElementById('auth-reset');
  var authError = document.getElementById('auth-error');
  var currentUser = null;
  var currentIdToken = null;
  var isRegister = false;
  var modelPicker = document.getElementById('model-picker');
  var modelMenu = document.getElementById('model-menu');
  var modelBadge = document.getElementById('model-badge');
  var selectedModel = localStorage.getItem('drexora:model') || null;

  async function loadModels() {
    try {
      const r = await fetch('/api/ai/models');
      if (!r.ok) return;
      const data = await r.json();
      const models = data.models || [];
      modelMenu.innerHTML = '';
      models.forEach(function (m) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'model-item';
        btn.textContent = m;
        btn.addEventListener('click', function () {
          selectedModel = m;
          localStorage.setItem('drexora:model', m);
          modelBadge.textContent = m;
          modelMenu.style.display = 'none';
        });
        modelMenu.appendChild(btn);
      });
      if (!selectedModel && data.defaultModel) selectedModel = data.defaultModel;
      if (selectedModel) modelBadge.textContent = selectedModel;
    } catch (e) { }
  }

  if (modelPicker) {
    modelPicker.addEventListener('click', function () {
      if (!modelMenu) return;
      if (modelMenu.style.display === 'block') modelMenu.style.display = 'none';
      else { modelMenu.style.display = 'block'; loadModels(); }
    });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toast.classList.remove('visible');
    }, 2600);
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

  function responseFor(prompt) {
    var lower = prompt.toLowerCase();
    if (lower.indexOf('plan') !== -1 || lower.indexOf('day') !== -1) {
      return 'Here is a simple way to make the day feel more intentional:\n\n1. Choose one outcome that would make today feel successful.\n2. Block a quiet 60–90 minute focus window for it.\n3. Group small tasks into one short admin block.\n4. Leave a little space between commitments so the plan can breathe.\n\nStart with the smallest visible step. Momentum usually follows clarity.';
    }
    if (lower.indexOf('idea') !== -1 || lower.indexOf('project') !== -1) {
      return 'Let’s explore it together. A good first pass is to list the audience, the problem they keep running into, and the smallest useful version of the solution.\n\nFrom there, we can compare a few directions by effort, usefulness, and what would make the project distinct.';
    }
    if (lower.indexOf('explain') !== -1 || lower.indexOf('learn') !== -1) {
      return 'Absolutely. I’ll keep it clear and build from the basics first. Tell me the topic you want to understand, how familiar you are with it, and whether you prefer an analogy, an example, or a step-by-step explanation.';
    }
    if (lower.indexOf('write') !== -1 || lower.indexOf('message') !== -1) {
      return 'I can help shape that. Share the rough version, who it is for, and the tone you want — concise, warm, professional, direct, or something else. I’ll turn it into a clear draft while keeping your voice.';
    }
    return 'That’s a thoughtful question. I can help you break it down, compare options, draft something, or turn the idea into a practical next step. What outcome would be most useful to you?';
  }

  function addMessage(role, text) {
    if (welcomeState) {
      welcomeState.remove();
      welcomeState = null;
    }
    var list = conversation.querySelector('.message-list');
    if (!list) {
      list = document.createElement('div');
      list.className = 'message-list';
      conversation.appendChild(list);
    }
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
    var message = document.createElement('article');
    message.className = 'message assistant typing-message';
    message.innerHTML = '<span class="message-avatar"><img src="assets/drexora-mark.png" alt=""></span><div class="message-body"><span class="message-label">Drexora AI</span><span class="typing-dots"><i></i><i></i><i></i></span></div>';
    list.appendChild(message);
    message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return message;
  }

  function askLocal(prompt) {
    return new Promise(function (resolve) {
      window.clearTimeout(responseTimer);
      responseTimer = window.setTimeout(function () {
        resolve(responseFor(prompt));
      }, 500);
    });
  }

  async function askAssistant() {
    // Fallback to non-streaming behavior if stream endpoint fails
    try {
      return await askAssistantStream();
    } catch (err) {
      console.warn('Streaming failed, falling back to full response', err);
      var controller = new AbortController();
      var timeout = window.setTimeout(function () { controller.abort(); }, 30000);
      activeRequest = controller;
      updateComposer();
      try {
        var headers = { 'Content-Type': 'application/json' };
        if (currentIdToken) headers['Authorization'] = 'Bearer ' + currentIdToken;
        var response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ messages: chatMessages, model: selectedModel, deepThinking: document.getElementById('deep-think').classList.contains('active') }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error('AI endpoint unavailable');
        var data = await response.json();
        if (!data.reply) throw new Error('Empty AI response');
        return data.reply;
      } catch (error) {
        setConnectionStatus('fallback', 'Local fallback');
        showToast('AI connection unavailable — using local fallback');
        return askLocal(chatMessages[chatMessages.length - 1].content);
      } finally {
        window.clearTimeout(timeout);
        activeRequest = null;
        updateComposer();
      }
    }
  }

  async function askAssistantStream() {
    var headers = { 'Content-Type': 'application/json' };
    if (currentIdToken) headers['Authorization'] = 'Bearer ' + currentIdToken;
    var response = await fetch('/api/ai/chat/stream', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ messages: chatMessages, model: selectedModel, deepThinking: document.getElementById('deep-think').classList.contains('active') })
    });
    if (!response.ok) throw new Error('Stream endpoint unavailable');
    setConnectionStatus('connected', 'Connected');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalReply = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // parse SSE-style events (data: ...\n\n)
      let parts = buffer.split('\n\n');
      buffer = parts.pop();
      for (const part of parts) {
        const lines = part.split('\n');
        for (const line of lines) {
          if (!line) continue;
          if (line.indexOf('data:') === 0) {
            const payload = line.slice(5).trim();
            try {
              const obj = JSON.parse(payload);
              if (obj.delta) {
                finalReply += obj.delta;
                // update the typing message in the UI
                const list = conversation.querySelector('.message-list');
                const lastTyping = list && list.querySelector('.typing-message');
                if (lastTyping) {
                  const p = lastTyping.querySelector('.message-body p');
                  if (p) p.textContent = finalReply;
                }
              }
            } catch (e) { }
          }
        }
      }
    }
    return finalReply;
  }

  async function sendMessage(text) {
    var prompt = text.trim().slice(0, 4000);
    if (!prompt || activeRequest) return;
    input.value = '';
    updateComposer();
    addMessage('user', prompt);
    chatMessages.push({ role: 'user', content: prompt });
    var typing = showTyping();
    var reply = await askAssistant();
    typing.remove();
    addMessage('assistant', reply);
    chatMessages.push({ role: 'assistant', content: reply });
  }

  function resetChat() {
    window.clearTimeout(responseTimer);
    if (activeRequest) activeRequest.abort();
    activeRequest = null;
    chatMessages = [];
    conversation.innerHTML = '';
    var freshWelcome = document.createElement('div');
    freshWelcome.className = 'welcome-state';
    freshWelcome.innerHTML = '<div class="welcome-mark"><img src="assets/drexora-mark.png" alt=""></div><h1>How can I help you today?</h1><p>Ask Drexora AI to think, write, plan, or explore with you.</p><div class="prompt-grid"><button class="prompt-card" type="button" data-prompt="Help me plan a focused and productive day"><span class="prompt-icon purple" aria-hidden="true">◷</span><span><strong>Plan my day</strong><small>Create a focused routine</small></span><span class="prompt-arrow" aria-hidden="true">↗</span></button><button class="prompt-card" type="button" data-prompt="Give me five creative ideas for a side project"><span class="prompt-icon lime" aria-hidden="true">✦</span><span><strong>Explore ideas</strong><small>Find a fresh direction</small></span><span class="prompt-arrow" aria-hidden="true">↗</span></button><button class="prompt-card" type="button" data-prompt="Explain a complex topic in a simple way"><span class="prompt-icon blue" aria-hidden="true">◇</span><span><strong>Learn something</strong><small>Make it easy to understand</small></span><span class="prompt-arrow" aria-hidden="true">↗</span></button><button class="prompt-card" type="button" data-prompt="Help me write a clear and thoughtful message"><span class="prompt-icon orange" aria-hidden="true">✎</span><span><strong>Write with me</strong><small>Turn thoughts into words</small></span><span class="prompt-arrow" aria-hidden="true">↗</span></button></div>';
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

  bindPromptCards();

  // Firebase Auth boot (optional)
  function initFirebaseAuth() {
    if (!window.firebase || !window.__FIREBASE_CONFIG) return;
    try {
      firebase.initializeApp(window.__FIREBASE_CONFIG);
      var auth = firebase.auth();
      auth.onAuthStateChanged(function (user) {
        currentUser = user;
        if (user) {
          user.getIdToken().then(function (t) { currentIdToken = t; updateAuthButton(); });
        } else {
          currentIdToken = null;
          updateAuthButton();
        }
      });
    } catch (err) {
      console.warn('Firebase init failed', err);
    }
  }

  function updateAuthButton() {
    if (!authButton) return;
    if (currentUser) authButton.textContent = 'Sign out';
    else authButton.textContent = 'Sign in';
  }

  function openAuthModal() {
    if (!authModal) return alert('Auth not available');
    authModal.setAttribute('aria-hidden', 'false');
    authModal.style.display = 'block';
  }

  function closeAuthModal() {
    if (!authModal) return;
    authModal.setAttribute('aria-hidden', 'true');
    authModal.style.display = 'none';
    authError.textContent = '';
  }

  if (authClose) authClose.addEventListener('click', closeAuthModal);

  if (authSwitch) authSwitch.addEventListener('click', function () {
    isRegister = !isRegister;
    authTitle.textContent = isRegister ? 'Create account' : 'Sign in';
    authSubmit.textContent = isRegister ? 'Create account' : 'Sign in';
    authSwitch.textContent = isRegister ? 'Have an account? Sign in' : 'Create account';
  });

  if (authReset) authReset.addEventListener('click', function () {
    var email = authEmail.value && authEmail.value.trim();
    if (!email) return authError.textContent = 'Enter your email first';
    firebase.auth().sendPasswordResetEmail(email).then(function () { authError.textContent = 'Reset email sent'; }).catch(function (e) { authError.textContent = e.message; });
  });

  if (authForm) {
    authForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      authError.textContent = '';
      var email = authEmail.value && authEmail.value.trim();
      var pass = authPassword.value || '';
      if (!email || !pass) return authError.textContent = 'Email and password required';
      var auth = firebase.auth();
      if (isRegister) {
        auth.createUserWithEmailAndPassword(email, pass).then(function () { showToast('Account created'); closeAuthModal(); }).catch(function (e) { authError.textContent = e.message; });
      } else {
        auth.signInWithEmailAndPassword(email, pass).then(function () { showToast('Signed in'); closeAuthModal(); }).catch(function (e) { authError.textContent = e.message; });
      }
    });
  }

  if (authButton) {
    authButton.addEventListener('click', function () {
      if (!window.firebase) return alert('Firebase not configured. See README to configure Firebase.');
      var auth = firebase.auth();
      if (currentUser) {
        auth.signOut();
        showToast('Signed out');
      } else {
        openAuthModal();
      }
    });
  }

  initFirebaseAuth();

  document.querySelectorAll('.history-item').forEach(function (button) {
    button.addEventListener('click', function () {
      document.querySelectorAll('.history-item').forEach(function (item) { item.classList.remove('selected'); });
      button.classList.add('selected');
      showToast('Chat history will be connected to your account soon');
      toggleSidebar(false);
    });
  });

  document.getElementById('new-chat').addEventListener('click', resetChat);
  document.getElementById('clear-history').addEventListener('click', function (event) {
    event.preventDefault();
    showToast('Your local chat list is ready to clear');
  });
  document.getElementById('sidebar-open').addEventListener('click', function () { toggleSidebar(true); });
  document.getElementById('sidebar-close').addEventListener('click', function () { toggleSidebar(false); });
  sidebarScrim.addEventListener('click', function () { toggleSidebar(false); });
  document.getElementById('share-chat').addEventListener('click', function () {
    showToast('Sharing will be available when a chat is connected');
  });
  document.getElementById('toggle-theme').addEventListener('click', function () {
    document.body.classList.toggle('light-mode');
    showToast(document.body.classList.contains('light-mode') ? 'Light mode on' : 'Dark mode on');
  });
  document.getElementById('attach-file').addEventListener('click', function () { showToast('File attachments are coming soon'); });
  document.getElementById('deep-think').addEventListener('click', function () {
    this.classList.toggle('active');
    showToast(this.classList.contains('active') ? 'Deep thinking on' : 'Deep thinking off');
  });

  input.addEventListener('input', updateComposer);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input.value);
    }
  });
  composer.addEventListener('submit', function (event) {
    event.preventDefault();
    sendMessage(input.value);
  });
  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      document.getElementById('new-chat').click();
    }
    if (event.key === 'Escape') toggleSidebar(false);
  });
  updateComposer();
})();