---
help_id: sysml-modeler.history
title: History, versions and undo
kind: guide
summary: Every change is an immutable commit with author, source and reason. Undo creates a compensating commit. Concurrent changes to different elements apply automatically; overlapping ones are refused.
keywords: [history, commit, version, undo, revert, branch, tag, baseline, concurrency, provenance]
related: [sysml-modeler.ai, sysml-modeler.api]
---

The repository follows the resource model of the OMG Systems Modeling API: a **project** has
**commits** (immutable sets of element versions), **branches** (moving heads) and **tags**
(baselines).

- **History** lists the commits of the branch with their number, summary or reason, author, source
  (person, AI assistant, API, undo or seed), time and size. Assistant commits name their proposal.
- **Undo** (the toolbar undoes the latest change; History can undo any commit) writes a new commit
  that restores the versions from before that commit. It is refused when later commits changed the
  same elements: undo those first, or edit by hand.
- **Working at the same time.** Each change records the commit it was based on. If others committed
  in between and touched *different* elements, your change is applied on top ("Applied on the
  latest version"). If they changed the *same* elements, your change is refused and the view
  reloads; your input is kept so that you can apply it again.
- **Branches** are listed in the status bar. In this version, branches and tags are created through
  the API; merging is planned.
