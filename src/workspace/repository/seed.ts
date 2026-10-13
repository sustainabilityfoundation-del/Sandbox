import type { ActivityEntry, ModelSnapshot, OutputRecord } from '../domain/types'

/**
 * The sample digital twin: one linear actuator used consistently by every tool.
 * All values are illustrative.
 */
export const PROJECT_ID = 'PRJ-ACT100'

const SEED_TIME = '2026-10-01T09:00:00.000Z'

export function seedModel(): ModelSnapshot {
  return {
    project: { id: PROJECT_ID, name: 'ACT-100 Linear actuator' },
    configurations: [
      { id: 'CFG-BASE', name: 'Baseline', description: 'Production baseline configuration' },
      { id: 'CFG-HD', name: 'Heavy-duty variant', description: 'Variant study; results are kept separate' },
    ],
    scenarios: [
      {
        id: 'SCN-NOM',
        name: 'Nominal operation',
        description: 'Continuous duty at rated load',
        properties: {
          operatingLoad: { value: 8, unit: 'kN' },
          ambientTemperature: { value: 20, unit: '°C' },
        },
        revision: 3,
      },
      {
        id: 'SCN-MAX',
        name: 'Maximum load',
        description: 'Peak axial compressive load case',
        properties: {
          // Deliberately below REQ-001's 12 kN, so the demo has a real change to make.
          operatingLoad: { value: 11, unit: 'kN' },
          ambientTemperature: { value: 60, unit: '°C' },
        },
        revision: 3,
      },
    ],
    objects: [
      {
        id: 'ACT-100',
        type: 'assembly',
        name: 'Actuator assembly',
        properties: {
          partNumber: 'ACT-100-A',
          stroke: { value: 300, unit: 'mm' },
          mass: { value: 6.8, unit: 'kg' },
        },
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
          elasticModulus: { value: 200, unit: 'GPa' },
          endFixityFactor: { value: 2, unit: '-' },
          designFactor: { value: 2, unit: '-' },
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
      {
        id: 'REQ-001',
        type: 'requirement',
        name: 'Operating load',
        properties: {
          statement:
            'The actuator shall withstand an operating load of 12 kN in the maximum-load scenario with a positive margin of safety.',
          verificationMethods: ['Analysis', 'Test'],
          compliance: 'not-assessed',
        },
        revision: 4,
      },
      {
        id: 'REQ-002',
        type: 'requirement',
        name: 'Extension time',
        properties: {
          statement: 'The actuator shall extend its full 300 mm stroke in no more than 6.0 s at nominal load.',
          verificationMethods: ['Test'],
          compliance: 'compliant',
        },
        revision: 4,
      },
      {
        id: 'REQ-003',
        type: 'requirement',
        name: 'Ingress protection',
        properties: {
          statement: 'The housing shall provide ingress protection to IP65.',
          verificationMethods: ['Inspection'],
          compliance: 'not-assessed',
        },
        revision: 4,
      },
      {
        id: 'VP-001',
        type: 'procedure',
        name: 'Rod compressive load test',
        properties: {
          method: 'Test',
          steps: [
            'Mount actuator in load frame at full extension',
            'Apply axial compressive load in 2 kN steps to 12 kN',
            'Hold for 60 s, then unload and inspect the rod',
          ],
          acceptanceCriteria: 'No buckling or permanent deformation at 12 kN held for 60 s.',
        },
        revision: 5,
      },
      {
        id: 'VP-002',
        type: 'procedure',
        name: 'Extension time test',
        properties: {
          method: 'Test',
          steps: ['Apply 8 kN opposing load', 'Command full extension from fully retracted', 'Record stroke time'],
          acceptanceCriteria: 'Full 300 mm stroke completed in ≤ 6.0 s at 8 kN.',
        },
        revision: 5,
      },
    ],
    relationships: [
      { id: 'REL-0001', type: 'allocated-to', from: 'REQ-001', to: 'ROD-120', revision: 4 },
      { id: 'REL-0002', type: 'allocated-to', from: 'REQ-001', to: 'HSG-110', revision: 4 },
      { id: 'REL-0003', type: 'allocated-to', from: 'REQ-002', to: 'ACT-100', revision: 4 },
      { id: 'REL-0004', type: 'allocated-to', from: 'REQ-002', to: 'MTR-130', revision: 4 },
      { id: 'REL-0005', type: 'allocated-to', from: 'REQ-003', to: 'HSG-110', revision: 4 },
      { id: 'REL-0006', type: 'verifies', from: 'VP-001', to: 'REQ-001', revision: 5 },
      { id: 'REL-0007', type: 'tests', from: 'VP-001', to: 'ROD-120', revision: 5 },
      { id: 'REL-0008', type: 'verifies', from: 'VP-002', to: 'REQ-002', revision: 5 },
      { id: 'REL-0009', type: 'tests', from: 'VP-002', to: 'ACT-100', revision: 5 },
      { id: 'REL-0010', type: 'tests', from: 'VP-002', to: 'MTR-130', revision: 5 },
      { id: 'REL-0011', type: 'evidence-for', from: 'OUT-0002', to: 'VP-002', revision: 6 },
      { id: 'REL-0012', type: 'evidence-for', from: 'OUT-0003', to: 'VP-001', revision: 6 },
    ],
    modelRevision: 6,
  }
}

export function seedOutputs(): OutputRecord[] {
  return [
    {
      id: 'OUT-0001',
      toolId: 'analysis',
      kind: 'structural-assessment',
      title: 'Rod buckling assessment',
      projectId: PROJECT_ID,
      configurationId: 'CFG-BASE',
      scenarioId: 'SCN-NOM',
      objectIds: ['ROD-120'],
      inputRevision: 6,
      inputs: [
        { id: 'ROD-120', revision: 2 },
        { id: 'SCN-NOM', revision: 3 },
      ],
      createdAt: '2026-10-02T14:20:00.000Z',
      completion: 'complete',
      result: [
        { key: 'operatingLoad', label: 'Operating load', value: 8, unit: 'kN' },
        { key: 'criticalLoad', label: 'Critical buckling load', value: 26.28, unit: 'kN' },
        { key: 'allowableLoad', label: 'Allowable load', value: 13.14, unit: 'kN' },
        { key: 'margin', label: 'Margin of safety', value: 0.643, unit: '-' },
        { key: 'utilisation', label: 'Utilisation', value: 60.9, unit: '%' },
      ],
      summary: 'Margin of safety +0.64 (demo calculation)',
      reviewStatus: 'approved',
    },
    {
      id: 'OUT-0002',
      toolId: 'verification',
      kind: 'test-result',
      title: 'Extension time test result',
      projectId: PROJECT_ID,
      configurationId: 'CFG-BASE',
      scenarioId: 'SCN-NOM',
      objectIds: ['VP-002', 'REQ-002', 'ACT-100', 'MTR-130'],
      inputRevision: 6,
      inputs: [
        { id: 'VP-002', revision: 5 },
        { id: 'ACT-100', revision: 1 },
        { id: 'MTR-130', revision: 2 },
      ],
      createdAt: '2026-10-03T10:05:00.000Z',
      completion: 'complete',
      result: [
        { key: 'outcome', label: 'Outcome', value: 'Pass' },
        { key: 'measured', label: 'Measured stroke time', value: 5.4, unit: 's' },
      ],
      summary: 'Pass: 5.4 s measured (mock test record)',
      reviewStatus: 'approved',
    },
    {
      id: 'OUT-0003',
      toolId: 'analysis',
      kind: 'structural-assessment',
      title: 'Rod buckling assessment',
      projectId: PROJECT_ID,
      configurationId: 'CFG-BASE',
      scenarioId: 'SCN-MAX',
      objectIds: ['ROD-120'],
      inputRevision: 6,
      inputs: [
        { id: 'ROD-120', revision: 2 },
        { id: 'SCN-MAX', revision: 3 },
      ],
      createdAt: '2026-10-04T09:30:00.000Z',
      completion: 'complete',
      result: [
        { key: 'operatingLoad', label: 'Operating load', value: 11, unit: 'kN' },
        { key: 'criticalLoad', label: 'Critical buckling load', value: 26.28, unit: 'kN' },
        { key: 'allowableLoad', label: 'Allowable load', value: 13.14, unit: 'kN' },
        { key: 'margin', label: 'Margin of safety', value: 0.195, unit: '-' },
        { key: 'utilisation', label: 'Utilisation', value: 83.7, unit: '%' },
      ],
      summary: 'Margin of safety +0.19 (demo calculation)',
      reviewStatus: 'in-review',
    },
  ]
}

export function seedActivity(): ActivityEntry[] {
  return [
    {
      id: 'LOG-00003',
      at: '2026-10-04T09:30:00.000Z',
      kind: 'save',
      toolId: 'analysis',
      message: 'Saved OUT-0003 Rod buckling assessment',
      objectIds: ['ROD-120'],
      configurationId: 'CFG-BASE',
      scenarioId: 'SCN-MAX',
    },
    {
      id: 'LOG-00002',
      at: '2026-10-03T10:05:00.000Z',
      kind: 'save',
      toolId: 'verification',
      message: 'Saved OUT-0002 Extension time test result',
      objectIds: ['VP-002'],
      configurationId: 'CFG-BASE',
      scenarioId: 'SCN-NOM',
    },
    {
      id: 'LOG-00001',
      at: '2026-10-02T14:20:00.000Z',
      kind: 'save',
      toolId: 'analysis',
      message: 'Saved OUT-0001 Rod buckling assessment',
      objectIds: ['ROD-120'],
      configurationId: 'CFG-BASE',
      scenarioId: 'SCN-NOM',
    },
  ].map((e) => ({ ...e, kind: e.kind as ActivityEntry['kind'] }))
}

export { SEED_TIME }
