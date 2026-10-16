// UserPromptSubmit and PostToolUse hook: tells the agent once when context use first crosses 70, 85 and 95 percent.
// It only adds context for the model; it never blocks, compacts or stops anything.
import fs from 'node:fs';
import { LEVELS, readStdin, lastContext, windowTokens, stateFile } from './lib.mjs';

const input = readStdin();
const ctx = input.transcript_path ? lastContext(input.transcript_path) : null;
if (ctx == null) process.exit(0);
const pct = Math.round((100 * ctx) / windowTokens());
const file = stateFile(input.session_id);
let warned = 0;
try {
  warned = JSON.parse(fs.readFileSync(file, 'utf8')).warned ?? 0;
} catch {
  /* first call */
}
if (pct < 60) {
  // compaction or /clear happened: re-arm the warnings
  if (warned) fs.writeFileSync(file, JSON.stringify({ warned: 0 }));
  process.exit(0);
}
const level = LEVELS.find((l) => pct >= l);
if (!level || level <= warned) process.exit(0);
fs.writeFileSync(file, JSON.stringify({ warned: level }));
const action = {
  70: 'Finish the current step, then plan to hand off: update your progress file or docs/status record with decisions, state and next actions.',
  85: 'Stop starting new work. Persist decisions, state and next actions now (docs/agents/handoff-template.md), commit, then tell the coordinator or owner that a fresh session or /compact is advisable.',
  95: 'Context is nearly full and automatic compaction may run at any time. Persist the handoff and commit immediately; do not start any new task.'
}[level];
const event = input.hook_event_name === 'PostToolUse' ? 'PostToolUse' : 'UserPromptSubmit';
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: `[context monitor] Context is about ${pct}% of the ${(windowTokens() / 1e6).toFixed(1)}M window (${Math.round(ctx / 1000)}k tokens), crossing ${level}%. ${action}`
    }
  })
);
