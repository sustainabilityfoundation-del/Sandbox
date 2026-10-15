import { describe, expect, it } from 'vitest'
import { cadDeepLinkParams, parseCadDeepLink } from './deepLink'

const ID = '0b6f1d2e-3c4a-4b5c-8d6e-7f8091a2b3c4'

describe('CAD Modeler deep link', () => {
  it('parses ?tool=cad-modeler&document=<uuid>[&revision=<n>] only for this tool', () => {
    expect(parseCadDeepLink(`?tool=cad-modeler&document=${ID}&revision=3`)).toEqual({ documentId: ID, revision: 3 })
    expect(parseCadDeepLink(`?tool=cad-modeler&document=${ID}`)).toEqual({ documentId: ID })
    expect(parseCadDeepLink(`?tool=cad-modeler&document=${ID}&revision=0`)).toEqual({ documentId: ID })
    expect(parseCadDeepLink(`?tool=requirements&document=${ID}`)).toBeUndefined()
    expect(parseCadDeepLink('?tool=cad-modeler&document=CAD-120')).toBeUndefined()
    expect(parseCadDeepLink('?tool=cad-modeler')).toBeUndefined()
  })

  it('builds the parameters the artifact descriptors use', () => {
    expect(cadDeepLinkParams(ID)).toEqual({ document: ID })
    expect(cadDeepLinkParams(ID, 2)).toEqual({ document: ID, revision: '2' })
    expect(parseCadDeepLink(`?${new URLSearchParams({ tool: 'cad-modeler', ...cadDeepLinkParams(ID, 2) })}`)).toEqual({ documentId: ID, revision: 2 })
  })
})
