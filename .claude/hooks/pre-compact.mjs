// PreCompact hook: writes a mechanical snapshot before compaction so the state survives it. Never blocks compaction.
// The snapshot is local (.claude/handoffs/, gitignored). Durable decisions belong in the progress/status files (see docs/agents/).
import fs from 'node:fs';
import path from 'node:path';
import { readStdin, git, lastContext, windowTokens, projectDir } from './lib.mjs';

const input = readStdin();
const dir = path.join(projectDir(), '.claude', 'handoffs');
fs.mkdirSync(dir, { recursive: true });
const ctx = input.transcript_path ? lastContext(input.transcript_path) : null;
const stamp = new Date().toISOString();
const ctxText = ctx == null ? 'unknown' : `${Math.round(ctx / 1000)}k tokens (${Math.round((100 * ctx) / windowTokens())}% of ${windowTokens() / 1e6}M)`;
const text = [
  `# Pre-compaction snapshot ${stamp}`,
  '',
  `- trigger: ${input.trigger ?? input.matcher ?? 'unknown'} | session: ${input.session_id ?? '?'}`,
  `- context at compaction: ${ctxText}`,
  `- transcript: ${input.transcript_path ?? '?'}`,
  `- branch: ${git('rev-parse', '--abbrev-ref', 'HEAD')} @ ${git('rev-parse', '--short', 'HEAD')}`,
  '',
  '## Uncommitted changes (first 40)',
  '```',
  git('status', '--short').split('\n').slice(0, 40).join('\n'),
  '```',
  '',
  '## Recent commits',
  '```',
  git('log', '--oneline', '-8'),
  '```',
  '',
  'Decisions, open items and next actions are not captured here: they live in the module progress file or docs/status/. After compaction re-read those, not this snapshot.',
  ''
].join('\n');
fs.writeFileSync(path.join(dir, `${stamp.replace(/[:.]/g, '-')}.md`), text);
fs.writeFileSync(path.join(dir, 'latest.md'), text);
