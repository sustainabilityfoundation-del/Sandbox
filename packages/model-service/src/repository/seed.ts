import type { ActivityEntry, EngineeringObject, ModelSnapshot, OutputRecord, Relationship } from '../domain/types'

/**
 * The sample digital twin: one linear actuator (ACT-100 with housing, rod and
 * motor) used consistently by every tool. Physical components carry the
 * identity; the SysML elements and CAD representations point at them with
 * explicit 'represents' relationships. All values are illustrative.
 */
export const PROJECT_ID = 'PRJ-ACT100'

/** Physical components (shared with data saved by earlier versions). */
function components(): EngineeringObject[] {
  return [
    {
      id: 'ACT-100',
      type: 'assembly',
      name: 'Actuator assembly',
      properties: { partNumber: 'ACT-100-A', stroke: { value: 300, unit: 'mm' }, mass: { value: 6.8, unit: 'kg' } },
      revision: 1,
    },
    {
      id: 'HSG-110',
      type: 'part',
      name: 'Housing',
      parentId: 'ACT-100',
      properties: {
        partNumber: 'HSG-110-B',
        material: 'Aluminium 6082-T6',
        length: { value: 420, unit: 'mm' },
        outerDiameter: { value: 60, unit: 'mm' },
        wallThickness: { value: 5, unit: 'mm' },
        mass: { value: 2.1, unit: 'kg' },
      },
      revision: 2,
    },
    {
      id: 'ROD-120',
      type: 'part',
      name: 'Rod',
      parentId: 'ACT-100',
      properties: {
        partNumber: 'ROD-120-A',
        material: 'Steel 42CrMo4',
        diameter: { value: 25, unit: 'mm' },
        effectiveLength: { value: 600, unit: 'mm' },
        mass: { value: 2.3, unit: 'kg' },
      },
      revision: 2,
    },
    {
      id: 'MTR-130',
      type: 'part',
      name: 'Motor',
      parentId: 'ACT-100',
      properties: {
        partNumber: 'MTR-130-C',
        type: 'BLDC, 48 V',
        ratedPower: { value: 350, unit: 'W' },
        ratedSpeed: { value: 3000, unit: 'rpm' },
        mass: { value: 1.6, unit: 'kg' },
      },
      revision: 2,
    },
  ]
}

function requirements(): EngineeringObject[] {
  return [
    {
      id: 'REQ-001',
      type: 'requirement',
      name: 'Operating load',
      properties: {
        statement:
          'The actuator shall withstand an operating load of 12 kN in the maximum-load scenario with a positive margin of safety.',
        rationale: 'Peak press-fit force measured on the customer line is 11 kN; 12 kN adds a handling allowance.',
        status: 'approved',
        verificationMethods: ['Analysis', 'Test'],
      },
      revision: 4,
    },
    {
      id: 'REQ-002',
      type: 'requirement',
      name: 'Extension time',
      properties: {
        statement: 'The actuator shall extend its full 300 mm stroke in no more than 6.0 s at nominal load.',
        rationale: 'Cycle-time budget of the assembly cell.',
        status: 'approved',
        verificationMethods: ['Test'],
      },
      revision: 4,
    },
    {
      id: 'REQ-003',
      type: 'requirement',
      name: 'Ingress protection',
      properties: {
        statement: 'The housing shall provide ingress protection to IP65.',
        rationale: 'Wash-down cleaning in the food-packaging variant.',
        status: 'in-review',
        verificationMethods: ['Inspection'],
      },
      revision: 4,
    },
  ]
}

/**
 * SysML elements and CAD representations of the components above, with their
 * relationships. Also added (only where missing) when data saved by an earlier
 * version is upgraded, so existing components gain representations instead of
 * duplicates.
 */
export function representationSeed(): { objects: Omit<EngineeringObject, 'revision'>[]; relationships: Omit<Relationship, 'id' | 'revision'>[] } {
  return {
    objects: [
      { id: 'SYS-001', type: 'sysml-element', name: 'ActuatorSystem', properties: { kind: 'part' } },
      { id: 'SYS-002', type: 'sysml-element', name: 'housing', parentId: 'SYS-001', properties: { kind: 'part', typeName: 'Housing' } },
      { id: 'SYS-003', type: 'sysml-element', name: 'rod', parentId: 'SYS-001', properties: { kind: 'part', typeName: 'Rod' } },
      { id: 'SYS-004', type: 'sysml-element', name: 'motor', parentId: 'SYS-001', properties: { kind: 'part', typeName: 'Motor' } },
      { id: 'SYS-005', type: 'sysml-element', name: 'operatingLoad', properties: { kind: 'requirement' } },
      { id: 'SYS-006', type: 'sysml-element', name: 'extensionTime', properties: { kind: 'requirement' } },
      {
        id: 'CAD-110',
        type: 'cad-representation',
        name: 'Housing (mock geometry)',
        properties: { shape: 'housing', length: { value: 420, unit: 'mm' }, outerDiameter: { value: 60, unit: 'mm' } },
      },
      {
        id: 'CAD-120',
        type: 'cad-representation',
        name: 'Rod (mock geometry)',
        properties: { shape: 'rod', diameter: { value: 25, unit: 'mm' }, length: { value: 600, unit: 'mm' } },
      },
      {
        id: 'CAD-130',
        type: 'cad-representation',
        name: 'Motor (mock geometry)',
        properties: { shape: 'motor', length: { value: 160, unit: 'mm' }, diameter: { value: 70, unit: 'mm' } },
      },
    ],
    relationships: [
      { type: 'represents', from: 'SYS-001', to: 'ACT-100' },
      { type: 'represents', from: 'SYS-002', to: 'HSG-110' },
      { type: 'represents', from: 'SYS-003', to: 'ROD-120' },
      { type: 'represents', from: 'SYS-004', to: 'MTR-130' },
      { type: 'references', from: 'SYS-005', to: 'REQ-001' },
      { type: 'references', from: 'SYS-006', to: 'REQ-002' },
      { type: 'connects', from: 'SYS-004', to: 'SYS-003' },
      { type: 'connects', from: 'SYS-003', to: 'SYS-002' },
      { type: 'satisfies', from: 'SYS-003', to: 'SYS-005' },
      { type: 'satisfies', from: 'SYS-001', to: 'SYS-006' },
      { type: 'represents', from: 'CAD-110', to: 'HSG-110' },
      { type: 'represents', from: 'CAD-120', to: 'ROD-120' },
      { type: 'represents', from: 'CAD-130', to: 'MTR-130' },
    ],
  }
}

export function seedModel(): ModelSnapshot {
  const reps = representationSeed()
  const allocations: Omit<Relationship, 'id' | 'revision'>[] = [
    { type: 'allocated-to', from: 'REQ-001', to: 'ROD-120' },
    { type: 'allocated-to', from: 'REQ-001', to: 'HSG-110' },
    { type: 'allocated-to', from: 'REQ-002', to: 'ACT-100' },
    { type: 'allocated-to', from: 'REQ-002', to: 'MTR-130' },
    { type: 'allocated-to', from: 'REQ-003', to: 'HSG-110' },
  ]
  const relationships: Relationship[] = [
    ...allocations.map((r) => ({ ...r, revision: 4 })),
    ...reps.relationships.map((r) => ({ ...r, revision: 5 })),
  ].map((r, i) => ({ ...r, id: `REL-${String(i + 1).padStart(4, '0')}` }))

  return {
    project: { id: PROJECT_ID, name: 'ACT-100 Linear actuator' },
    configurations: [
      { id: 'CFG-BASE', name: 'Baseline', description: 'Production baseline configuration' },
      { id: 'CFG-HD', name: 'Heavy-duty variant', description: 'Variant study; artifacts are kept separate' },
    ],
    scenarios: [
      {
        id: 'SCN-NOM',
        name: 'Nominal operation',
        description: 'Continuous duty at rated load',
        properties: { operatingLoad: { value: 8, unit: 'kN' }, ambientTemperature: { value: 20, unit: '°C' } },
        revision: 3,
      },
      {
        id: 'SCN-MAX',
        name: 'Maximum load',
        description: 'Peak axial compressive load case',
        properties: { operatingLoad: { value: 11, unit: 'kN' }, ambientTemperature: { value: 60, unit: '°C' } },
        revision: 3,
      },
    ],
    objects: [...components(), ...requirements(), ...reps.objects.map((o) => ({ ...o, revision: 5 }))],
    relationships,
    modelRevision: 6,
  }
}

export function seedOutputs(): OutputRecord[] {
  return [
    {
      id: 'OUT-0001',
      toolId: 'cad',
      kind: 'cad-representation',
      schemaVersion: 1,
      title: 'Rod representation snapshot',
      projectId: PROJECT_ID,
      configurationId: 'CFG-BASE',
      scenarioId: null,
      objectIds: ['ROD-120', 'CAD-120'],
      inputRevision: 6,
      inputs: [
        { id: 'CAD-120', revision: 5 },
        { id: 'ROD-120', revision: 2 },
      ],
      createdAt: '2026-10-04T09:30:00.000Z',
      completion: 'complete',
      result: [
        { key: 'diameter', label: 'Diameter', value: 25, unit: 'mm' },
        { key: 'length', label: 'Length', value: 600, unit: 'mm' },
      ],
      summary: 'Mock geometry: Ø25 × 600 mm',
      reviewStatus: 'approved',
    },
  ]
}

export function seedActivity(): ActivityEntry[] {
  return [
    {
      id: 'LOG-00002',
      at: '2026-10-04T09:30:00.000Z',
      kind: 'save',
      toolId: 'cad',
      message: 'Saved OUT-0001 Rod representation snapshot',
      objectIds: ['ROD-120', 'CAD-120'],
      configurationId: 'CFG-BASE',
      scenarioId: null,
    },
    {
      id: 'LOG-00001',
      at: '2026-10-02T14:20:00.000Z',
      kind: 'change',
      toolId: 'requirements',
      message: 'Approved REQ-001 Operating load (model rev 4)',
      objectIds: ['REQ-001'],
      configurationId: 'CFG-BASE',
    },
  ]
}
