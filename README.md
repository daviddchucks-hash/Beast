# Drexora AI — Production-ready upgrade

This workspace upgrades Drexora AI into a production-ready assistant using:

- Frontend: existing UI (HTML/CSS/JS)
- Backend: Node.js + Express (this repo)
- AI Provider: OpenRouter (server-side only)
- Authentication: Firebase Authentication (Email/password)
- Database: Firebase Realtime Database
- Hosting: Render (backend + static frontend)

Highlights:
- Users must sign in / register to use AI features.
- Frontend sends Firebase ID token to backend in `Authorization: Bearer <ID_TOKEN>`; the backend verifies it with Firebase Admin.
- OpenRouter API key is only used on the Render backend (never exposed to clients).
- Conversations, memories, and usage are persisted in Firebase Realtime Database under `users/{uid}`.

Files changed/added (summary)
- Modified: `package.json`, `server.js`, `index.html`, `script.js`, `render.yaml`
- Added: `.env.example`, `.gitignore`, `firebase.rules.json`

Dependencies added (server)
- `express`, `cors`, `helmet`, `firebase-admin`, `express-rate-limit`

Required Render environment variables
- `OPENROUTER_API_KEY` (secret)
- `OPENROUTER_API_URL` (optional; default `https://api.openrouter.ai/v1`)
- `FIREBASE_PROJECT_ID` (e.g. `beastai-f0702`)
- `FIREBASE_CLIENT_EMAIL` (service account client email)
- `FIREBASE_PRIVATE_KEY` (service account private key; keep secret)
- `FRONTEND_URL` (your deployed frontend origin)
- `DEFAULT_AI_MODEL` (e.g. `gpt-4o-mini`)
- `AI_RATE_LIMIT_PER_MINUTE` (e.g. `60`)
- `NODE_ENV` (e.g. `production`)

Firebase setup required
1. Open your Firebase project `beastai-f0702`.
2. Enable **Authentication** (Email/Password provider or others you prefer).
3. Create a **Service Account** and download the JSON. From it, copy:
	 - `project_id` → `FIREBASE_PROJECT_ID`
	 - `client_email` → `FIREBASE_CLIENT_EMAIL`
	 - `private_key` → `FIREBASE_PRIVATE_KEY` (in Render store the value with literal newlines or escape them as `\n`; the server replaces `\\n` with `\n` when initializing)
4. Enable **Realtime Database** and set its location.
5. Add the Realtime Database rules found in `firebase.rules.json` (example below).

Suggested Firebase Realtime Database rules (in `firebase.rules.json`)
```
{
	"rules": {
		"users": {
			"$uid": {
				".read": "auth != null && auth.uid === $uid",
				".write": "auth != null && auth.uid === $uid"
			}
		}
	}
}
```

Local run commands
```
cp .env.example .env
# populate .env with your secrets (for local testing only)
npm install
npm start
```

Open `http://localhost:3000` in your browser. The UI includes a Sign in button (top-right) which opens a simple auth modal.

Frontend Firebase configuration
- The Beast Firebase web config is already set in `index.html`. Firebase web configuration values are public client-side settings, not server credentials.
- If you use a different Firebase project, replace `window.__FIREBASE_CONFIG` and update `FIREBASE_DATABASE_URL` in the backend environment.
- The frontend uses the same origin for API calls by default. Set `window.__BACKEND_URL` before `script.js` only when the frontend and backend are hosted separately.

API endpoints (implemented)
- `GET /api/health` — returns { status: 'ok' }
- `GET /api/ai/models` — returns available models and default
- `POST /api/ai/chat` — main chat endpoint; requires `Authorization: Bearer <ID_TOKEN>` when using accounts
- `POST /api/chat` — backward-compatible alias
- `GET /api/auth/me` — returns current user info
- Conversations: `GET /api/conversations`, `POST /api/conversations`, `GET /api/conversations/:id`, `PATCH /api/conversations/:id`, `DELETE /api/conversations/:id`
- Memories: `GET /api/memory`, `DELETE /api/memory/:id`, `DELETE /api/memory`
- Settings: `GET /api/settings`, `PATCH /api/settings`
- Usage: `GET /api/usage`

Security notes
- OpenRouter and Firebase Admin credentials must only be stored as Render environment variables — never commit them.
- The backend validates Firebase ID tokens and uses them to scope DB operations to the authenticated user.
- Rate limiting is applied per minute and keyed by UID when available.
- Helmet is used to add secure headers; CORS is restricted to `FRONTEND_URL`.

Render deployment steps
1. Push this repository to GitHub.
2. Create a new **Web Service** on Render.
	 - Build command: `npm install`
	 - Start command: `npm start`
3. Add the environment variables listed above in Render's dashboard (do not paste service account secrets in code).
4. Deploy.

Exact Render service settings (example `render.yaml` updated)
- `buildCommand`: `npm install`
- `startCommand`: `npm start`
- `runtime`: `node`

What's left / Next steps I can implement
- Streaming AI responses (server + incremental client rendering)
- Memory extraction pipeline and relevance search
- Token-level usage counting using OpenRouter response metadata (if available)
- Improved UI polish (chat list, model selector, usage page)
- Automated tests

If you'd like, I'll continue and implement streaming responses, regenerate/retry, memory extraction, and polish the frontend UI (chat sidebar, model selector, usage page). Reply with "Proceed" and I'll continue implementing the remaining features now.