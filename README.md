# Beast AI v2.0

A ChatGPT-like AI assistant that runs entirely in the browser.

## Features
- 🤖 Multi-provider AI: OpenRouter → HuggingFace → Groq → Local fallback
- 🎤 Voice input + voice output (Web Speech API)
- 💬 Chat memory during session
- ⚡ Commands: open YouTube, Google, time, date, search, and more
- 📱 Optimized for Android mobile Chrome
- 🛠️ Single self-contained `index.html` file — zero build needed

## Live App
Visit: https://daviddchucks-hash.github.io/Beast/

## How to add AI
1. Open the app → tap **[API]** button
2. Add your key from any of:
   - **OpenRouter** (primary): openrouter.ai/settings/keys — 200+ models, production-ready
   - **HuggingFace** (secondary): huggingface.co/settings/tokens — free forever
   - **Groq** (backup): console.groq.com — fastest inference
3. Tap Save — works instantly, no reload needed

## AI Provider
Primary AI is powered by [OpenRouter](https://openrouter.ai/) using `meta-llama/llama-3.1-8b-instruct:free`.
Falls back to HuggingFace, then Groq, then local mode if no keys are configured.

## Deployment
This repository is deployed to GitHub Pages via a simple root folder deployment:
- **Source:** Deploy from branch `main`
- **Branch:** `main`
- **Folder:** `/ (root)`

All changes to `index.html`, `script.js`, `style.css`, and files in the `public/` folder are immediately reflected when pushed to GitHub.

## Local Development
No build step is needed. Simply open `index.html` directly in any browser, or use a local server:

```bash
python -m http.server 8000
# Then visit http://localhost:8000
```

## File Structure
```
Beast/
├── index.html          # Main application (single file, no build needed)
├── script.js           # Core Beast AI logic, voice control, API handling
├── style.css           # UI styling (cyberpunk theme)
├── manifest.json       # PWA manifest for mobile installation
├── sw.js               # Service Worker for offline support & caching
├── public/             # Static assets (icons, images)
│   ├── favicon.svg
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── robots.txt
│   └── opengraph.jpg
├── src/                # Legacy React/TypeScript code (not deployed)
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   └── pages/
└── .nojekyll           # Tells GitHub Pages to serve files as-is (no Jekyll processing)
```

## Important Notes
- **GitHub Pages serves from the repository root** (`index.html` at `/`)
- The `src/` directory contains legacy React code and is **not deployed** to the live site
- All user changes (API keys, preferences) are stored in browser localStorage
- The Service Worker (`sw.js`) caches assets for offline use
- PWA installable on Android and iOS via browser prompt or Share menu

## Troubleshooting
- **Changes not showing?** Make sure you pushed to `main` branch, then wait ~30 seconds for GitHub Pages to rebuild
- **Mic not working?** Use Chrome/Edge browser and grant microphone permission
- **Wake word not detecting?** Ensure mic permission is enabled and browser is in focus
