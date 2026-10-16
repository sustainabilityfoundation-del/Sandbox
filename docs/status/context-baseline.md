# Context and token baseline (16 October 2026)

Brief: [context-optimization.md](../specifications/context-optimization.md). Method: `node scripts/session-usage.mjs <session.jsonl> <subagents-dir>`
streams the Claude Code transcripts and sums the `message.usage` of each assistant message (de-duplicated by message id).
**Measured** = from transcripts. **Estimate** = labelled; none of it is billing data.

## 1. Measured: usage per agent (coordinator session 13-16 Oct, 15 transcripts)

| Agent | Msgs | Model | Input + cache write | Cache read | Output | Largest context | Compactions |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Coordinator | 1712 | opus-5-5 | 12.3M | 844M | 2113k | 965k | 6 |
| Conceptualize | 890 | opus-5-5 | 16.0M | 416M | 521k | 967k | 4 |
| CAD program | 878 | opus-5-5 | 12.9M | 417M | 342k | 963k | 2 |
| SysML program | 712 | opus-5-5 | 8.1M | 328M | 386k | 958k | 2 |
| Requirements | 700 | opus-5-5 | 12.6M | 301M | 391k | 963k | 2 |
| AI connection | 696 | opus-5-5 | 12.0M | 315M | 223k | 966k | 2 |
| Project Management | 386 | opus-5-5 | 12.6M | 218M | 247k | 960k | 0 |
| Design reasoning | 346 | opus-5-5 | 5.1M | 164M | 347k | 963k | 2 |
| ui-ux-design-system (running) | 285 | opus-5-5 | 4.2M | 114M | 103k | 636k | 0 |
| 5 research and conformance sub-subagents | 255 | opus-5-5 | 0.7M | 29M | 178k | 69k-300k | 0 |
| Total (14 agents, without this one) | 6.9k | | 96.7M | 3145M | 4.85M | | |

Findings from the numbers:
- Every long-running agent, the coordinator included, runs at the auto-compaction ceiling (958k-967k). The documented default
  window for native-1M models is about 967k, so each agent lives near the top of its window and pays for it on every message.
- Cache reads are 97% of all tokens processed. The coordinator averages about 493k context per message (844M / 1712).
- Estimated cost share (weights: input 1, cache write 1.25, cache read 0.1, output 5; a ratio estimate): coordinator 24%, Conceptualize 14%,
  CAD 13%, Requirements 10%, AI connection 10%, SysML 10%, Project Management 8%, Design reasoning 5%, UI 4%, research below 1%.
  Cache reads are 56-76% of each agent's cost. Output is small; context size drives cost.
- All agents ran on Opus. No `.claude/` directory exists in the repository, so no agent definitions, hooks, status line or
  project settings were configured. `~/.claude/settings.json` holds only `agentPushNotifEnabled`. No MCP servers are configured in the repository.

## 2. Answers to the Phase 1 questions

| # | Question | Finding | Basis |
| ---: | --- | --- | --- |
| 1 | Agents configured / running | 0 configured definitions. 8 module/design agents plus 5 research sub-subagents in 3 days (spawn depth 2 for research). Running now: ui-ux-design-system and this agent | Measured (meta files) |
| 2 | Large payloads to subagents | Briefs are small: 9 `Agent` calls by the coordinator, 55k characters in total, 9k maximum (about 2k tokens). The payload is not the problem. The load is each agent's own growth to about 960k | Measured |
| 3 | Architecture docs reloaded | Fixed overhead per agent is CLAUDE.md + AGENTS.md, 15 KB (about 4k tokens, estimate). `docs/architecture.md` is 12 KB. Progress files are the large items (26-55 KB each, about 7-14k tokens, estimate) and agents re-read their own: Conceptualize read its progress file 5 times | Measured sizes and counts |
| 4 | Duplicated inspection | Cross-agent duplicate `Read` calls are rare: only `boundaries.test.ts` was read by 3 agents. Agents mostly use Bash for reading, which is not counted. Duplication risk is in re-reading, not cross-agent | Measured (Read only); limitation |
| 5 | Coordinator history | 894k at the last message after 6 compactions; 1712 messages in 3 days. Tool results returned into it: 1.7M characters of Bash, 0.3M of text Read, and **13.2M characters of image data** (screenshots read with `Read`), the dominant item by volume | Measured; image token cost is not derivable from base64 length (limitation) |
| 6 | Verbose outputs | Output is 4.85M tokens, 5% of the volume but weighted 5x. The coordinator produces 2.1M of it (44%) | Measured |
| 7 | Expensive models | 100% Opus. Candidates for a mid-tier model: research, survey and conformance harness agents (5 of 14), routine implementation, test writing and documentation. Reliability of the mid-tier model on this repository's rules is not measured | Measured use; recommendation is judgement |
| 8 | Compaction and handoff | Automatic only (6 times in the coordinator, 2-4 in modules). No PreCompact or SessionStart hook, no handoff record. Progress files act as the de facto memory | Measured and configuration |
| 9 | Rereads and regeneration | Top re-reads: workspace README 7x, one screenshot 6x (SysML), conceptualize-progress.md 5x. Not large in count | Measured (Read only) |
| 10 | Parallelism | 8 agents ran concurrently on 15-16 Oct, each with its own near-1M context, so cost scales with agent count x context. Output (task throughput) cannot be compared from transcripts alone | Measured cost; productivity not measurable here |

## 3. Limits of this baseline
- Subscription usage limits are a separate matter and are not derivable from transcripts. Cost shares are ratio estimates.
- Bash-based file reads, tool-result tokens and image tokens are not separately metered. Thinking tokens are inside output.
- Wall-clock time and quality are not compared here; see Phase 6 in the progress file.

## 4. Documented Claude Code facts used (checked 16 Oct 2026 against code.claude.com/docs)
- Subagent definitions: `.claude/agents/*.md`; frontmatter `name`, `description`, `tools`, `disallowedTools`, `model`
  (`sonnet`, `opus`, `haiku`, `fable`, a full id, or `inherit`), `maxTurns`, `effort`, `omitClaudeMd`, `autoCompactWindow` (100000-1000000),
  `memory`, `background`, `isolation`. Model order: invocation parameter, frontmatter, `CLAUDE_CODE_SUBAGENT_MODEL`, parent. Subagents load CLAUDE.md unless `omitClaudeMd`.
- Hooks (`.claude/settings.json`): `PreCompact` (matcher `manual`/`auto`; exit code 2 blocks compaction), `PostCompact`, `SessionStart`
  (matcher `startup|resume|clear|compact|fork`; stdout or `additionalContext` is added to the context), `SubagentStart`/`SubagentStop`, `Stop`.
- Status line: `statusLine` setting with `type: command`; JSON on stdin includes `context_window.used_percentage`, `context_window_size`, `transcript_path`.
- Auto-compaction: window about 967k for native-1M models; set with `autoCompactWindow`, `/autocompact`, or `CLAUDE_CODE_AUTO_COMPACT_WINDOW`; CLAUDE.md "Compact instructions" steer the summary.
- Limits: `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20), `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`.
