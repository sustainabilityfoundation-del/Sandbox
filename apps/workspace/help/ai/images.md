---
help_id: ai.images
title: Image generation for concept illustrations
kind: reference
summary: Concept illustrations are generated with your own OpenAI API key, only after you turn Image generation on; without it you get a clear explanation and structured layouts keep working.
keywords: [image generation, illustration, concept sketch, visual, OpenAI, API key, cost, gpt-image, quality, daily limit]
related: [ai.connect, ai.privacy, ai.policy]
---

Conceptualize can show a concept as a generated **illustration**: an exploratory sketch of what an option could
look like. Illustrations explain an idea. They are not drawings, not geometry and not evidence: proportions are
not reliable, and an image never shows that a requirement is met or that a mechanism works. Exact dimensions,
interfaces and relationships come from the concept's **structured layout**, which needs no provider and always works.

## What you need

1. **An OpenAI API key** connected in **Settings → AI and reasoning → Connection**. The usage is billed to that API
   account, separately from a ChatGPT Plus or Pro plan.
2. **Settings → AI and reasoning → Image generation** turned **on**. It is off by default, so nothing is generated or
   charged until you choose to.

With **Sign in with ChatGPT**, illustrations are not available: OpenAI does not offer image generation on ChatGPT
plan usage. The platform says so when you ask for an illustration and nothing is charged. To use illustrations,
connect an OpenAI API key instead.

## Settings

| Setting | Meaning | Default |
| --- | --- | --- |
| Image generation | Allows illustrations to use your provider account | Off |
| Image quality | Low, medium or high. Higher quality costs more | Medium |
| Images per day | Most paid illustrations you can request in 24 hours. A retry of the same request does not count again | 20 |

Project administrators can set lower project limits for both.

## Cost

OpenAI charges by tokens: image output $30, image input $8 and text input $5 per million tokens (OpenAI standard
prices, October 2026). The cost of one image depends on the model, the size and the quality. OpenAI does not publish
a fixed price per image, so each illustration job records the tokens it used and an **estimated** cost. Your OpenAI
invoice is the authoritative figure. Repeating an identical request returns the existing illustration and is not
charged again.

## How generation behaves

- Illustrations are generated in the background, and you can keep working meanwhile. Each one shows a state:
  *pending*, *running*, *succeeded*, *failed* or *cancelled*.
- **Cancel** stops an illustration that is pending or running. A result that arrives after you cancel is discarded.
- **Retry** runs a failed or cancelled illustration again.
- When you request several illustrations at once, each one succeeds or fails on its own. A failure never removes the
  illustrations that succeeded.
- If the server stops while an illustration is running, the job is marked *interrupted*. It is never repeated
  automatically, because the provider may already have charged for it; choose Retry to generate it again.

## What is sent to OpenAI

Only the illustration instruction composed from the concept, any reference images you chose, and the size and
quality. A fixed preface asks for an illustrative sketch with no text, labels or dimension lines. Project names,
requirement text and other project data are not sent. Your API key stays encrypted on the server and never reaches
the browser.

## Troubleshooting

| Message | What to do |
| --- | --- |
| No AI account is connected | Connect an OpenAI API key in Settings → AI and reasoning |
| You are connected with Sign in with ChatGPT … | Connect an OpenAI API key; plan usage has no image generation |
| Image generation is off in your AI settings | Turn on Settings → AI and reasoning → Image generation |
| You reached your limit of … image generation(s) in 24 hours | Wait, or raise Images per day (within the project limit) |
| OpenAI may require API Organization Verification | Complete the verification in the OpenAI developer console |
| OpenAI blocked the request under its usage policies | Change the instruction or the reference images |
