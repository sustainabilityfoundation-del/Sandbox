import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Control } from './ToolToolbar'

describe('ToolToolbar number control', () => {
  it('renders a 1.14 number item with its label, unit, value and limits instead of dropping it', () => {
    const html = renderToStaticMarkup(
      <Control item={{ type: 'number', id: 'depth', label: 'Depth', value: 12.5, unit: 'mm', min: 0, max: 100, step: 0.5, onChange: () => undefined }} />,
    )
    expect(html).toContain('Depth (mm)')
    expect(html).toContain('value="12.5"')
    expect(html).toContain('aria-roledescription="Number field"')
  })
})
