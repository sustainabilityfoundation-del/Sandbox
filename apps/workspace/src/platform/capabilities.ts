/**
 * What the platform can do today, labelled honestly (architecture vision §11:
 * "The interface labels implemented, experimental and planned capabilities
 * honestly"). Planned domains are listed for orientation only; none of them is
 * available as a tool. Keep in step with docs/roadmap.md.
 */

export type CapabilityStatus = 'implemented' | 'experimental' | 'planned'

export interface Capability {
  name: string
  status: CapabilityStatus
  note: string
}

export const CAPABILITIES: Capability[] = [
  { name: 'Requirements management', status: 'implemented', note: 'PostgreSQL-backed API: collections, custom attributes, lifecycle and reviews, revisions and baselines, traceability matrix, quality checks, recorded verification.' },
  { name: 'ReqIF exchange', status: 'implemented', note: 'ReqIF 1.2 import with preview and export; tested with externally produced files, not yet with exchanges into commercial tools.' },
  { name: 'Conceptual design (Conceptualize)', status: 'implemented', note: 'Concepts independent of their implementations: decomposition, alternatives, trade studies with units, decisions with an approval gate, evidence, links to requirements, SysML and CAD. Estimates are labelled as such.' },
  { name: 'SysML v2 modelling (System Model)', status: 'experimental', note: 'Documented subset of the SysML v2 textual notation with a versioned repository, validation, general and interconnection views and requirement links; not a conformance claim (see the module conformance list).' },
  { name: 'Parametric part modelling (CAD)', status: 'experimental', note: 'Open CASCADE kernel in a Web Worker: constrained sketches, extrude, revolve, parameters, regeneration, stable face names, STEP AP242 export. Single parts; file save only; no fillets or assemblies yet.' },
  { name: 'Configuration and baselines', status: 'implemented', note: 'Revision history, baselines pinning exact revisions, comparison with the working model.' },
  { name: 'Traceability and change impact', status: 'implemented', note: 'Typed relationships with validated semantics; impact on linked objects, evidence and baselines.' },
  { name: 'Help and documentation', status: 'implemented', note: 'Help menu, Help Centre with search, F1, guided tutorials and an interactive API reference; Requirements, Conceptualize, System Model and CAD documented.' },
  { name: 'Verification records', status: 'implemented', note: 'Results pinned to the requirement revision and configured article; marked stale when inputs change.' },
  { name: 'Module ownership', status: 'implemented', note: 'Each artifact type is changed only by its owning module or a documented delegation.' },
  { name: 'Subscriptions and entitlements', status: 'experimental', note: 'Client-side mock; production enforcement must be server-side.' },
  { name: 'Design reasoning layer', status: 'planned', note: 'Architecture proposed (ADR-0039 to ADR-0046). The deterministic calculation engine (units, exact or enclosing bounds, reproducibility manifests) and a validation prototype exist as libraries; nothing is available in the interface yet.' },
  { name: 'AI assistant', status: 'experimental', note: 'Scripted demo by default. Connect your own OpenAI account (Settings → AI and reasoning: API key, or Sign in with ChatGPT when running locally) to answer with an OpenAI model through the same validated commands and previews; access policy enforced by the server.' },
  { name: 'Settings', status: 'implemented', note: 'Settings centre beside Help: Platform preferences and AI and reasoning; module pages from SDK 1.6 setting definitions, stored and validated by the settings service.' },
  { name: 'Mathematics and numerical computing', status: 'planned', note: 'Equations, scripts, notebooks, units and solvers.' },
  { name: 'Statistics and design exploration', status: 'planned', note: 'DOE, optimisation, uncertainty and sensitivity analysis.' },
  { name: 'Executable system and control modelling', status: 'planned', note: 'Block diagrams, state machines, simulation and co-simulation.' },
  { name: 'Electronics and programmable hardware', status: 'planned', note: 'Schematics, PCB, circuit simulation, FPGA/HDL.' },
  { name: 'Electrical systems and harnesses', status: 'planned', note: 'Wiring, connectors, harness routing and loads.' },
  { name: 'Engineering analysis', status: 'planned', note: 'Structural, thermal, fluid, electromagnetic and multibody analysis.' },
  { name: 'Safety and reliability', status: 'planned', note: 'FHA/HARA, FMEA/FMEDA, fault trees and reliability.' },
  { name: 'Cybersecurity engineering', status: 'planned', note: 'Threat analysis and risk assessment, security requirements.' },
  { name: 'Full verification and validation', status: 'planned', note: 'Plans, procedures, execution records, coverage and anomalies.' },
  { name: 'Software verification', status: 'planned', note: 'Static analysis, structural coverage, formal methods.' },
  { name: 'Real-time integration and test', status: 'planned', note: 'MIL/SIL/PIL/HIL workflows and bus analysis.' },
  { name: 'CAM and manufacturing engineering', status: 'planned', note: 'Toolpaths, process planning and manufacturing BOMs.' },
  { name: 'Inspection and quality', status: 'planned', note: 'Metrology, inspection plans, nonconformance.' },
  { name: 'Lifecycle, change and release management', status: 'planned', note: 'Change proposals, approvals and controlled release (baselines exist today).' },
  { name: 'Assurance and certification', status: 'planned', note: 'Objective sets, compliance matrices and evidence packages.' },
  { name: 'Project and technical management', status: 'planned', note: 'Tasks, risks, review gates and supplier deliverables.' },
  { name: 'Service and sustainment', status: 'planned', note: 'Maintainability, field failures and corrective action.' },
]
