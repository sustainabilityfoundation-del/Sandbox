import { checkSettingValue, validateSettingDefinitions } from '@ews/platform-sdk'
import { describe, expect, it } from 'vitest'
import { cadModelerTool } from './index'
import { CAD_SETTINGS, CAD_SETTING_DEFINITIONS, measure } from './settings'

describe('CAD Modeler settings contribution (SDK 1.6)', () => {
  it('is registered on the tool, valid, user-scoped and display-only', () => {
    expect(cadModelerTool.settings).toBe(CAD_SETTINGS)
    expect(validateSettingDefinitions(CAD_SETTING_DEFINITIONS)).toEqual([])
    expect(CAD_SETTING_DEFINITIONS.map((d) => [d.id, d.scope])).toEqual([
      ['cad-modeler.units.measurements', 'user'],
      ['cad-modeler.display.mesh-tolerance', 'user'],
      ['cad-modeler.view.orientation', 'user'],
      ['cad-modeler.view.show-edges', 'user'],
    ])
    const tol = CAD_SETTING_DEFINITIONS[1]
    expect(checkSettingValue(tol, 0.001)).toMatch(/between 0.01 and 1 mm/)
    expect(checkSettingValue(tol, 0.2)).toBeNull()
    // Every setting is explained in the help topic it names.
    const topics = new Set(cadModelerTool.help!.topics.map((t) => t.id))
    for (const d of CAD_SETTING_DEFINITIONS) expect(topics.has(d.helpId!)).toBe(true)
  })

  it('converts measured values (mm, kg) to display units', () => {
    const inch = measure('in')
    expect(inch.length(25.4).value).toBeCloseTo(1, 12)
    expect(inch.length(25.4).unit).toBe('in')
    expect(inch.volume(25.4 ** 3).value).toBeCloseTo(1, 12)
    expect(inch.mass(0.45359237).value).toBeCloseTo(1, 12)
    expect(inch.mass(1).unit).toBe('lb')
    const cm = measure('cm')
    expect(cm.area(100).value).toBeCloseTo(1, 12)
    expect(cm.area(100).unit).toBe('cm²')
    expect(cm.mass(0.5)).toEqual({ value: 500, unit: 'g' })
    expect(measure('m').volume(1e9).value).toBeCloseTo(1, 12)
    expect(measure(undefined).volume(30869)).toEqual({ value: 30869, unit: 'mm³' })
  })
})
