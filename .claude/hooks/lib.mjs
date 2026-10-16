// Shared helpers for the project's Claude Code hooks and status line. No dependencies.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const LEVELS = [95, 85, 70]; // warning thresholds, percent of the context window
export const readStdin = () => {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
};
export const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

// Window used for percentages when the hook input does not carry it (hooks do not receive the window size; the status line does).
export const windowTokens = () => Number(process.env.CTX_WINDOW_TOKENS) || 1_000_000;

// Context of the last API call in a transcript: input + cache write + cache read tokens. Reads only the file tail.
export function lastContext(transcriptPath) {
  try {
    const fd = fs.openSync(transcriptPath, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, 400_000);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').reverse();
    for (const l of lines) {
      if (!l.includes('"usage"')) continue;
      let o;
      try {
        o = JSON.parse(l);
      } catch {
        continue;
      }
      const u = o?.message?.usage;
      if (u && o.type === 'assistant') return (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    }
  } catch {
    /* transcript unavailable */
  }
  return null;
}
export const stateFile = (sessionId) => path.join(os.tmpdir(), `claude-ctx-${String(sessionId).slice(0, 12)}.json`);
export const projectDir = () => process.env.CLAUDE_PROJECT_DIR || process.cwd();
