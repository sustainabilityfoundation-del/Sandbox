// Compact verification summary: runs steps one after another and prints a table plus the first failing lines.
// Usage: node scripts/verify.mjs [typecheck] [test] [build] [e2e] [--cmd "name=command" ...] [--tail 15]
// Default steps: typecheck test. Exit code is 1 when any step fails. Output of passing steps is discarded.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const steps = [];
const custom = [];
let tail = 15;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cmd') custom.push(args[++i]);
  else if (args[i] === '--tail') tail = Number(args[++i]);
  else steps.push(args[i]);
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const known = { typecheck: [npm, 'run', 'typecheck'], test: [npm, 'test'], build: [npm, 'run', 'build'], e2e: [npm, 'run', 'e2e'] };
const plan = [];
for (const s of steps.length || custom.length ? steps : ['typecheck', 'test']) {
  if (!known[s]) {
    console.error(`unknown step ${s}`);
    process.exit(2);
  }
  plan.push([s, known[s]]);
}
for (const c of custom) {
  const [name, ...rest] = c.split('=');
  plan.push([name, ['__shell__', rest.join('=')]]);
}
const rows = [];
let failed = false;
for (const [name, cmd] of plan) {
  const t0 = Date.now();
  const r = cmd[0] === '__shell__' ? spawnSync(cmd[1], { shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }) : spawnSync(cmd[0], cmd.slice(1), { shell: process.platform === 'win32', encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const ok = r.status === 0;
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.split('\n');
  const hits = out.filter((l) => /(FAIL|✗|×|error TS|AssertionError|Error:|not ok)/.test(l)).slice(0, tail);
  const summary = out.filter((l) => /(Tests\s+\d+|Test Files|passed|failed)/i.test(l)).slice(-2).map((l) => l.trim()).join(' | ');
  rows.push({ name, ok, secs: ((Date.now() - t0) / 1000).toFixed(0), summary, hits });
  failed ||= !ok;
}
console.log(`commit ${spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim()}`);
console.log('step|result|seconds|summary');
for (const r of rows) console.log(`${r.name}|${r.ok ? 'PASS' : 'FAIL'}|${r.secs}|${r.summary}`);
for (const r of rows.filter((x) => !x.ok)) console.log(`\n${r.name}: first failing lines\n${r.hits.join('\n') || '(no recognised failure lines; run the step directly)'}`);
process.exit(failed ? 1 : 0);
