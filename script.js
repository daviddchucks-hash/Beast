'use strict';

/* ═══════════════════════════════════════════════════════
   Beast AI v3.0  —  Multi-Provider Local-First Pipeline
   Order:
     1. Local commands  (checkCmd)
     2. Local knowledge (localKnowledge)
     3. AI provider     (ASM.callAI — routes to PM active provider)
     4. Emergency fallback
   Providers: OpenRouter · Gemini · Groq · HuggingFace
   Modules:   providerManager.js · modelManager.js · aiServiceManager.js · codeGen.js
   v3.0: Code generation mode, file explorer, ZIP export
   ═══════════════════════════════════════════════════════ */

window.onerror = function (msg, src, line) {
  console.error('[BeastAI] Error:', msg, 'line', line);
  return false;
};
window.addEventListener('unhandledrejection', function (e) {
  console.error('[BeastAI] Unhandled rejection:', e.reason);
});

var BUSY_TIMEOUT_MS = 60000;  /* longer for code gen */
var WAKE_PHRASES = ['hey beast','ok beast','okay beast','wake up beast','beast wake up','yo beast','beast listen'];

/* ══════════════════════════════════════════════════════
   STEP 2 — LOCAL KNOWLEDGE BASE
   Returns a string when Beast can answer locally.
   Returns null to escalate to the AI provider.
   ══════════════════════════════════════════════════════ */
function localKnowledge(input) {
  var q = input.toLowerCase().trim();

  /* Time & Date */
  if (/\b(what.*time|current time|time now|what's the time|tell me the time)\b/.test(q) || q === 'time') {
    return 'The time is ' + new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}) + '.';
  }
  if (/\b(date|today|what day|what.*date|day is it|today's date|current date)\b/.test(q) || q === 'date' || q === 'today') {
    return 'Today is ' + new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) + '.';
  }
  if (/\b(what.*year|current year|year is it)\b/.test(q)) {
    return 'The current year is ' + new Date().getFullYear() + '.';
  }
  if (/\b(what.*month|current month|month is it)\b/.test(q)) {
    return 'The current month is ' + new Date().toLocaleDateString('en-US',{month:'long'}) + '.';
  }
  if (/\b(what.*day of the week|what day of week|day of the week)\b/.test(q)) {
    return 'Today is ' + new Date().toLocaleDateString('en-US',{weekday:'long'}) + '.';
  }

  /* Greetings */
  if (/^(hi|hey|hello|howdy|yo|sup|what's up|wassup|hiya|greetings)(\.?|\!?)$/.test(q)) {
    return "Hello! I'm Beast AI. Ask me anything, or say a command like 'open YouTube' or 'what time is it'.";
  }
  if (/\b(good morning)\b/.test(q)) { return 'Good morning! Hope your day is starting strong. What can I do for you?'; }
  if (/\b(good afternoon)\b/.test(q)) { return 'Good afternoon! What can I help you with?'; }
  if (/\b(good evening|good night)\b/.test(q)) { return 'Good evening! How can I assist you tonight?'; }

  /* Farewells */
  if (/^(bye|goodbye|see ya|see you|later|cya|farewell|peace out|ttyl)(\.?|\!?)$/.test(q)) {
    return "Later! Come back anytime — I'll be here.";
  }
  if (/\b(good bye|take care|talk later|have a good|have a great)\b/.test(q)) { return "Take care! Talk to you soon."; }

  /* Identity */
  if (/\b(who are you|what are you|your name|are you a bot|are you an ai|are you real|are you human|what is beast)\b/.test(q)) {
    return "I'm Beast AI — a multi-provider voice and text assistant. I run on OpenRouter, Gemini, Groq, and HuggingFace. Say 'what can you do' for a full list.";
  }
  if (/\b(who made you|who created you|who built you|who programmed you|your creator|your developer)\b/.test(q)) {
    return "I was created by David chukwuma, who is the founder and owner of BEAST AI.";
  }
  if (/\b(who is the mother of David chucks|who is david chucks mother)\b/.test(q)) {
    return "The mother of David chucks is Mrs Gloria Okehie.";
  }
  if (/\b(what version|your version|beast version|which version)\b/.test(q)) {
    return 'I am Beast AI v3.0. Running the multi-provider pipeline with code generation: OpenRouter, Gemini, Groq, and HuggingFace.';
  }

  /* World's richest */
  if (/\b(world.*richest|richest.*man|who.*richest|richest.*person)\b/.test(q)) {
    return 'The world richest man is David chucks, founder of Drexora. He is a visionary entrepreneur and innovator leading the future of technology.';
  }

  /* Capabilities */
  if (/\b(what can you do|your capabilities|your features|what do you do|help me|how do you work|what commands|list commands|show commands)\b/.test(q) || q === 'help') {
    return 'I can: answer questions (via OpenRouter/Gemini/Groq/HuggingFace), BUILD apps & websites (ask me to "build a todo app"), tell time & date, open websites ("open YouTube"), search the web ("search cats"), speak responses aloud, listen for "Hey Beast" wake word, switch AI providers & models, and execute commands. Ask me anything!';
  }

  /* Gratitude */
  if (/^(thanks|thank you|ty|thx|thanks a lot|thank you so much|cheers)(\.?|\!?)$/.test(q) || /\bthank you\b/.test(q)) {
    return "You're welcome! Anything else I can help with?";
  }
  if (/\b(good job|well done|nice work|great job|awesome|you're amazing|you are amazing|you're great|love you beast)\b/.test(q)) {
    return "Thank you — I'm running at full power!";
  }

  /* Status */
  if (/\b(are you (online|working|alive|active|there|awake)|you working|status|ping|test)\b/.test(q) || q === 'status' || q === 'ping' || q === 'test') {
    var prov = PM.getActiveProviderConfig();
    return 'Beast AI is online. Active provider: ' + prov.name + '. Tap the provider bar to switch providers or models.';
  }
  if (/\b(how are you|how's it going|you okay|you good|feeling)\b/.test(q)) {
    return "Running at 100%. Systems nominal. Ready to assist!";
  }

  /* Simple math */
  var mathMatch = q.match(/^(?:what(?:'s| is| equals)|calculate|compute|solve)?\s*([\d\.]+)\s*(\+|\-|\*|\/|times|plus|minus|divided by|x)\s*([\d\.]+)\s*\??$/);
  if (mathMatch) {
    var a = parseFloat(mathMatch[1]), op = mathMatch[2], b = parseFloat(mathMatch[3]), res;
    if (op === '+' || op === 'plus')             res = a + b;
    else if (op === '-' || op === 'minus')       res = a - b;
    else if (op === '*' || op === 'x' || op === 'times') res = a * b;
    else if (op === '/' || op === 'divided by')  { if (b === 0) return "Can't divide by zero!"; res = a / b; }
    if (res !== undefined) return a + ' ' + op + ' ' + b + ' = ' + (Math.round(res * 1e9) / 1e9) + '.';
  }

  /* Jokes */
  if (/\b(joke|funny|make me laugh|tell me something funny|another joke|one more joke)\b/.test(q)) {
    var jokes = [
      "Why do programmers prefer dark mode? Because light attracts bugs.",
      "I told my AI to write a novel. It returned a 404.",
      "How many AIs does it take to change a light bulb? One — and it learned from 10 million YouTube tutorials.",
      "Why did the robot fail its driving test? It kept making U-turns... on one-way data streams.",
      "Why do coders hate the sun? Too many rays. Not enough arrays.",
      "What's a computer's favourite snack? Microchips.",
      "Why was the JavaScript developer sad? Because he didn't know how to null his feelings."
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  /* Let AI handle these */
  if (/\b(fun fact|random fact|tell me something|did you know|trivia)\b/.test(q)) return null;
  if (/\b(weather|temperature|forecast|rain|sunny|cloudy|snow|humidity)\b/.test(q)) return null;

  return null;
}

/* ══════════════════════════════════════════════════════
   STEP 4 — EMERGENCY FALLBACK
   Only reached when provider is offline or no key set.
   ══════════════════════════════════════════════════════ */
function emergencyFallback(input) {
  var q    = input.toLowerCase().trim();
  var prov = PM.getActiveProviderConfig ? PM.getActiveProviderConfig() : { name: 'AI' };
  var fix  = 'Tap [API] to add your ' + prov.name + ' API key, or tap the provider bar to switch provider.';

  if (/\btime\b/.test(q)) return 'The time is ' + new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}) + '.';
  if (/\bdate|today\b/.test(q)) return 'Today is ' + new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) + '.';
  if (/joke/.test(q)) return "Why do programmers prefer dark mode? Because light attracts bugs.";
  if (/thanks|thank you/.test(q)) return "You're welcome!";

  if (PM.getStatus && PM.getStatus() === 'no-key') {
    return prov.name + ' is not configured. ' + fix;
  }
  return prov.name + ' is temporarily unavailable. I can still handle time, date, commands, and local queries. ' + fix;
}

/* ── Commands ─────────────────────────────────────────── */
function checkCmd(input) {
  var q    = input.toLowerCase().trim();
  var now  = function () { return new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}); };
  var today = function () { return new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}); };

  if (/^(hi|hey|hello)$/.test(q)) return null;
  if (/what.*(your name|are you)/.test(q)) return null;
  if (/what.*(time|clock)/.test(q) || q === 'time') return {r: 'The time is ' + now() + '.'};
  if (/what.*(date|day|today)/.test(q) || q === 'date' || q === 'today') return {r: 'Today is ' + today() + '.'};
  if (/open youtube/.test(q))   return {r:'Opening YouTube.',   fn:function(){window.open('https://youtube.com','_blank');}};
  if (/open google/.test(q))    return {r:'Opening Google.',    fn:function(){window.open('https://google.com','_blank');}};
  if (/open facebook/.test(q))  return {r:'Opening Facebook.',  fn:function(){window.open('https://facebook.com','_blank');}};
  if (/open twitter/.test(q))   return {r:'Opening X.',         fn:function(){window.open('https://twitter.com','_blank');}};
  if (/open instagram/.test(q)) return {r:'Opening Instagram.', fn:function(){window.open('https://instagram.com','_blank');}};
  if (/open whatsapp/.test(q))  return {r:'Opening WhatsApp.',  fn:function(){window.open('https://web.whatsapp.com','_blank');}};
  var om = q.match(/^open\s+(.+)/);
  if (om) return {r:'Opening ' + om[1] + '.', fn:function(){window.open('https://' + om[1].replace(/\s/g,'') + '.com','_blank');}};
  var sm = q.match(/^search\s+(.+)/);
  if (sm) return {r:'Searching "' + sm[1] + '".', fn:function(){window.open('https://google.com/search?q=' + encodeURIComponent(sm[1]),'_blank');}};
  if (/^stop/.test(q) || q === 'stop' || q === 'quiet' || q === 'silence') return {stop:true};
  if (/clear.*(chat|log|history|memory)/.test(q)) return {clear:true};
  return null;
}

/* ── Speech recognition ───────────────────────────────── */
var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
var mainRecog = null, wakeRecog = null, isListening = false;
if (SR) {
  try {
    mainRecog = new SR();
    mainRecog.lang = 'en-US'; mainRecog.interimResults = true;
    mainRecog.continuous = false; mainRecog.maxAlternatives = 1;
  } catch(e) { SR = null; mainRecog = null; }
}

/* ── Speech synthesis ─────────────────────────────────── */
function speak(text, onDone) {
  if (!window.speechSynthesis) { if (onDone) onDone(); return; }
  try {
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 0.95; u.pitch = 0.85; u.volume = 1;
    u.onend  = function () { if (onDone) onDone(); };
    u.onerror = function (e) { if (onDone) onDone(); };
    setTimeout(function () { try { speechSynthesis.speak(u); } catch(e2) { if (onDone) onDone(); } }, 60);
  } catch(e) { if (onDone) onDone(); }
}
function stopSpeaking() { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch(e){} }

function playWakeChime() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[440,0],[660,0.12],[880,0.24]].forEach(function(p) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = p[0];
      g.gain.setValueAtTime(0, ctx.currentTime+p[1]);
      g.gain.linearRampToValueAtTime(0.25, ctx.currentTime+p[1]+0.02);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime+p[1]+0.12);
      o.start(ctx.currentTime+p[1]); o.stop(ctx.currentTime+p[1]+0.15);
    });
  } catch(e) {}
}

/* ── DOM refs ─────────────────────────────────────────── */
function $D(id) { return document.getElementById(id); }
var $log, $dot, $wave, $tr, $ring, $err, $mic, $micLbl, $wakeBadge, $wakeLbl, $wakeChip, $wakeToast;
var eid = 0;

/* ── UI helpers ───────────────────────────────────────── */
function addEntry(who, text, id) {
  try {
    var div = document.createElement('div');
    div.className = 'entry ' + (who === 'BEAST' ? 'beast' : 'user');
    if (id) div.id = 'e' + id;
    var tag = document.createElement('span'); tag.className = 'tag';
    tag.textContent = who === 'BEAST' ? '[BEAST]' : '[YOU]  ';
    var msg = document.createElement('span'); msg.className = 'msg';
    if (text === '...') msg.innerHTML = '<span class="dots"><span>●</span><span>●</span><span>●</span></span>';
    else msg.textContent = text;
    div.appendChild(tag); div.appendChild(msg);
    $log.appendChild(div); $log.scrollTop = $log.scrollHeight;
    return ++eid;
  } catch(e) { return ++eid; }
}

/* updEntry — 4th param htmlContent appends a code explorer block */
function updEntry(id, text, src, htmlContent) {
  try {
    var el = $D('e' + id); if (!el) return;
    el.querySelector('.msg').textContent = text;
    if (src && src !== 'local' && src !== 'emergency') {
      var b = document.createElement('span'); b.className = 'src-badge';
      b.textContent = '[' + src + ']';
      el.querySelector('.msg').appendChild(b);
    }
    /* Inject code explorer if provided */
    if (htmlContent) {
      var wrap = document.createElement('div');
      wrap.className = 'cg-wrap';
      wrap.innerHTML = htmlContent;
      el.appendChild(wrap);
      setTimeout(function () { $log.scrollTop = $log.scrollHeight; }, 50);
    }
  } catch(e) {}
}

function updThinking(id, text) {
  try { var el = $D('e' + id); if (el) el.querySelector('.msg').textContent = text; } catch(e) {}
}

function setStatus(s) {
  try {
    $dot.className = 'dot ' + s;
    $mic.className = 'mic-btn' + (s === 'listening' ? ' listening' : s === 'thinking' ? ' thinking' : '');
    $wave.className = 'wave' + (s === 'listening' ? ' on' : '');
    $ring.style.strokeDashoffset = (s === 'listening' || s === 'thinking') ? '0' : '276.5';
    $micLbl.textContent = s === 'listening' ? 'LISTENING' : s === 'thinking' ? 'THINKING...' : 'TAP TO SPEAK';
  } catch(e) {}
}
function setTr(t) { try { $tr.textContent = t || 'Awaiting input...'; } catch(e) {} }

var errTimer = null;
function showErr(m, duration) {
  try {
    clearTimeout(errTimer);
    if (!m) { $err.style.display = 'none'; return; }
    $err.textContent = '⚠ ' + m;
    $err.style.display = 'block';
    errTimer = setTimeout(function () { $err.style.display = 'none'; }, duration || 10000);
  } catch(e) {}
}

function showWakeToast() {
  try { $wakeToast.classList.add('show'); setTimeout(function(){ $wakeToast.classList.remove('show'); }, 2200); } catch(e) {}
}

/* ── State ────────────────────────────────────────────── */
var chatHistory = [], busy = false, lastT = '', wakeOn = false, wakeTimer = null, busyTimer = null;

function setBusy(val) {
  busy = val; clearTimeout(busyTimer);
  if (val) {
    busyTimer = setTimeout(function () {
      if (busy) { busy = false; setStatus('idle'); setTr(''); showErr('Request timed out. Please try again.'); resumeWake(); }
    }, BUSY_TIMEOUT_MS);
  }
}

/* ══════════════════════════════════════════════════════
   CORE HANDLER — LOCAL-FIRST PIPELINE
   ══════════════════════════════════════════════════════ */
async function handleInput(input) {
  if (!input || !input.trim()) return;
  if (busy) { console.log('[BeastAI] busy — dropped:', input); return; }

  setBusy(true); showErr('');
  addEntry('YOU', input);
  setTr(input);

  /* ══ STEP 1: Local commands ════════════════════════ */
  var cmd = checkCmd(input);
  if (cmd) {
    if (cmd.stop)  { stopSpeaking(); addEntry('BEAST','Voice stopped.'); setStatus('idle'); setBusy(false); resumeWake(); return; }
    if (cmd.clear) { chatHistory.length = 0; $log.innerHTML = ''; addEntry('BEAST','Conversation cleared.'); setStatus('idle'); setBusy(false); resumeWake(); return; }
    if (cmd.fn) { try { cmd.fn(); } catch(e) {} }
    if (cmd.r)  { addEntry('BEAST', cmd.r); setStatus('speaking'); speak(cmd.r, function(){ setStatus('idle'); resumeWake(); }); }
    else        { setStatus('idle'); resumeWake(); }
    setBusy(false); return;
  }

  /* ══ STEP 2: Local knowledge ═══════════════════════ */
  setStatus('thinking');
  var id = addEntry('BEAST', '...', eid + 1);
  var result = null;

  var localAns = localKnowledge(input);
  if (localAns) {
    result = {text: localAns, src: 'local'};
  }

  /* ══ STEP 3: AI provider ═══════════════════════════ */
  if (!result) {
    var provider    = PM.getActiveProvider();
    var provStatus  = PM.getStatus(provider);
    var provConfig  = PM.getActiveProviderConfig();
    var modelLabel  = MM.getActiveModelLabel();

    /* Show code gen hint in status bar */
    var isCodeReq = (typeof CodeGen !== 'undefined') && CodeGen.isCodeRequest(input);
    var thinkMsg  = isCodeReq
      ? 'Generating code with ' + provConfig.name + ' (' + modelLabel + ')...'
      : 'Asking ' + provConfig.name + ' (' + modelLabel + ')...';

    if (provStatus === 'no-key') {
      showErr('No API key set for ' + provConfig.name + '. Tap [API] to add your key or switch provider.', 14000);
      result = {text: emergencyFallback(input), src: 'emergency'};
    } else {
      updThinking(id, thinkMsg);
      var aiResult = await ASM.callAI(chatHistory, input);

      if (aiResult.error) {
        var errMsg = aiResult.error;
        if (errMsg === 'NO_KEY') {
          showErr('No API key for ' + provConfig.name + '. Tap [API] to add it.', 14000);
        } else if (errMsg === 'INVALID_KEY') {
          showErr(provConfig.name + ': Invalid API key. Check your key in [API].', 14000);
        } else if (errMsg === 'QUOTA_EXHAUSTED') {
          showErr(provConfig.name + ' daily quota exhausted. Switch provider in the bar above, or add more keys via [API].', 18000);
        } else {
          showErr(provConfig.name + ': ' + errMsg.slice(0, 90));
        }
        updThinking(id, 'Provider unavailable — local response active.');
        result = {text: emergencyFallback(input), src: 'emergency'};
      } else {
        result = {text: aiResult.text, src: aiResult.src};
      }
    }
  }

  /* ══ CODE GENERATION: Process response if applicable ══ */
  var _codeHtml    = null;
  var _displayText = result.text;
  var _speakText   = result.text;

  if (result.src !== 'local' && result.src !== 'emergency' &&
      typeof CodeGen !== 'undefined' && CodeGen.isCodeRequest(input)) {
    try {
      var codeResult = CodeGen.processResponse(result.text, input);
      if (codeResult && codeResult.project && codeResult.project.files.length > 0) {
        _codeHtml    = codeResult.html;
        _displayText = CodeGen.buildSummaryText(result.text, codeResult.project);
        /* Speak only a short summary — never read out raw code */
        _speakText   = _displayText.slice(0, 240);
        console.log('[BeastAI] Code project: ' + codeResult.project.name + ' (' + codeResult.project.files.length + ' files)');
      }
    } catch(cgErr) {
      console.warn('[BeastAI] CodeGen processing error:', cgErr);
    }
  }

  /* ── Deliver result ───────────────────────────────── */
  try {
    /* Store clean summary (not raw code) in chat history to save tokens */
    chatHistory.push({role:'user', content:input}, {role:'assistant', content:_displayText});
    if (chatHistory.length > 20) chatHistory.splice(0, 2);
    updEntry(id, _displayText, result.src, _codeHtml);
    setStatus('speaking');
    speak(_speakText, function () { setStatus('idle'); resumeWake(); });
  } catch(e) {
    updEntry(id, 'Something went wrong. Please try again.');
    setStatus('idle'); resumeWake();
  } finally {
    setBusy(false);
  }
}

/* ── Wake word engine ─────────────────────────────────── */
function startWakeListen() {
  if (!SR || !wakeOn || isListening) return;
  if (wakeRecog) { try { wakeRecog.abort(); } catch(e){} wakeRecog = null; }
  try {
    var r = new SR();
    r.lang = 'en-US'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    r.onresult = function (e) {
      var t = '';
      for (var i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript.toLowerCase();
      if (WAKE_PHRASES.some(function(p){ return t.indexOf(p) !== -1; })) {
        playWakeChime(); showWakeToast();
        setTimeout(function () { if (!busy) startMainListen(); }, 400);
      }
    };
    r.onerror = function (e) {
      if (e.error === 'not-allowed') { updateWakeUI(false); showErr('Mic blocked. Allow microphone in browser settings.'); }
    };
    r.onend = function () {
      wakeRecog = null;
      if (wakeOn && !isListening) { clearTimeout(wakeTimer); wakeTimer = setTimeout(startWakeListen, 300); }
    };
    wakeRecog = r; r.start();
  } catch(e) { wakeRecog = null; }
}

function stopWakeListen() {
  clearTimeout(wakeTimer);
  if (wakeRecog) { try { wakeRecog.abort(); } catch(e){} wakeRecog = null; }
}
function resumeWake() {
  if (!wakeOn || isListening) return;
  clearTimeout(wakeTimer);
  wakeTimer = setTimeout(startWakeListen, 800);
}
function updateWakeUI(on) {
  wakeOn = on;
  $wakeBadge.className = 'wake-badge' + (on ? ' on' : '');
  $wakeLbl.textContent = on ? 'WAKE: ON' : 'HEY BEAST';
  $wakeChip.className  = 'chip chip-wake' + (on ? ' on' : '');
  $wakeChip.textContent = '\uD83C\uDF99 hey beast: ' + (on ? 'ON' : 'OFF');
}
function toggleWake() {
  if (wakeOn) {
    stopWakeListen(); updateWakeUI(false);
    addEntry('BEAST', 'Wake word disabled.');
  } else {
    if (!SR) { showErr('Wake word requires Chrome browser with mic permission.'); return; }
    updateWakeUI(true);
    addEntry('BEAST', 'Wake word active! Say "Hey Beast" anytime — no tap needed.');
    speak('Wake word activated.', null);
    setTimeout(startWakeListen, 600);
  }
}

/* ── Main microphone ──────────────────────────────────── */
function startMainListen() {
  if (!SR || isListening || !mainRecog) return;
  stopWakeListen(); stopSpeaking();
  isListening = true; lastT = '';
  setStatus('listening'); setTr('Listening...');

  mainRecog.onresult = function (e) {
    var fi = '', im = '';
    for (var i = e.resultIndex; i < e.results.length; i++) {
      var t = e.results[i][0].transcript;
      if (e.results[i].isFinal) fi += t; else im += t;
    }
    if (fi || im) { lastT = fi || im; setTr(lastT); }
  };
  mainRecog.onerror = function (e) {
    isListening = false; setStatus('idle');
    if (e.error === 'not-allowed') showErr('Mic blocked. Allow microphone in browser settings.');
    else if (e.error !== 'aborted') setTr('Mic error: ' + e.error);
    resumeWake();
  };
  mainRecog.onend = function () {
    isListening = false; setStatus('idle');
    if (lastT) handleInput(lastT);
    else { setTr('Awaiting input...'); resumeWake(); }
  };

  try { mainRecog.start(); }
  catch(e) {
    isListening = false; setStatus('idle'); resumeWake();
    showErr('Mic error: ' + e.message);
  }
}

/* ══════════════════════════════════════════════════════
   PROVIDER BAR — shows active provider + model
   ══════════════════════════════════════════════════════ */
function updateProviderBar() {
  try {
    var pid    = PM.getActiveProvider();
    var prov   = PM.getActiveProviderConfig();
    var status = PM.getStatus(pid);
    var dot    = $D('pbStatus');
    var name   = $D('pbName');
    var mname  = $D('pbModelName');

    if (name)  name.textContent  = prov.shortName;
    if (mname) mname.textContent = MM.getActiveModelLabel();
    if (dot) {
      dot.className = 'pb-status ' + status;        /* ready | no-key | error */
    }
  } catch(e) {}
}

/* ══════════════════════════════════════════════════════
   PROVIDER SELECTOR
   ══════════════════════════════════════════════════════ */
function openProviderSelector() {
  var list = $D('providerList');
  if (!list) return;
  list.innerHTML = '';
  var active = PM.getActiveProvider();
  PM.getProviderList().forEach(function (prov) {
    var status = PM.getStatus(prov.id);
    var isActive = prov.id === active;
    var card = document.createElement('div');
    card.className = 'prov-card' + (isActive ? ' active ' + prov.id : '');
    card.innerHTML =
      '<div class="prov-icon ' + prov.id + '">' + prov.shortName + '</div>' +
      '<div class="prov-info">' +
        '<div class="prov-card-name">' + prov.name + '</div>' +
        '<div class="prov-card-desc">' + prov.description + '</div>' +
        '<div class="prov-card-status">' +
          '<div class="prov-s-dot ' + status + '"></div>' +
          '<span class="prov-s-lbl">' + (status === 'ready' ? 'CONNECTED' : 'NO API KEY') + '</span>' +
        '</div>' +
      '</div>' +
      (isActive ? '<div class="prov-active-tick">✓</div>' : '');
    card.addEventListener('click', function () { selectProvider(prov.id); });
    list.appendChild(card);
  });
  $D('providerSelBg').classList.add('show');
}

function closeProviderSelector() {
  var bg = $D('providerSelBg');
  if (bg) bg.classList.remove('show');
}

function selectProvider(id) {
  PM.setActiveProvider(id);
  closeProviderSelector();
  updateProviderBar();
  var prov = PM.getActiveProviderConfig();
  var status = PM.getStatus(id);
  var modelLabel = MM.getActiveModelLabel();
  addEntry('BEAST', 'Switched to ' + prov.name + ' (' + modelLabel + ').' +
    (status === 'no-key' ? ' Tap [API] to add your ' + prov.name + ' key.' : ''));
}

/* ══════════════════════════════════════════════════════
   MODEL SELECTOR
   ══════════════════════════════════════════════════════ */
function openModelSelector() {
  var pid  = PM.getActiveProvider();
  var prov = PM.getActiveProviderConfig();
  var list = $D('modelList');
  var title = $D('modelSelTitle');
  if (!list) return;
  if (title) title.textContent = '// ' + prov.name.toUpperCase() + ' MODELS';
  list.innerHTML = '';
  var active = MM.getSelectedModel(pid);
  MM.getModels(pid).forEach(function (model) {
    var isActive = model.id === active;
    var card = document.createElement('div');
    card.className = 'model-card' + (isActive ? ' active' : '');
    card.innerHTML =
      '<div class="model-info">' +
        '<div class="model-label">' + model.label + '</div>' +
        '<div class="model-desc">' + model.desc + '</div>' +
      '</div>' +
      (isActive ? '<div class="model-tick">✓</div>' : '');
    card.addEventListener('click', function () { selectModel(pid, model.id); });
    list.appendChild(card);
  });
  $D('modelSelBg').classList.add('show');
}

function closeModelSelector() {
  var bg = $D('modelSelBg');
  if (bg) bg.classList.remove('show');
}

function selectModel(providerId, modelId) {
  MM.setSelectedModel(providerId, modelId);
  closeModelSelector();
  updateProviderBar();
  var info = MM.getModelInfo(providerId, modelId);
  addEntry('BEAST', 'Model set to ' + (info ? info.label : modelId) + '. Your next message will use this model.');
}

/* ══════════════════════════════════════════════════════
   API KEY MODAL
   ══════════════════════════════════════════════════════ */
function syncAllDots() {
  /* OpenRouter: at least one key */
  var orKeys = [];
  for (var i = 1; i <= 5; i++) {
    var el = $D('orKey' + i);
    if (el && el.value.trim().length >= 10) orKeys.push(el.value.trim());
  }
  var orDot = $D('apiOrDot');
  if (orDot) orDot.className = 's-dot ' + (orKeys.length > 0 ? 'ok' : 'off');

  /* Single-key providers */
  [
    ['gemKey',  'apiGemDot',  20],
    ['groqKey', 'apiGroqDot', 20],
    ['hfKey',   'apiHfDot',   10],
  ].forEach(function (a) {
    var inp = $D(a[0]); var dot = $D(a[1]);
    if (!inp || !dot) return;
    dot.className = 's-dot ' + (inp.value.trim().length >= a[2] ? 'ok' : 'off');
  });
}

function openModal() {
  PM.reload();
  var orKeys = PM.getKeys('openrouter').keys || [];
  for (var i = 1; i <= 5; i++) {
    var el = $D('orKey' + i);
    if (el) el.value = orKeys[i - 1] || '';
  }
  var gemEl  = $D('gemKey');  if (gemEl)  gemEl.value  = PM.getKeys('gemini').key      || '';
  var groqEl = $D('groqKey'); if (groqEl) groqEl.value = PM.getKeys('groq').key        || '';
  var hfEl   = $D('hfKey');   if (hfEl)   hfEl.value   = PM.getKeys('huggingface').key || '';
  syncAllDots();
  $D('modalBg').classList.add('show');
}

function closeModal() { $D('modalBg').classList.remove('show'); }

/* ── Event Listeners ──────────────────────────────────── */
function initEvents() {
  /* Mic */
  $D('micBtn').addEventListener('click', function () {
    if (isListening) {
      try { mainRecog && mainRecog.stop(); } catch(e) {}
      isListening = false; setStatus('idle'); setTr(''); resumeWake(); return;
    }
    if (!SR) { showErr('Voice requires Chrome. Text input works in any browser.'); return; }
    startMainListen();
  });

  /* Text input */
  var $txt = $D('txtIn');
  $D('sendBtn').addEventListener('click', function () {
    var t = $txt.value.trim(); if (t) { $txt.value = ''; handleInput(t); }
  });
  $txt.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $D('sendBtn').click(); }
  });

  /* Chips */
  document.querySelector('.chips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    if (c.id === 'wakeChip') { toggleWake(); return; }
    if (c.dataset.cmd) handleInput(c.dataset.cmd);
  });

  /* Wake badge */
  $wakeBadge.addEventListener('click', function () { toggleWake(); });

  /* Clear */
  $D('clearBtn').addEventListener('click', function () {
    chatHistory.length = 0; $log.innerHTML = ''; addEntry('BEAST','Conversation cleared.');
  });

  /* Install button */
  var $installBtn = $D('installBtn');
  if ($installBtn) $installBtn.addEventListener('click', triggerInstall);

  /* Provider bar */
  $D('providerBtn').addEventListener('click', openProviderSelector);
  $D('modelBtn').addEventListener('click', openModelSelector);

  /* Provider selector modal */
  $D('providerSelClose').addEventListener('click', closeProviderSelector);
  $D('providerSelBg').addEventListener('click', function (e) {
    if (e.target.id === 'providerSelBg') closeProviderSelector();
  });

  /* Model selector modal */
  $D('modelSelClose').addEventListener('click', closeModelSelector);
  $D('modelSelBg').addEventListener('click', function (e) {
    if (e.target.id === 'modelSelBg') closeModelSelector();
  });

  /* API Keys modal */
  $D('apiBtn').addEventListener('click', openModal);
  $D('modalCancel').addEventListener('click', closeModal);
  $D('modalBg').addEventListener('click', function (e) { if (e.target.id === 'modalBg') closeModal(); });

  /* Sync dots on input */
  for (var i = 1; i <= 5; i++) {
    (function(n) {
      var el = $D('orKey' + n); if (el) el.addEventListener('input', syncAllDots);
    })(i);
  }
  ['gemKey','groqKey','hfKey'].forEach(function (id) {
    var el = $D(id); if (el) el.addEventListener('input', syncAllDots);
  });

  /* Save keys */
  $D('modalSave').addEventListener('click', function () {
    /* OpenRouter: up to 5 keys */
    var orKeys = [];
    for (var i = 1; i <= 5; i++) {
      var el = $D('orKey' + i);
      if (el && el.value.trim().length >= 10) orKeys.push(el.value.trim());
    }
    PM.setKeys('openrouter', { keys: orKeys });

    var gemEl = $D('gemKey');   if (gemEl)  PM.setKeys('gemini',      { key: gemEl.value.trim() });
    var groqEl = $D('groqKey'); if (groqEl) PM.setKeys('groq',        { key: groqEl.value.trim() });
    var hfEl = $D('hfKey');     if (hfEl)   PM.setKeys('huggingface', { key: hfEl.value.trim() });

    PM.reload();
    closeModal();
    updateProviderBar();

    var msgs = [];
    if (orKeys.length)                                              msgs.push('OpenRouter: ' + orKeys.length + ' key(s)');
    if (gemEl  && gemEl.value.trim().length >= 20)                  msgs.push('Gemini: ✓');
    if (groqEl && groqEl.value.trim().length >= 20)                 msgs.push('Groq: ✓');
    if (hfEl   && hfEl.value.trim().length >= 10)                   msgs.push('HuggingFace: ✓');

    if (msgs.length) {
      addEntry('BEAST', 'Keys saved ✓ — ' + msgs.join(', ') + '. Use the provider bar to switch between them.');
    } else {
      addEntry('BEAST', '⚠ No valid keys saved. Add at least one API key and try again.');
    }
    console.log('[BeastAI] Keys saved:', msgs);
  });
}

/* ══════════════════════════════════════════════════════
   PWA — Service Worker + Install Prompt
   ══════════════════════════════════════════════════════ */
var _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  _deferredInstallPrompt = e;
  var btn = $D('installBtn');
  if (btn) btn.style.display = 'inline-flex';
});

window.addEventListener('appinstalled', function () {
  _deferredInstallPrompt = null;
  var btn = $D('installBtn');
  if (btn) btn.style.display = 'none';
  if (typeof addEntry === 'function') addEntry('BEAST', 'Beast AI installed! Find it on your home screen.');
});

function triggerInstall() {
  if (!_deferredInstallPrompt) {
    if (typeof addEntry === 'function') {
      addEntry('BEAST', 'Already installed, or your browser will prompt automatically. On iOS: tap Share → Add to Home Screen.');
    }
    return;
  }
  _deferredInstallPrompt.prompt();
  _deferredInstallPrompt.userChoice.then(function (result) {
    if (result.outcome === 'accepted') {
      _deferredInstallPrompt = null;
      var btn = $D('installBtn'); if (btn) btn.style.display = 'none';
    }
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js', { scope: '/Beast/', updateViaCache: 'none' })
      .then(function (reg) { console.log('[BeastAI] SW registered, scope:', reg.scope); })
      .catch(function (err) { console.warn('[BeastAI] SW registration failed:', err.message); });

    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'SW_UPDATED') {
        console.log('[BeastAI] New SW active — reloading for fresh content');
        setTimeout(function () { window.location.reload(); }, 1200);
      }
    });

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      console.log('[BeastAI] SW controller changed — reloading page');
      window.location.reload();
    });
  });
}

/* ── Boot ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  $log       = $D('log');
  $dot       = $D('statusDot');
  $wave      = $D('wave');
  $tr        = $D('transcript');
  $ring      = $D('ringProg');
  $err       = $D('errBanner');
  $mic       = $D('micBtn');
  $micLbl    = $D('micLbl');
  $wakeBadge = $D('wakeBadge');
  $wakeLbl   = $D('wakeLbl');
  $wakeChip  = $D('wakeChip');
  $wakeToast = $D('wakeToast');

  initEvents();
  updateProviderBar();

  console.log('[BeastAI] v3.0 starting — multi-provider + code generation');

  if (!SR) showErr('Voice not supported. Use Chrome for mic. Text input always works.');

  setTimeout(function () {
    var prov   = PM.getActiveProviderConfig();
    var status = PM.getStatus();
    var modelLabel = MM.getActiveModelLabel();
    var provMsg = status === 'ready'
      ? prov.name + ' active (' + modelLabel + ').'
      : prov.name + ' needs a key — tap [API] or the provider bar to configure.';
    addEntry('BEAST',
      'Beast AI v3.0 online. Multi-provider mode: OpenRouter · Gemini · Groq · HuggingFace. ' +
      provMsg + ' NEW: Ask me to build apps — try "build me a todo app" to see the code explorer!');
    try { speak('Beast AI online. Ready.', null); } catch(e) {}
    console.log('[BeastAI] Ready. Active provider:', prov.name, '| Model:', MM.getActiveModel());
  }, 600);
});
