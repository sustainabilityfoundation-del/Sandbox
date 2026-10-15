/**
 * Automatic format detection with informative diagnostics (brief §7.1). Detection reads signatures,
 * never trusts the extension alone. Support levels are honest: only formats with a verified
 * implementation are 'supported'; everything else explains the recommended route.
 * Sources and confidence: docs/research/cad/interoperability.md.
 */

export type FormatSupport = 'supported' | 'planned' | 'requires-approval' | 'unsupported'

export interface DetectedFormat {
  format: string
  label: string
  confidence: 'high' | 'medium' | 'low'
  support: { open: FormatSupport; import: FormatSupport; export: FormatSupport }
  /** What the format can carry (fidelity levels are distinct, brief §7.1). */
  carries: string[]
  message: string
}

const NATIVE_MESSAGE = (system: string) =>
  `${system} native files are proprietary and cannot be decoded with the libraries this module may use. Export STEP AP242 (exact solids, assembly structure, names, colours and, where supported, PMI) from ${system}, then import that file. Licensed translators or vendor APIs are possible later and need approval.`

function ascii(bytes: Uint8Array, n = 512): string {
  let s = ''
  for (let i = 0; i < Math.min(n, bytes.length); i++) s += String.fromCharCode(bytes[i])
  return s
}

export function detectFormat(input: Uint8Array | string, fileName = ''): DetectedFormat {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input.slice(0, 4096)) : input
  const head = ascii(bytes, 2048)
  const ext = fileName.toLowerCase().split('.').pop() ?? ''

  if (/^\s*\{/.test(head) && /"format"\s*:\s*"ews-cad"/.test(head))
    return { format: 'ews-cad', label: 'EWS CAD native model (ews-cad JSON)', confidence: 'high', support: { open: 'supported', import: 'supported', export: 'supported' }, carries: ['parametric feature history', 'sketches and constraints', 'parameters', 'metadata', 'engineering semantics', 'external references'], message: 'Native open parametric model; opens with full design intent.' }
  if (/^\s*ISO-10303-21;/.test(head)) {
    const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/.exec(head)?.[1] ?? ''
    const ap = /AP242|MANAGED_MODEL_BASED|10303 442/i.test(schema) ? 'AP242' : /AUTOMOTIVE_DESIGN/i.test(schema) ? 'AP214' : /CONFIG_CONTROL_DESIGN/i.test(schema) ? 'AP203' : 'unknown AP'
    return {
      format: 'step',
      label: `STEP (ISO 10303-21, ${ap})`,
      confidence: 'high',
      support: { open: 'planned', import: 'planned', export: 'supported' },
      carries: ['exact solid B-rep', 'surface geometry', 'assembly structure', 'names, colours, units', ap === 'AP242' ? 'semantic and graphical PMI (if written)' : 'no semantic PMI'],
      message: 'STEP export is supported (AP242). Importing STEP as a history-free base body is planned for Phase 5 (geometry-only re-import already works in the kernel and is used to verify exports); STEP never carries a parametric feature history.',
    }
  }
  if (/^.{72}S\s*0*1\s*$/m.test(head) || (head.length >= 80 && head[72] === 'S' && /^[ \d]{7}$/.test(head.slice(73, 80))))
    return { format: 'iges', label: 'IGES', confidence: 'medium', support: { open: 'planned', import: 'planned', export: 'planned' }, carries: ['surface geometry', 'trimmed surfaces', 'limited solids', 'layers, colours'], message: 'IGES import is planned (Phase 5, OCCT IGES reader is in the kernel build); it is mainly surface data without feature history.' }
  if (bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46)
    return { format: 'glb', label: 'glTF binary (GLB)', confidence: 'high', support: { open: 'unsupported', import: 'planned', export: 'planned' }, carries: ['tessellated geometry', 'materials', 'scene hierarchy'], message: 'glTF is a visualization format (meshes only). Export is planned for review and sharing; it cannot carry exact geometry.' }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    if (head.includes('3D/3dmodel.model') || ext === '3mf') return { format: '3mf', label: '3MF (zip)', confidence: head.includes('3D/3dmodel.model') ? 'high' : 'medium', support: { open: 'unsupported', import: 'planned', export: 'planned' }, carries: ['tessellated geometry', 'units', 'colours/materials', 'build items'], message: '3MF is a mesh format for additive manufacturing. Export is planned (Phase 5).' }
    if (head.includes('Document.xml') || ext === 'fcstd') return { format: 'fcstd', label: 'FreeCAD document (FCStd, zip)', confidence: 'medium', support: { open: 'unsupported', import: 'planned', export: 'unsupported' }, carries: ['exact B-rep (BREP inside)', 'FreeCAD feature tree (FreeCAD-specific)'], message: 'FreeCAD files are open (zip with XML and BREP). Reading the B-rep is feasible later; FreeCAD feature history is not mapped. Export STEP from FreeCAD for now.' }
    if (ext === '3dxml') return { format: '3dxml', label: '3D XML (Dassault Systèmes)', confidence: 'low', support: { open: 'unsupported', import: 'requires-approval', export: 'unsupported' }, carries: ['tessellated or exact geometry (variant-dependent)', 'product structure'], message: NATIVE_MESSAGE('CATIA / 3DEXPERIENCE') }
    return { format: 'zip', label: 'ZIP container', confidence: 'low', support: { open: 'unsupported', import: 'unsupported', export: 'unsupported' }, carries: [], message: 'This is a ZIP container of an unknown CAD format.' }
  }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    const system = ext === 'sldprt' || ext === 'sldasm' ? 'SOLIDWORKS' : ext === 'ipt' || ext === 'iam' ? 'Autodesk Inventor' : ext === 'par' || ext === 'asm' || ext === 'psm' ? 'Solid Edge' : 'A proprietary CAD system'
    return { format: 'ole-compound', label: `${system} native file (OLE compound document)`, confidence: ext ? 'medium' : 'low', support: { open: 'requires-approval', import: 'requires-approval', export: 'unsupported' }, carries: ['proprietary B-rep and feature history'], message: NATIVE_MESSAGE(system) }
  }
  if (/^AC10\d\d/.test(head)) return { format: 'dwg', label: `DWG (${head.slice(0, 6)})`, confidence: 'high', support: { open: 'requires-approval', import: 'requires-approval', export: 'requires-approval' }, carries: ['2D drawing geometry', 'some 3D (ACIS) solids'], message: 'DWG needs a licensed library (Open Design Alliance) or a GPL library; both need approval. Save as DXF or PDF in the source application.' }
  if (/^\s*0\s*\r?\n\s*SECTION/.test(head)) return { format: 'dxf', label: 'DXF', confidence: 'high', support: { open: 'unsupported', import: 'planned', export: 'planned' }, carries: ['2D geometry', 'layers', 'blocks'], message: 'DXF is for 2D drawings; DXF export of drawings is planned (Phase 4, own writer).' }
  if (/^\s*solid\s/i.test(head) && /facet\s+normal/i.test(head)) return { format: 'stl-ascii', label: 'STL (ASCII)', confidence: 'high', support: { open: 'unsupported', import: 'planned', export: 'planned' }, carries: ['tessellated geometry only (no units, names or colours)'], message: 'STL is a triangle mesh without units or exact geometry. Mesh import/export is planned.' }
  if (bytes.length >= 84 && ext === 'stl') {
    const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(80, true)
    return { format: 'stl-binary', label: 'STL (binary)', confidence: bytes.length === 84 + n * 50 ? 'high' : 'medium', support: { open: 'unsupported', import: 'planned', export: 'planned' }, carries: ['tessellated geometry only'], message: 'STL is a triangle mesh without units or exact geometry. Mesh import/export is planned.' }
  }
  if (/^(#.*\n|\s*\n)*\s*(v|vn|vt|o|g|mtllib)\s/m.test(head) && ext === 'obj') return { format: 'obj', label: 'Wavefront OBJ', confidence: 'medium', support: { open: 'unsupported', import: 'planned', export: 'planned' }, carries: ['tessellated geometry', 'materials (MTL)'], message: 'OBJ is a mesh format; import/export is planned.' }
  if (/^\*\*ABS|^\*\*\s*PARASOLID|^\*\*PART1/.test(head) || ext === 'x_t' || ext === 'x_b') return { format: 'parasolid', label: 'Parasolid XT', confidence: 'low', support: { open: 'requires-approval', import: 'requires-approval', export: 'requires-approval' }, carries: ['exact B-rep'], message: 'Parasolid XT needs a licensed translator (approval required). Export STEP AP242 instead.' }
  if (ext === 'sat' || ext === 'sab') return { format: 'acis', label: 'ACIS SAT/SAB', confidence: 'low', support: { open: 'requires-approval', import: 'requires-approval', export: 'requires-approval' }, carries: ['exact B-rep'], message: 'ACIS needs a licensed translator (approval required). Export STEP AP242 instead.' }
  if (ext === 'jt') return { format: 'jt', label: 'JT (ISO 14306)', confidence: 'low', support: { open: 'requires-approval', import: 'requires-approval', export: 'requires-approval' }, carries: ['tessellated LODs', 'optional exact B-rep', 'product structure', 'PMI'], message: 'JT needs a licensed toolkit (approval required). Export STEP AP242 instead.' }
  if (ext === '3dm') return { format: '3dm', label: 'Rhino 3DM', confidence: 'low', support: { open: 'unsupported', import: 'planned', export: 'planned' }, carries: ['NURBS surfaces and solids', 'meshes', 'layers'], message: 'Rhino 3DM support via openNURBS/rhino3dm (MIT) is planned for Phase 5. Export STEP from Rhino for now.' }
  if (/^V5_CFV2/.test(head) || ['catpart', 'catproduct'].includes(ext)) return { format: 'catia', label: 'CATIA V5 native', confidence: /^V5_CFV2/.test(head) ? 'medium' : 'low', support: { open: 'requires-approval', import: 'requires-approval', export: 'unsupported' }, carries: ['proprietary B-rep and feature history'], message: NATIVE_MESSAGE('CATIA') }
  if (ext === 'prt' || /^#UGC:/.test(head)) return { format: 'prt', label: 'Siemens NX or PTC Creo part (.prt)', confidence: 'low', support: { open: 'requires-approval', import: 'requires-approval', export: 'unsupported' }, carries: ['proprietary B-rep and feature history'], message: NATIVE_MESSAGE('NX or Creo') }
  if (ext === 'f3d' || ext === 'f3z') return { format: 'fusion', label: 'Autodesk Fusion archive', confidence: 'low', support: { open: 'requires-approval', import: 'requires-approval', export: 'unsupported' }, carries: ['proprietary'], message: NATIVE_MESSAGE('Autodesk Fusion') }
  return { format: 'unknown', label: 'Unknown format', confidence: 'low', support: { open: 'unsupported', import: 'unsupported', export: 'unsupported' }, carries: [], message: 'The file format was not recognised. Supported now: ews-cad (native). STEP AP242 is the recommended exchange format.' }
}
