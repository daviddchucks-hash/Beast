/* ═══════════════════════════════════════════════════════════════
   Beast AI v3.0 — Code Generation Module (codeGen.js)
   ─────────────────────────────────────────────────────────────
   Features: code detection, file parsing, project memory,
   file explorer UI, individual downloads, ZIP export.
   Exposed as global CodeGen.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

var CodeGen = (function () {

  /* ── Session project memory ─────────────────────────────── */
  var _projects = [];          /* array of project objects this session */
  var _current  = null;        /* most recent project */

  /* ── Code request detection ─────────────────────────────── */
  var CODE_TRIGGERS = [
    /\b(build|create|make|write|generate|code|develop|program|implement)\b.{0,60}\b(app|application|website|web\s*app|web\s*page|site|script|program|system|tool|component|function|class|api|server|bot|game|dashboard|landing|portfolio|form|crud|todo|chat|login|signup|auth|calculator|timer|slider|modal|navbar|menu|card|layout|template|clone|project)\b/i,
    /\b(html|css|javascript|typescript|python|react|vue|angular|node|express|php|java|kotlin|swift|flutter|dart|tailwind)\b.{0,40}\b(code|script|file|page|app|component|snippet|website|project)\b/i,
    /\b(full[\s\-]?stack|front[\s\-]?end|back[\s\-]?end|responsive|mobile[\s\-]?first|pwa|spa|rest\s*api|crud\s*app)\b/i,
    /\bcreate\s+(me\s+)?(a\s+|an\s+)?(complete|full|working|functional|production)/i,
    /\b(generate|write)\s+(the\s+|a\s+|an\s+)?(code|files|project|app|website|script)\b/i,
    /\b(show|give)\s+me\s+(the\s+)?(code|implementation|example\s+of)\b/i,
    /\b(build|make)\s+me\s+a\b/i,
  ];

  function isCodeRequest(input) {
    if (!input || input.length < 6) return false;
    return CODE_TRIGGERS.some(function (p) { return p.test(input); });
  }

  /* ── Enhanced system prompt for code generation ─────────── */
  function buildCodeSystemPrompt() {
    var now     = new Date();
    var dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    var prov    = (window.PM) ? PM.getActiveProviderConfig() : { name: 'AI' };
    var model   = (window.MM) ? MM.getActiveModelInfo()     : null;

    return 'You are Beast, an expert senior software engineer. Today is ' + dateStr + '. Provider: ' + prov.name + (model ? ' (' + model.label + ')' : '') + '.\n\n' +
      'CRITICAL: Generate PRODUCTION-READY, COMPLETE code. No placeholders. No TODOs. No stub functions.\n\n' +
      'OUTPUT FORMAT — MANDATORY:\n' +
      'Separate every file using this EXACT format:\n\n' +
      '[FILE:filename.ext]\n' +
      'complete file content here\n' +
      '[/FILE]\n\n' +
      'After ALL files, add project notes:\n' +
      '[EXPLANATION]\n' +
      'Architecture overview. How to run. How to deploy. Key design decisions.\n' +
      '[/EXPLANATION]\n\n' +
      'REQUIREMENTS:\n' +
      '• Generate ALL files needed — index.html, style.css, script.js, manifest.json, README.md, etc.\n' +
      '• For React/Vue: include package.json with correct dependencies.\n' +
      '• For Node.js apps: include server.js, package.json, .env.example.\n' +
      '• Use modern practices: CSS Grid/Flexbox, ES6+, semantic HTML5, error handling, input validation.\n' +
      '• Make all UIs responsive (mobile-first).\n' +
      '• Include security best practices.\n' +
      '• Never use placeholder images or lorem ipsum unless explicitly asked.\n' +
      '• Think like a senior engineer. Produce deployable results.\n' +
      '• For any project with 3+ files: include README.md with setup instructions.';
  }

  /* ── File block parser ───────────────────────────────────── */
  function parseFiles(text) {
    var files = [];
    var explanation = '';

    /* Primary: [FILE:name]...[/FILE] format */
    var rx = /\[FILE:([^\]\n]{1,120})\]([\s\S]*?)\[\/FILE\]/g;
    var m;
    while ((m = rx.exec(text)) !== null) {
      var name    = m[1].trim();
      var content = m[2].replace(/^\n/, '').replace(/\n$/, '');
      if (name && content) {
        files.push({ name: name, content: content, ext: _ext(name) });
      }
    }

    /* Fallback: markdown code blocks with leading filename comment */
    if (files.length === 0) {
      var mbRx = /```[\w]*\n(?:(?:\/\/|#|<!--|\/\*)\s*(?:file(?:name)?:\s*)?)([^\n]{2,80})\n([\s\S]*?)```/gi;
      while ((m = mbRx.exec(text)) !== null) {
        var fname = m[1].trim();
        var body  = m[2].trim();
        /* Only accept entries that look like filenames */
        if (fname.match(/\.[a-z0-9]{1,6}$/) && body) {
          files.push({ name: fname, content: body, ext: _ext(fname) });
        }
      }
    }

    /* Extract explanation block */
    var expM = text.match(/\[EXPLANATION\]([\s\S]*?)\[\/EXPLANATION\]/);
    if (expM) explanation = expM[1].trim();

    return { files: files, explanation: explanation };
  }

  function _ext(name) {
    var parts = (name || '').split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  }

  /* ── Icon & MIME helpers ─────────────────────────────────── */
  var ICONS = {
    html:'🌐', htm:'🌐', css:'🎨', scss:'🎨', sass:'🎨',
    js:'⚡', ts:'⚡', jsx:'⚛', tsx:'⚛', mjs:'⚡', cjs:'⚡',
    json:'📋', json5:'📋', toml:'📋', yaml:'📋', yml:'📋',
    md:'📝', txt:'📄', env:'🔑',
    py:'🐍', php:'🐘', rb:'💎', go:'🔷', rs:'🦀',
    java:'☕', kt:'🤖', swift:'🍎', dart:'🎯',
    vue:'💚', svelte:'🔥', sql:'🗄️', sh:'💻', bash:'💻',
    xml:'📑', svg:'🖼️', webp:'🖼️', png:'🖼️', jpg:'🖼️',
    gitignore:'🚫', lock:'🔒',
  };
  function _icon(ext) { return ICONS[ext] || '📄'; }

  var MIMES = {
    html:'text/html', htm:'text/html', css:'text/css', scss:'text/css',
    js:'application/javascript', mjs:'application/javascript',
    ts:'application/typescript', jsx:'application/javascript',
    tsx:'application/typescript', json:'application/json',
    md:'text/markdown', txt:'text/plain', py:'text/x-python',
    php:'text/x-php', java:'text/x-java-source', rb:'text/x-ruby',
    go:'text/x-go', rs:'text/x-rustsrc', svg:'image/svg+xml',
    sh:'text/x-sh', bash:'text/x-sh', sql:'application/sql',
    xml:'application/xml', yaml:'text/yaml', yml:'text/yaml',
    env:'text/plain', gitignore:'text/plain',
  };
  function _mime(ext) { return MIMES[ext] || 'text/plain'; }

  /* ── Project name inference ──────────────────────────────── */
  function _inferName(input) {
    if (!input) return 'Generated Project';
    /* e.g. "build a todo app" → "Todo App" */
    var m = input.match(/(?:build|create|make|generate|write)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:complete\s+|full\s+|simple\s+|working\s+)?(.{3,60}?)(?:\s+(?:in\s+html|using|with|for|that|which)|[.!?]|$)/i);
    if (m) {
      var raw = m[1].replace(/[^a-zA-Z0-9 \-]/g, '').trim();
      if (raw.length > 2) return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    return 'Beast Project';
  }

  /* ── Store project ───────────────────────────────────────── */
  function _store(name, files, explanation, userInput) {
    var proj = {
      id:          Date.now(),
      name:        name,
      files:       files,
      explanation: explanation,
      userInput:   userInput || '',
      time:        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    };
    _projects.push(proj);
    if (_projects.length > 20) _projects.shift();
    _current = proj;
    return proj;
  }

  function getProject(id) {
    var nid = parseInt(id, 10);
    for (var i = 0; i < _projects.length; i++) {
      if (_projects[i].id === nid) return _projects[i];
    }
    return null;
  }

  function getCurrentProject() { return _current; }

  /* ── Process full AI response ────────────────────────────── */
  function processResponse(text, userInput) {
    var parsed = parseFiles(text);
    if (!parsed.files.length) return null;
    var name    = _inferName(userInput);
    var project = _store(name, parsed.files, parsed.explanation, userInput);
    return { project: project, html: buildExplorerHTML(project) };
  }

  /* ── Build summary text (removes file blocks from chat) ──── */
  function buildSummaryText(text, project) {
    var clean = text
      .replace(/\[FILE:[^\]]+\][\s\S]*?\[\/FILE\]/g, '')
      .replace(/\[EXPLANATION\][\s\S]*?\[\/EXPLANATION\]/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .trim();

    if (!clean || clean.length < 8) {
      return 'Generated ' + project.files.length + ' file' +
        (project.files.length !== 1 ? 's' : '') +
        ' for "' + project.name + '" — see the file explorer below to view or download.';
    }
    return clean;
  }

  /* ── HTML escape ─────────────────────────────────────────── */
  function _esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Build file explorer HTML ────────────────────────────── */
  function buildExplorerHTML(project) {
    var pid    = project.id;
    var hasZip = (typeof JSZip !== 'undefined');
    var slug   = project.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    var h = '';

    /* ─ container ─ */
    h += '<div class="cg-project" id="cgp-' + pid + '">';

    /* ─ header ─ */
    h += '<div class="cg-header">';
    h +=   '<div class="cg-hd-left">';
    h +=     '<span class="cg-folder-icon">📂</span>';
    h +=     '<span class="cg-proj-name">' + _esc(project.name) + '/</span>';
    h +=     '<span class="cg-file-count">' + project.files.length + ' file' + (project.files.length !== 1 ? 's' : '') + '</span>';
    h +=   '</div>';
    h +=   '<div class="cg-hd-right">';
    if (hasZip) {
      h += '<button class="cg-zip-btn" onclick="CodeGen.downloadZip(' + pid + ')">⬇ ZIP</button>';
    }
    h +=   '</div>';
    h += '</div>';

    /* ─ file tree ─ */
    h += '<div class="cg-tree">';
    h += '<div class="cg-tree-root">📁 ' + _esc(slug) + '</div>';
    project.files.forEach(function (file, idx) {
      var last = (idx === project.files.length - 1);
      h += '<div class="cg-file-row">';
      h +=   '<span class="cg-tree-sym">' + (last ? '└──' : '├──') + '</span>';
      h +=   '<span class="cg-file-ico">' + _icon(file.ext) + '</span>';
      h +=   '<button class="cg-file-btn" onclick="CodeGen.viewFile(' + pid + ',' + idx + ')">' + _esc(file.name) + '</button>';
      h +=   '<button class="cg-dl-btn" onclick="CodeGen.downloadFile(' + pid + ',' + idx + ')" title="Download ' + _esc(file.name) + '">⬇</button>';
      h += '</div>';
    });
    h += '</div>';

    /* ─ explanation ─ */
    if (project.explanation) {
      h += '<div class="cg-explanation">';
      h +=   '<div class="cg-exp-title">// PROJECT NOTES</div>';
      h +=   '<div class="cg-exp-body">' + _esc(project.explanation) + '</div>';
      h += '</div>';
    }

    /* ─ code viewer (hidden by default) ─ */
    h += '<div class="cg-viewer" id="cgv-' + pid + '" style="display:none">';
    h +=   '<div class="cg-viewer-hd">';
    h +=     '<span class="cg-viewer-fname" id="cgvf-' + pid + '"></span>';
    h +=     '<div class="cg-viewer-acts">';
    h +=       '<button class="cg-viewer-dl" id="cgvdl-' + pid + '">⬇ Download</button>';
    h +=       '<button class="cg-viewer-close" onclick="CodeGen.closeViewer(' + pid + ')">✕</button>';
    h +=     '</div>';
    h +=   '</div>';
    h +=   '<pre class="cg-viewer-pre" id="cgvc-' + pid + '"></pre>';
    h += '</div>';

    h += '</div>';
    return h;
  }

  /* ── View file ───────────────────────────────────────────── */
  function viewFile(projectId, fileIdx) {
    var proj = getProject(projectId);
    if (!proj) return;
    var file = proj.files[fileIdx];
    if (!file) return;

    var viewer  = document.getElementById('cgv-'  + projectId);
    var fname   = document.getElementById('cgvf-' + projectId);
    var content = document.getElementById('cgvc-' + projectId);
    var dlBtn   = document.getElementById('cgvdl-'+ projectId);
    if (!viewer) return;

    if (fname)   fname.textContent   = _icon(file.ext) + ' ' + file.name;
    if (content) content.textContent = file.content;
    if (dlBtn) {
      dlBtn.onclick = function () { downloadFile(projectId, fileIdx); };
    }

    viewer.style.display = 'block';
    viewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeViewer(projectId) {
    var viewer = document.getElementById('cgv-' + projectId);
    if (viewer) viewer.style.display = 'none';
  }

  /* ── Download single file ────────────────────────────────── */
  function downloadFile(projectId, fileIdx) {
    var proj = getProject(projectId);
    if (!proj) return;
    var file = proj.files[fileIdx];
    if (!file) return;
    try {
      var blob = new Blob([file.content], { type: _mime(file.ext) + ';charset=utf-8' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    } catch (e) { console.warn('[CodeGen] download error:', e); }
  }

  /* ── Download ZIP ────────────────────────────────────────── */
  function downloadZip(projectId) {
    var proj = getProject(projectId);
    if (!proj) return;

    if (typeof JSZip === 'undefined') {
      /* Lazy-load JSZip if not present */
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = function () { _buildZip(proj); };
      document.head.appendChild(s);
      return;
    }
    _buildZip(proj);
  }

  function _buildZip(proj) {
    try {
      var zip    = new JSZip();
      var folder = zip.folder(proj.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'));
      proj.files.forEach(function (file) { folder.file(file.name, file.content); });
      zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
        .then(function (blob) {
          var url  = URL.createObjectURL(blob);
          var a    = document.createElement('a');
          a.href = url; a.download = proj.name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '.zip';
          document.body.appendChild(a); a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        });
    } catch (e) { console.warn('[CodeGen] ZIP error:', e); }
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {
    isCodeRequest:         isCodeRequest,
    buildCodeSystemPrompt: buildCodeSystemPrompt,
    parseFiles:            parseFiles,
    processResponse:       processResponse,
    buildSummaryText:      buildSummaryText,
    buildExplorerHTML:     buildExplorerHTML,
    viewFile:              viewFile,
    closeViewer:           closeViewer,
    downloadFile:          downloadFile,
    downloadZip:           downloadZip,
    getCurrentProject:     getCurrentProject,
    getProject:            getProject,
  };
})();
