---
help_id: ai.tutorial.drill-bit-holder
title: "Tutorial: drill bit holder concept"
kind: tutorial
summary: Develop a conceptual design of a bit holder for a Milwaukee-compatible cordless drill with the assistant and Conceptualize, with your own AI account or as a labelled demo.
keywords: [tutorial, example, drill, bit holder, milwaukee, m12, m18, conceptual design, trade study, requirements]
related: [ai.connect, ai.policy, ai.preview]
---

A worked example: an accessory that holds 1/4 in hex-shank driver bits on or with a cordless
drill/driver of the Milwaukee M12 or M18 range. "Milwaukee" only describes compatibility; this example is
not affiliated with or endorsed by Milwaukee Tool. **Drill dimensions are assumptions** until you measure
your drill; nothing here claims fit.

You need the backend running in API mode (`npm run dev`; Settings → Platform → Service mode: API) and the
Conceptualize and Requirements tools in your subscription (development user **eli** or **ada**).

### With your own AI account

1. Connect your account ([how](help:ai.connect)). Keep the default access (read and propose).
2. In the **ChatGPT** panel, send: *"Create a Concept for this need, keeping my words: a drill bit holder
   for a Milwaukee-compatible cordless drill/driver (M12 or M18) that holds six hex-shank bits with a
   1/4 in (6.35 mm) hex shank, keeps every bit retained after a 1 m drop and lets me take a bit out with
   one hand within 3 s. Assume it attaches at the belt-clip mount; the drill dimensions are not
   measured."* The model should call **Prepare a new Concept**. Check the basis of each statement in the
   preview (stated, AI hypothesis, assumption) and choose **Apply**.
3. *"Decompose it into retention, attachment to the drill, capacity and organisation, and access."*
   Apply the decomposition.
4. *"Propose three alternatives as Concepts under it (a magnetic clip-on holder at the belt-clip mount, a
   sleeve on the battery foot, a separate belt holster), then give a small trade study with criteria and
   weights and a proposed decision."* Today the model can record the alternatives as Concepts; the trade
   study and the proposed decision appear in its answer. Avoid *Prepare alternative concepts* for this
   request: that operation's scripted principle library treats "belt" as a belt drive (known limitation).
5. *"Draft requirements from its quantified constraints."* This prepares **draft** requirements in
   Requirements, linked to the Concept; approval stays in Requirements.
6. Optional: ask for a simple holder block in CAD. The model uses the CAD commands and you
   review the preview; the geometry is a concept, not a verified fit.

Real models vary: if the model skips a step or asks a question, answer it. Nothing changes until you
choose Apply.

### Without an account (scripted demo)

With the demo assistant (no account connected) send these, applying each preview before the next:

1. *Start the drill bit holder example*
2. *Decompose the drill bit holder*
3. *Propose alternatives for the drill bit holder*
4. *Draft requirements for the drill bit holder*

The replies are labelled as a scripted demo plan; the interpretation is deterministic and marked as AI
hypotheses. The trade study (weights: retention 3, one-handed access 2, fit without measured dimensions 2,
added mass 1) is shown in the reply.
