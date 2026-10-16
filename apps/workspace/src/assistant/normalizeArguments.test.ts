import { describe, expect, it } from 'vitest'
import { normalizeArguments } from './executor'

describe('model argument normalisation', () => {
  const parameters = { type: 'object' as const, properties: { text: { type: 'string' }, parentId: { type: 'string' }, count: { type: 'integer' } }, required: ['text'], additionalProperties: false as const }
  it('drops empty or null optional arguments, which models send to mean "not given"', () => {
    expect(normalizeArguments(parameters, { text: 'A cover', parentId: '', count: null })).toEqual({ text: 'A cover' })
    expect(normalizeArguments(parameters, { text: 'A cover', parentId: '  ' })).toEqual({ text: 'A cover' })
  })
  it('keeps required arguments as given, so the required check still refuses them', () => {
    expect(normalizeArguments(parameters, { text: '' })).toEqual({ text: '' })
  })
})
