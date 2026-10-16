// Status line: model, context use with 70/85/95 warnings, branch. Reads the status JSON on stdin.
import { readStdin, git } from './hooks/lib.mjs';

const s = readStdin();
const pct = Math.round(s.context_window?.used_percentage ?? 0);
const size = s.context_window?.context_window_size ?? 0;
const color = pct >= 95 ? 31 : pct >= 85 ? 91 : pct >= 70 ? 33 : 32;
const label = pct >= 95 ? ' HANDOFF NOW' : pct >= 85 ? ' PERSIST STATE' : pct >= 70 ? ' plan handoff' : '';
const bar = '#'.repeat(Math.min(10, Math.round(pct / 10))).padEnd(10, '-');
const used = Math.round(((pct / 100) * size) / 1000);
const esc = String.fromCharCode(27);
console.log(`[${s.model?.display_name ?? 'model'}] ${esc}[${color}m${bar} ${pct}% ${used}k/${Math.round(size / 1000)}k${label}${esc}[0m | ${git('rev-parse', '--abbrev-ref', 'HEAD') || '-'}`);
