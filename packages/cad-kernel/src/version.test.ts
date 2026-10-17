import { CadEngine, createDocument } from '@ews/cad-core'
import { beforeAll, describe, expect, it } from 'vitest'
import { sharedNodeKernel, type OcctKernel } from './node'
import { OCCT_KERNEL_INFO } from './occt/info'

/**
 * The OCCT version inside replicad-opencascadejs is not stated by the package. The STEP writer stamps
 * its processor version into every file it writes, which is the version of the linked library; this
 * test keeps the documented version (kernel info, docs/modules/cad/kernel-selection.md) honest and
 * fails when a dependency update changes it.
 */

let kernel: OcctKernel
beforeAll(async () => {
  kernel = await sharedNodeKernel()
}, 60_000)

describe('OCCT version', () => {
  it('matches the version stamped into STEP files and recorded in the kernel info', async () => {
    const e = new CadEngine({ kernel, document: createDocument({ documentId: '00000000-0000-4000-8000-0000000000c3' }) })
    const r = await e.execute({
      commands: [
        { command: 'create_part', input: { name: 'Cube', ref: '$p' } },
        { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
        { command: 'add_rectangle', input: { sketchId: '$s', width: 10, height: 10 } },
        { command: 'extrude_profile', input: { sketchId: '$s', distance: 10 } },
      ],
    })
    expect(r.ok).toBe(true)
    const { text } = await e.exportStep()
    const stamp = /Open CASCADE STEP processor (\d+\.\d+)/.exec(text)
    expect(stamp, 'STEP header names the OCCT processor version').not.toBeNull()
    expect(stamp![1]).toBe('8.0')
    expect(OCCT_KERNEL_INFO.version).toContain(`Open CASCADE ${stamp![1]}`)
  })
})
