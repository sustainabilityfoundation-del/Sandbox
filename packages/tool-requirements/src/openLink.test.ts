import { describe, expect, it } from 'vitest'
import { openLinkViewState } from './domain'

const U = '5B1C7E2A-0001-4E6A-9C1D-6F0A3D2B1001'

describe('artifact open links', () => {
  it('maps id, collectionId and baselineId to the view state', () => {
    expect(openLinkViewState({ id: U })).toEqual({ page: 'table', editor: { requirementId: U.toLowerCase(), focus: 'details', tab: 'details' } })
    expect(openLinkViewState({ collectionId: U })).toEqual({ page: 'table', collectionId: U.toLowerCase(), baselineId: null })
    expect(openLinkViewState({ baselineId: U })).toEqual({ page: 'table', baselineId: U.toLowerCase() })
  })
  it('ignores unknown, empty and non-UUID params', () => {
    expect(openLinkViewState({})).toBeNull()
    expect(openLinkViewState({ id: 'REQ-001' })).toBeNull()
    expect(openLinkViewState({ other: U })).toBeNull()
  })
})
