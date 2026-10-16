// Compact status digest of the module progress files, so the coordinator need not load them whole.
// Usage: node scripts/status-digest.mjs [docs/specifications] [--max 14]
// Prints per file: title, branch/worktree lines, checklist items and status-table rows (truncated), and the file size.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const mi = args.indexOf('--max');
const max = mi >= 0 ? Number(args.splice(mi, 2)[1]) : 14;
const dir = args[0] ?? 'docs/specifications';
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('-progress.md')).sort()) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
  const keep = [];
  for (const l of lines) {
    const t = l.trim();
    if (/^# /.test(t) || /^(Branch|Status|Worktree)\b/i.test(t) || /^- \[[ x]\]/.test(t) || /^\|\s*(\d+|Phase|Stage|[A-Z]\d?)\b.*\|.*(Done|Open|Planned|ready|Blocked|In progress|Implemented|Partial)/i.test(t)) keep.push(t.length > 170 ? t.slice(0, 167) + '...' : t);
    if (keep.length >= max) break;
  }
  console.log(`## ${f} (${Math.round(fs.statSync(path.join(dir, f)).size / 1024)} KB)`);
  console.log(keep.join('\n') + '\n');
}
