/**
 * SDK version. The host implements this version of the tool contract; each tool
 * declares the range it was built against (`sdkVersion: '^1.0.0'`).
 *
 * Rules (semver):
 * - Major: breaking contract change. Tools built for another major are not loaded.
 * - Minor: additive (new optional fields, new hooks). A tool needing 1.2 runs on host 1.3, not on 1.1.
 * - Patch: fixes only.
 *
 * Any change to the contract needs a migration note in packages/platform-sdk/CHANGELOG.md
 * and validation of every tool package (npm run check).
 */
export const SDK_VERSION = '1.15.0'

function parse(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/** Whether a tool's declared range (`^M.m.p` or `M.m.p`) is satisfied by the host SDK version. */
export function isSdkCompatible(required: string, host: string = SDK_VERSION): boolean {
  const caret = required.trim().startsWith('^')
  const want = parse(caret ? required.trim().slice(1) : required)
  const have = parse(host)
  if (!want || !have) return false
  if (!caret) return want.every((n, i) => n === have[i])
  if (want[0] !== have[0]) return false
  if (want[1] !== have[1]) return have[1] > want[1]
  return have[2] >= want[2]
}
