// Usage audit of Claude Code session transcripts (streams line by line; never loads a file whole).
// Usage: node scripts/session-usage.mjs <session.jsonl> [subagents-dir] [--json out.json]
import fs from 'node:fs'; import readline from 'node:readline'; import path from 'node:path';
const args = process.argv.slice(2); const jIdx = args.indexOf('--json');
const jsonOut = jIdx >= 0 ? args.splice(jIdx, 2)[1] : null;
const [main, subDir] = args;
// Agents work in separate worktrees, so reads are compared by repository-relative path.
const rel = (p) => { const m = p.match(/(?:^|\/)((?:docs|packages|apps|services|tests|scripts)\/.*|agents\.md|claude\.md|package\.json)$/); return m ? m[1] : p; };
async function analyse(file) {
  const msgs = new Map(); const toolName = new Map(); const reads = new Map();
  const resultBytes = {}; const agentBriefs = []; let compactions = 0; let lines = 0; let first, last;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    lines++; let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.timestamp) { first ??= o.timestamp; last = o.timestamp; }
    if (o.type === 'system' && /compact/.test(o.subtype ?? '')) compactions++;
    if (o.isCompactSummary) compactions++;
    const m = o.message; if (!m) continue;
    if (o.type === 'assistant' && m.usage) {
      const u = m.usage; const key = m.id ?? o.uuid;
      const rec = { model: m.model, in: u.input_tokens ?? 0, cc: u.cache_creation_input_tokens ?? 0, cr: u.cache_read_input_tokens ?? 0, out: u.output_tokens ?? 0 };
      const prev = msgs.get(key); if (!prev || rec.out >= prev.out) msgs.set(key, rec);
    }
    if (Array.isArray(m.content)) for (const c of m.content) {
      if (c.type === 'tool_use') {
        toolName.set(c.id, c.name);
        if (c.name === 'Read' && c.input?.file_path) { const k = c.input.file_path.split(String.fromCharCode(92)).join('/').toLowerCase(); reads.set(rel(k), (reads.get(rel(k)) ?? 0) + 1); }
        if (c.name === 'Agent' || c.name === 'Task') agentBriefs.push({ d: c.input?.description, chars: JSON.stringify(c.input?.prompt ?? '').length });
      } else if (c.type === 'tool_result') {
        const n = toolName.get(c.tool_use_id) ?? '?'; let s = 0, im = 0;
        if (typeof c.content === 'string') s = c.content.length; else for (const p of c.content ?? []) { if (p.type === 'image') im += (p.source?.data?.length ?? 0); else s += JSON.stringify(p).length; }
        resultBytes[n] = (resultBytes[n] ?? 0) + s; if (im) resultBytes[n + '(image base64)'] = (resultBytes[n + '(image base64)'] ?? 0) + im;
      }
    }
  }
  const arr = [...msgs.values()]; const sum = (f) => arr.reduce((a, r) => a + f(r), 0);
  const ctx = arr.map((r) => r.in + r.cc + r.cr);
  const models = {}; for (const r of arr) models[r.model] = (models[r.model] ?? 0) + 1;
  return { file: path.basename(file), lines, first, last, messages: arr.length, models, input: sum((r) => r.in), cacheWrite: sum((r) => r.cc), cacheRead: sum((r) => r.cr), output: sum((r) => r.out),
    ctx, maxCtx: Math.max(0, ...ctx), lastCtx: ctx.at(-1) ?? 0, ctxOver500k: ctx.filter((c) => c > 500000).length, compactions, reads, resultBytes, agentBriefs };
}
const results = [await analyse(main)]; results[0].role = 'coordinator';
if (subDir) for (const f of fs.readdirSync(subDir).filter((f) => f.endsWith('.jsonl'))) {
  const r = await analyse(path.join(subDir, f)); const mp = path.join(subDir, f.replace('.jsonl', '.meta.json'));
  try { const mt = JSON.parse(fs.readFileSync(mp, 'utf8')); r.role = mt.description; r.parent = mt.parentAgentId; r.depth = mt.spawnDepth; } catch {}
  results.push(r);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results.map((r) => ({ ...r, reads: [...r.reads] })), null, 1));
const k = (n) => (n / 1e3).toFixed(0) + 'k', M = (n) => (n / 1e6).toFixed(1) + 'M';
console.log('role|msgs|model|in+cw|cache read|out|max ctx|last ctx|first->last');
for (const r of results) console.log([r.role, r.messages, Object.keys(r.models).join(',').replace('claude-', ''), M(r.input + r.cacheWrite), M(r.cacheRead), k(r.output), k(r.maxCtx), k(r.lastCtx), r.compactions, (r.first ?? '').slice(5, 16) + '->' + (r.last ?? '').slice(5, 16)].join('|'));
// repeated reads across agents
const byFile = new Map();
for (const r of results) for (const [f, n] of r.reads) { const e = byFile.get(f) ?? { agents: new Set(), n: 0 }; e.agents.add(r.role); e.n += n; byFile.set(f, e); }
console.log('\nFiles read by >=3 agents (file|agents|reads)');
[...byFile].filter(([, e]) => e.agents.size >= 3).sort((a, b) => b[1].agents.size - a[1].agents.size || b[1].n - a[1].n).slice(0, 15).forEach(([f, e]) => console.log(f.replace(/^.*sandbox[^/]*\//, '') + '|' + e.agents.size + '|' + e.n));
console.log('\nSame file re-read within one agent (top 8: agent|file|n)');
results.flatMap((r) => [...r.reads].map(([f, n]) => [r.role, f, n])).sort((a, b) => b[2] - a[2]).slice(0, 8).forEach((x) => console.log(x[0] + '|' + x[1].replace(/^.*sandbox[^/]*\//, '') + '|' + x[2]));
const c = results[0]; console.log('\nCoordinator tool-result chars by tool:', JSON.stringify(Object.fromEntries(Object.entries(c.resultBytes).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, v]) => [n, k(v)]))));
console.log('Coordinator compactions:', c.compactions, '| Agent briefs (chars):', c.agentBriefs.length, 'total', k(c.agentBriefs.reduce((a, b) => a + b.chars, 0)), 'max', k(Math.max(0, ...c.agentBriefs.map((b) => b.chars))));
// ESTIMATE: relative cost units, weighting input 1, cache write 1.25, cache read 0.1, output 5 (Anthropic list-price ratios; not billing data).
const w = (r) => r.input + 1.25 * r.cacheWrite + 0.1 * r.cacheRead + 5 * r.output; const tot = results.reduce((a, r) => a + w(r), 0);
console.log('\nEstimated relative cost share (role|share|cache-read share of its cost)');
for (const r of results) console.log(r.role + '|' + (100 * w(r) / tot).toFixed(1) + '%|' + (100 * 0.1 * r.cacheRead / w(r)).toFixed(0) + '%');
console.log('Totals: messages', results.reduce((a, r) => a + r.messages, 0), '| input+cw', M(results.reduce((a, r) => a + r.input + r.cacheWrite, 0)), '| cache read', M(results.reduce((a, r) => a + r.cacheRead, 0)), '| output', k(results.reduce((a, r) => a + r.output, 0)));

// ESTIMATE: share of all tokens processed that sit above a context cap (what a lower auto-compact window would avoid, ignoring summary cost).
for (const cap of [300000, 400000, 500000]) {
  const all = results.reduce((a, r) => a + r.ctx.reduce((x, c) => x + c, 0), 0);
  const over = results.reduce((a, r) => a + r.ctx.reduce((x, c) => x + Math.max(0, c - cap), 0), 0);
  console.log('Cap ' + k(cap) + ': ' + (100 * over / all).toFixed(0) + '% of context tokens processed are above the cap');
}
