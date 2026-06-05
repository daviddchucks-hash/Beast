/* ═══════════════════════════════════════════════════════════════
   Beast AI v2.6 — Code Generation Manager (codeGenManager.js)
   ─────────────────────────────────────────────────────────────
   Handles: code request detection, enhanced system prompting,
   file parsing from AI responses, project session memory,
   file explorer UI, individual file downloads, ZIP export.

   File Format Covenant (what ASM instructs the AI to output):
     ---FILE: filename.ext---
     [complete file content]
     ---END---
     (repeated per file)
     ---EXPLANATION---
     [architecture + run instructions]
     ---END---

   Exposed as global CGM.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

var CGM = (function () {

  /* ══════════════════════════════════════════════════════════
     CODE REQUEST DETECTION
     ══════════════════════════════════════════════════════════ */
  var CODE_VERBS = /\b(build|create|write|generate|make|code|develop|implement|scaffold|design|set up|setup|program|craft|produce)\b/i;
  var CODE_NOUNS = /\b(app|application|website|site|page|project|tool|script|program|system|game|api|backend|frontend|server|component|widget|form|dashboard|portfolio|todo|calculator|timer|chat|blog|shop|store|landing|navbar|menu|modal|gallery|carousel|slider|quiz|login|signup|auth|database|crud)\b/i;
  var CODE_LANGS = /\b(html|css|javascript|js|typescript|ts|python|py|react|vue|angular|node|express|django|flask|php|java|golang|go|rust|swift|kotlin|sql|json|yaml|bash|shell|c\+\+|c#|ruby|rails)\b/i;
  var CODE_PHRASE = /\b(full.?stack|web.?app|mobile.?app|responsive|pwa|single.?page|rest.?api|graphql|rest api)\b/i;

  function isCodeRequest(input) {
    var q = input.toLowerCase();
    /* Must have a code verb + (code noun OR language) */
    if (CODE_VERBS.test(q) && (CODE_NOUNS.test(q) || CODE_LANGS.test(q))) return true;
    if (CODE_PHRASE.test(q)) return true;
    /* Direct language questions */
    if (/\b(write|show|give me)\b.{1,30}\b(code|snippet|function|class|component|script)\b/i.test(q)) return true;
    return false;
  }

  /* ══════════════════════════════════════════════════════════
     SYSTEM PROMPT — code generation mode
     ══════════════════════════════════════════════════════════ */
  function buildCodeSystemPrompt() {
    var now  = new Date();
    var dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    var timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    return [
      'You are Beast, an expert senior software engineer. Today is ' + dateStr + ', time is ' + timeStr + '.',
      '',
      'MISSION: Generate COMPLETE, PRODUCTION-READY code. No placeholders, no TODOs, no skeleton code.',
      '',
      'RESPONSE FORMAT — follow this EXACTLY:',
      '',
      'Start with a 2–3 sentence project summary.',
      '',
      'Then output each file like this:',
      '',
      '---FILE: filename.ext---',
      '[complete file content — no truncation]',
      '---END---',
      '',
      '(repeat for every file)',
      '',
      'Finally add:',
      '',
      '---EXPLANATION---',
      '**Architecture:** [explain structure]',
      '**File Purposes:** [what each file does]',
      '**How to Run:** [exact steps]',
      '**How to Deploy:** [deployment options]',
      '**Suggested Improvements:** [3–5 ideas]',
      '---END---',
      '',
      'CODE STANDARDS (non-negotiable):',
      '• Complete working code — every file must be fully implemented',
      '• Modern HTML5 / CSS3 / ES2022+ / current framework versions',
      '• Responsive design for all web projects (mobile-first)',',
      '• Error handling in all async code',
      '• Security: escape user input, no inline event handlers, CSP-friendly',
      '• Accessibility: semantic HTML, ARIA labels, keyboard navigation',
      '• Clean architecture: separation of concerns, DRY, single responsibility',
      '• Deployable as-is — user should be able to run without modification',
      '• For web projects include at minimum: index.html, style.css, script.js',
      '• For Node.js projects include: package.json, README.md, server file',
      '• For React/Vue/etc include: package.json with correct dependencies',
      '',
      'Think like a senior engineer at a top-tier company. Quality over brevity.',
    ].join('\n');
  }

  /* ══════════════════════════════════════════════════════════
     EXTRACT PROJECT NAME from user input
     ══════════════════════════════════════════════════════════ */
  function extractProjectName(input) {
    var s = input.toLowerCase()
      .replace(/^(build|create|write|generate|make|code|develop|implement|give me|can you|please|could you)\s+(me\s+)?(a\s+|an\s+|the\s+)?/i, '')
      .replace(/\s+(app|application|website|site|project)\s*$/i, '')
      .trim()
      .replace(/[^a-z0-9 ]/gi, ' ')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 28);
    return s || 'project';
  }

  /* ══════════════════════════════════════════════════════════
     FILE PARSER
     Tries multiple strategies in order of specificity.
     Returns: [{ name, content, lang }]
     ══════════════════════════════════════════════════════════ */

  /* Language detection from extension */
  var EXT_LANG = {
    html: 'html', htm: 'html',
    css: 'css', scss: 'css', sass: 'css', less: 'css',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    json: 'json', jsonc: 'json',
    md: 'markdown', txt: 'plaintext',
    py: 'python',
    php: 'php',
    rb: 'ruby',
    java: 'java',
    go: 'go',
    rs: 'rust',
    sh: 'bash', bash: 'bash', zsh: 'bash',
    sql: 'sql',
    yaml: 'yaml', yml: 'yaml',
    xml: 'xml',
    svg: 'svg',
    vue: 'vue',
    graphql: 'graphql', gql: 'graphql',
    dockerfile: 'dockerfile',
    toml: 'toml',
    ini: 'ini', env: 'ini',
  };

  function extLang(filename) {
    var m = filename.toLowerCase().match(/\.([^.]+)$/);
    if (!m) {
      /* Special filenames */
      var bn = filename.toLowerCase();
      if (bn === 'dockerfile') return 'dockerfile';
      if (bn === 'makefile') return 'makefile';
      if (bn === '.env' || bn === '.gitignore') return 'ini';
      return 'plaintext';
    }
    return EXT_LANG[m[1]] || 'plaintext';
  }

  /* Strategy 1: Beast format ---FILE: xxx--- / ---END--- */
  function parseStrategyBeast(text) {
    var files = [];
    var re = /---FILE:\s*([^\n\r]+?)---[\r\n]+([\s\S]*?)---END---/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var name    = m[1].trim();
      var content = m[2].trimEnd();
      if (name && content) {
        files.push({ name: name, content: content, lang: extLang(name) });
      }
    }
    return files;
  }

  /* Strategy 2: Markdown fences with filename on preceding line or inside block */
  function parseStrategyMarkdown(text) {
    var files = [];
    /* Match ``` fences optionally preceded by a filename line */
    var re = /(?:^|\n)(?:(?:[*#_\-\s]*(?:file|filename|path)?[:\s]*)?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)[^\n]*\n)?```([a-z]*)\n([\s\S]*?)```/gi;
    var m;
    var seenNames = {};
    while ((m = re.exec(text)) !== null) {
      var nameFromPreceding = m[1] ? m[1].trim() : null;
      var lang    = m[2] ? m[2].toLowerCase().trim() : '';
      var content = m[3] ? m[3].trimEnd() : '';
      if (!content) continue;

      /* Try to find filename inside the block (first comment line) */
      var nameFromBlock = null;
      var firstLine = content.split('\n')[0];
      var commentMatch = firstLine.match(/^(?:\/\/|#|<!--|\/\*)\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/);
      if (commentMatch) nameFromBlock = commentMatch[1].trim();

      var name = nameFromBlock || nameFromPreceding || null;

      /* If no name found, infer from language */
      if (!name && lang) {
        var fallback = {
          html: 'index.html', css: 'style.css', javascript: 'script.js',
          js: 'script.js', typescript: 'index.ts', ts: 'index.ts',
          python: 'main.py', py: 'main.py', json: 'package.json',
          markdown: 'README.md', md: 'README.md',
          bash: 'script.sh', sh: 'script.sh',
          php: 'index.php', ruby: 'main.rb',
        };
        name = fallback[lang] || ('file.' + (lang || 'txt'));
      }
      if (!name) name = 'file' + (files.length + 1) + '.txt';

      /* Deduplicate names */
      if (seenNames[name]) {
        var base = name.replace(/(\.[^.]+)$/, ''), ext = name.match(/(\.[^.]+)$/)?.[1] || '';
        name = base + '-' + (seenNames[name]++) + ext;
      } else {
        seenNames[name] = 1;
      }

      files.push({ name: name, content: content, lang: lang || extLang(name) });
    }
    return files;
  }

  /* Strategy 3: Sections like "=== filename.ext ===" */
  function parseStrategyEquals(text) {
    var files = [];
    var re = /={3,}\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)\s*={3,}[\r\n]+([\s\S]*?)(?=={3,}|$)/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var name = m[1].trim(), content = m[2].trimEnd();
      if (name && content) files.push({ name: name, content: content, lang: extLang(name) });
    }
    return files;
  }

  /* Master parser — tries strategies in order */
  function parseFiles(responseText) {
    /* Strategy 1: Beast format */
    var files = parseStrategyBeast(responseText);
    if (files.length >= 1) return files;

    /* Strategy 2: Equals headers */
    files = parseStrategyEquals(responseText);
    if (files.length >= 1) return files;

    /* Strategy 3: Markdown fences */
    files = parseStrategyMarkdown(responseText);
    if (files.length >= 1) return files;

    return [];
  }

  /* Extract explanation block */
  function parseExplanation(responseText) {
    /* Beast format */
    var m = responseText.match(/---EXPLANATION---[\r\n]+([\s\S]*?)---END---/);
    if (m) return m[1].trim();
    /* Fallback: look for an explanation section heading */
    var m2 = responseText.match(/(?:##\s*(?:explanation|architecture|how to|project overview)[^\n]*\n)([\s\S]{50,})/i);
    if (m2) return m2[1].trim().slice(0, 2000);
    return null;
  }

  /* Strip file blocks from response to get a clean summary */
  function extractSummary(responseText) {
    return responseText
      .replace(/---FILE:\s*[^\n]+---[\s\S]*?---END---/g, '')
      .replace(/---EXPLANATION---[\s\S]*?---END---/g, '')
      .replace(/```[\s\S]*?```/g, '[code block]')
      .replace(/={3,}\s*[^\n]+\s*={3,}[\s\S]*?(?=={3,}|$)/g, '')
      .trim()
      .slice(0, 500);
  }

  /* ══════════════════════════════════════════════════════════
     PROJECT SESSION MEMORY
     Keeps up to 5 recent projects in memory for the session.
     ══════════════════════════════════════════════════════════ */
  var _projects = [];   /* [{ id, name, files, explanation, description, ts }] */
  var _currentId = null;

  function storeProject(name, files, explanation, description) {
    var id = 'proj-' + Date.now();
    var proj = { id: id, name: name, files: files, explanation: explanation || null, description: description || '', ts: Date.now() };
    _projects.unshift(proj);
    if (_projects.length > 5) _projects.pop();
    _currentId = id;
    return proj;
  }

  function getCurrentProject() {
    if (!_currentId) return _projects[0] || null;
    return _projects.find(function (p) { return p.id === _currentId; }) || _projects[0] || null;
  }

  function getProjects() { return _projects.slice(); }

  /* ══════════════════════════════════════════════════════════
     PROCESS RESPONSE — parse + store + render notification
     ══════════════════════════════════════════════════════════ */
  function processResponse(responseText, userInput) {
    var files       = parseFiles(responseText);
    var explanation = parseExplanation(responseText);
    var summary     = extractSummary(responseText);
    if (!files.length) return null;
    var name    = extractProjectName(userInput);
    var project = storeProject(name, files, explanation, summary);
    _showProjectNotification(project);
    return project;
  }

  /* ══════════════════════════════════════════════════════════
     PROJECT NOTIFICATION BAR
     ══════════════════════════════════════════════════════════ */
  function _showProjectNotification(project) {
    try {
      var bar   = document.getElementById('codeProjectBar');
      var label = document.getElementById('cpbName');
      var count = document.getElementById('cpbCount');
      if (!bar) return;
      if (label) label.textContent = project.name;
      if (count) count.textContent = project.files.length + ' file' + (project.files.length !== 1 ? 's' : '');
      bar.style.display = 'flex';

      /* Also show code chip */
      var chip = document.getElementById('codeChip');
      if (chip) chip.style.display = 'inline-flex';
    } catch (e) {}
  }

  function hideProjectNotification() {
    try {
      var bar = document.getElementById('codeProjectBar');
      if (bar) bar.style.display = 'none';
    } catch (e) {}
  }

  /* ══════════════════════════════════════════════════════════
     FILE EXPLORER MODAL
     ══════════════════════════════════════════════════════════ */
  var _viewingFile = 0;

  function openFileExplorer() {
    var project = getCurrentProject();
    if (!project) { return; }
    _renderExplorer(project);
    var bg = document.getElementById('feModalBg');
    if (bg) bg.classList.add('show');
    showFile(0);
  }

  function closeFileExplorer() {
    var bg = document.getElementById('feModalBg');
    if (bg) bg.classList.remove('show');
  }

  function _renderExplorer(project) {
    try {
      var nameEl = document.getElementById('feProjectName');
      if (nameEl) nameEl.textContent = '📁 ' + project.name;

      var tree  = document.getElementById('feTree');
      if (!tree) return;
      tree.innerHTML = '';

      project.files.forEach(function (file, idx) {
        var row = document.createElement('div');
        row.className = 'fe-file-row' + (idx === _viewingFile ? ' active' : '');
        row.dataset.idx = idx;

        var icon = _fileIcon(file.name);
        row.innerHTML =
          '<span class="fe-file-icon">' + icon + '</span>' +
          '<span class="fe-file-name">' + _escHtml(file.name) + '</span>' +
          '<button class="fe-dl-btn" data-idx="' + idx + '" title="Download ' + _escHtml(file.name) + '">↓</button>';

        row.addEventListener('click', function (e) {
          if (e.target.classList.contains('fe-dl-btn')) {
            downloadFile(file.name, file.content);
            return;
          }
          showFile(idx);
        });

        tree.appendChild(row);
      });

      /* Add explanation entry if present */
      if (project.explanation) {
        var sep = document.createElement('div');
        sep.className = 'fe-section-label';
        sep.textContent = '── EXPLANATION ──';
        tree.appendChild(sep);

        var expRow = document.createElement('div');
        expRow.className = 'fe-file-row';
        expRow.innerHTML = '<span class="fe-file-icon">📋</span><span class="fe-file-name">README (explanation)</span>';
        expRow.addEventListener('click', function () {
          showExplanation(project.explanation);
        });
        tree.appendChild(expRow);
      }
    } catch (e) {}
  }

  function showFile(idx) {
    var project = getCurrentProject();
    if (!project || !project.files[idx]) return;
    _viewingFile = idx;

    try {
      /* Highlight active row */
      document.querySelectorAll('.fe-file-row').forEach(function (r) {
        r.classList.toggle('active', +r.dataset.idx === idx);
      });

      var file   = project.files[idx];
      var header = document.getElementById('fePreviewHeader');
      var code   = document.getElementById('feCode');
      if (header) header.textContent = file.name;
      if (code) {
        code.textContent = file.content;
        code.className = 'fe-code language-' + file.lang;
      }

      /* Scroll preview to top */
      var wrap = document.getElementById('feCodeWrap');
      if (wrap) wrap.scrollTop = 0;
    } catch (e) {}
  }

  function showExplanation(text) {
    try {
      var header = document.getElementById('fePreviewHeader');
      var code   = document.getElementById('feCode');
      if (header) header.textContent = 'Project Explanation';
      if (code) { code.textContent = text; code.className = 'fe-code'; }
    } catch (e) {}
  }

  /* ── File icon by extension ── */
  function _fileIcon(name) {
    var ext = (name.match(/\.([^.]+)$/) || ['', ''])[1].toLowerCase();
    var icons = {
      html: '🌐', htm: '🌐',
      css: '🎨', scss: '🎨', sass: '🎨', less: '🎨',
      js: '⚡', mjs: '⚡', jsx: '⚡', cjs: '⚡',
      ts: '🔷', tsx: '🔷',
      json: '📦', jsonc: '📦',
      md: '📝', txt: '📝', readme: '📝',
      py: '🐍',
      rb: '💎',
      php: '🐘',
      sql: '🗄️',
      sh: '🔧', bash: '🔧',
      svg: '🖼️', png: '🖼️', jpg: '🖼️',
      yaml: '⚙️', yml: '⚙️',
      env: '🔑', gitignore: '👁️',
      vue: '💚', dockerfile: '🐋',
    };
    return icons[ext] || '📄';
  }

  function _escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  /* ══════════════════════════════════════════════════════════
     DOWNLOADS
     ══════════════════════════════════════════════════════════ */

  /* Detect MIME type */
  var MIME = {
    html: 'text/html', htm: 'text/html',
    css: 'text/css',
    js: 'text/javascript', mjs: 'text/javascript', jsx: 'text/javascript',
    ts: 'text/typescript', tsx: 'text/typescript',
    json: 'application/json',
    md: 'text/markdown',
    txt: 'text/plain',
    py: 'text/x-python',
    svg: 'image/svg+xml',
    xml: 'application/xml',
    yaml: 'text/yaml', yml: 'text/yaml',
    sh: 'text/x-shellscript', bash: 'text/x-shellscript',
    php: 'text/x-php',
    rb: 'text/x-ruby',
    sql: 'text/x-sql',
    vue: 'text/x-vue',
  };

  function _mime(filename) {
    var ext = (filename.match(/\.([^.]+)$/) || ['', 'txt'])[1].toLowerCase();
    return MIME[ext] || 'text/plain';
  }

  function downloadFile(filename, content) {
    try {
      var blob = new Blob([content], { type: _mime(filename) + ';charset=utf-8' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    } catch (e) {
      console.warn('[CGM] downloadFile error:', e);
    }
  }

  /* ZIP download — requires JSZip on the page */
  function downloadZip(project) {
    if (!project) project = getCurrentProject();
    if (!project || !project.files.length) { console.warn('[CGM] No project to zip'); return; }

    if (typeof JSZip === 'undefined') {
      alert('JSZip library not loaded. Please refresh and try again.');
      return;
    }

    try {
      var zip = new JSZip();
      project.files.forEach(function (file) {
        zip.file(file.name, file.content);
      });
      if (project.explanation) {
        zip.file('EXPLANATION.md', project.explanation);
      }

      zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a   = document.createElement('a');
          a.href = url; a.download = project.name + '.zip';
          document.body.appendChild(a); a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
          console.log('[CGM] ZIP downloaded:', project.name + '.zip', project.files.length, 'files');
        })
        .catch(function (e) { console.warn('[CGM] ZIP error:', e); });
    } catch (e) {
      console.warn('[CGM] ZIP generation error:', e);
    }
  }

  /* ── Public API ──────────────────────────────────────────── */
  return {
    isCodeRequest:      isCodeRequest,
    buildCodeSystemPrompt: buildCodeSystemPrompt,
    processResponse:    processResponse,
    parseFiles:         parseFiles,
    getCurrentProject:  getCurrentProject,
    getProjects:        getProjects,
    openFileExplorer:   openFileExplorer,
    closeFileExplorer:  closeFileExplorer,
    showFile:           showFile,
    downloadFile:       downloadFile,
    downloadZip:        downloadZip,
    hideProjectNotification: hideProjectNotification,
  };
})();
