---
help_id: ai.connect
title: Connect your AI account
kind: guide
summary: Connect your own OpenAI account in Settings → AI and reasoning, with Sign in with ChatGPT (local installations) or an OpenAI API key.
keywords: [connect, account, sign in, chatgpt, openai, api key, disconnect, billing, credential]
related: [ai.models, ai.policy, ai.privacy, ai.troubleshooting, ai.tutorial.drill-bit-holder]
---

The assistant answers with a real model only after **you** connect your own account. Until then the panel
uses the labelled **demo assistant** (scripted responses).

Open **Settings** (gear icon beside Help) → **AI and reasoning** → **Connection**. Two ways to connect
OpenAI are offered.

### Sign in with ChatGPT (use your ChatGPT plan)

1. Choose **Continue with ChatGPT**. A new tab opens at OpenAI (auth.openai.com).
2. Sign in with your ChatGPT account and review the requested permissions. The first time, OpenAI asks
   you to name and authorise this app ("Engineering Workspace").
3. OpenAI returns to this application's server at `http://127.0.0.1:<port>/auth/callback`; that tab says
   *Account connected* and the settings page updates by itself.

Eligible usage then uses your ChatGPT plan (Plus or Pro); the panel shows **Using ChatGPT plan** with a
**Manage usage** link (chatgpt.com/settings/usage). The app gets no access to your ChatGPT conversations.

This option appears only when the application runs **locally** on your computer: OpenAI offers ChatGPT
plan usage to open-source projects and personal projects that run locally. A hosted or paid deployment
needs OpenAI's approval first (their interest form); use an API key there.

### OpenAI API key

1. Create a project key at platform.openai.com → API keys.
2. Paste it into **OpenAI API key** and choose **Connect**. The server checks it with a cheap call to
   OpenAI (listing models) before storing anything; an invalid key is refused and nothing is stored.

API usage is billed to that OpenAI **API** account. It is separate from a ChatGPT Plus or Pro subscription.

### What is stored, and disconnecting

- The key or sign-in tokens go only to this application's server, which stores them **encrypted** and
  never sends them back to the browser or writes them to a log. The page shows only "key ending …" or the
  account e-mail.
- **Disconnect** deletes the stored credential. For Sign in with ChatGPT the server also ends the sign-in
  session at OpenAI; if that cannot be confirmed you are told, and you can remove the app in your ChatGPT
  settings.
- **Test connection** checks that the provider still accepts the connection.

Each development user (ada, rui, eli, rho, nia) has their own connection.
