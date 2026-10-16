// SessionStart hook: a small orientation (stdout is added to the session context). Keep it short: it is paid on every start.
import fs from 'node:fs';
import path from 'node:path';
import { readStdin, git, projectDir } from './lib.mjs';

const input = readStdin();
const dirty = git('status', '--short').split('\n').filter(Boolean).length;
const out = [`[session start: ${input.source ?? 'startup'}] Branch ${git('rev-parse', '--abbrev-ref', 'HEAD')} @ ${git('rev-parse', '--short', 'HEAD')}, ${dirty} uncommitted file(s).`];
out.push('Context rules: docs/agents/README.md. Resume points: your module progress file, docs/status/ (coordinator.md for the coordinator). Handoff format: docs/agents/handoff-template.md.');
try {
  const latest = path.join(projectDir(), '.claude', 'handoffs', 'latest.md');
  const age = (Date.now() - fs.statSync(latest).mtimeMs) / 3_600_000;
  if (age < 24 && ['compact', 'resume'].includes(input.source)) {
    out.push(`A pre-compaction snapshot exists (${age.toFixed(1)} h old): .claude/handoffs/latest.md (git state only; decisions are in the progress/status files).`);
  }
} catch {
  /* none */
}
process.stdout.write(out.join('\n') + '\n');
