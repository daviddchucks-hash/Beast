# Drexora AI

Drexora AI is a lightweight chat workspace with a static browser interface and a small Node.js server. The server keeps the provider key private, calls an OpenAI-compatible chat endpoint, and falls back to local responses if no key is configured or the provider is unavailable.

## Run locally

```bash
cp .env.example .env
# Add your key to .env if you want provider-backed answers.
npm start
```

Open `http://localhost:3000`.

## Deploy on Render

Create a **Web Service** from this repository:

- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `OPENAI_API_KEY` — add this in Render's Environment settings, not in the repository
- Optional: `OPENAI_MODEL` (defaults to `gpt-4o-mini`)
- Optional: `OPENAI_BASE_URL` for another OpenAI-compatible provider

Render provides `PORT` automatically. The app listens on it and serves both the chat UI and `/api/chat`.

Never commit `.env` or paste an API key into browser JavaScript, HTML, GitHub, or chat.