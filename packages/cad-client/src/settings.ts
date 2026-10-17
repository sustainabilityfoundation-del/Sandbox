import type { SettingDefinition, SettingsContribution } from '@ews/platform-sdk'

/**
 * CAD settings (SDK 1.6 SettingsContribution). Only display settings, per person:
 * measurement units, viewport tessellation and view defaults. Nothing here changes the model or its
 * regeneration: the native format stays in millimetres, and the solver and naming tolerances stay
 * fixed so every person regenerates a stored revision identically (contract C4). Dimension and
 * parameter entry stays in millimetres.
 *
 * Defined here (framework-free, browser-safe) so the tool contributes them and the API host can
 * register the same definitions with the settings service, which validates every write.
 */

export const CAD_SETTING_IDS = {
  units: 'cad-modeler.units.measurements',
  meshTolerance: 'cad-modeler.display.mesh-tolerance',
  orientation: 'cad-modeler.view.orientation',
  showEdges: 'cad-modeler.view.show-edges',
} as const

export const CAD_SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    id: CAD_SETTING_IDS.units,
    label: 'Measurement units',
    description:
      'Units for measured results: body volume, surface area, bounding box and mass, in the Model and Inspect panels and in previews. Model dimensions and parameters are always entered and stored in millimetres.',
    helpId: 'cad-modeler.settings',
    scope: 'user',
    group: 'Units',
    type: 'enum',
    options: [
      { value: 'mm', label: 'Millimetres (mm, mm², mm³, kg)' },
      { value: 'cm', label: 'Centimetres (cm, cm², cm³, g)' },
      { value: 'm', label: 'Metres (m, m², m³, kg)' },
      { value: 'in', label: 'Inches (in, in², in³, lb)' },
    ],
    default: 'mm',
  },
  {
    id: CAD_SETTING_IDS.meshTolerance,
    label: 'Display tessellation tolerance',
    description:
      'Largest distance between the displayed triangles and the exact surface. Smaller values show curved faces more smoothly but take longer to display. Display only: measurements and exports use the exact geometry.',
    helpId: 'cad-modeler.settings',
    scope: 'user',
    group: 'Tolerances',
    type: 'number',
    unit: 'mm',
    min: 0.01,
    max: 1,
    step: 0.01,
    default: 0.05,
  },
  {
    id: CAD_SETTING_IDS.orientation,
    label: 'Initial view',
    description: 'Direction the 3D view looks from when a document is first shown.',
    helpId: 'cad-modeler.settings',
    scope: 'user',
    group: 'View',
    type: 'enum',
    options: [
      { value: 'iso', label: 'Isometric' },
      { value: 'front', label: 'Front' },
      { value: 'top', label: 'Top' },
      { value: 'right', label: 'Right' },
    ],
    default: 'iso',
  },
  {
    id: CAD_SETTING_IDS.showEdges,
    label: 'Show edges',
    description: 'Draw the edges of bodies in new CAD views. The Edges button in the view still toggles them.',
    helpId: 'cad-modeler.settings',
    scope: 'user',
    group: 'View',
    type: 'boolean',
    default: true,
  },
]

export const CAD_SETTINGS: SettingsContribution = {
  page: { id: 'cad-modeler', title: 'CAD', description: 'Display units, tessellation and view defaults. The model itself is always stored in millimetres.' },
  definitions: CAD_SETTING_DEFINITIONS,
}
