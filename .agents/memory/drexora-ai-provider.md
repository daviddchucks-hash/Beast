---
name: Drexora AI provider boundary
description: The security and fallback boundary for Drexora AI's real provider connection.
---

Drexora AI must never place an AI provider credential in browser code, committed files, or chat. The browser sends conversation messages to the server chat endpoint; the server owns provider access and returns a local response when the provider is missing or unavailable.

**Why:** The app is intended for a public Render deployment, where a client-side key would be immediately exposed and abused. A local fallback also keeps the interface usable during development and provider outages.

**How to apply:** Add future provider integrations behind the server endpoint, keep keys in Render/Replit protected environment storage, and preserve the no-key fallback path.