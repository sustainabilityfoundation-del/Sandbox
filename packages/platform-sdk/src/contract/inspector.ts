/**
 * Inspector subject (SDK 1.16): what a tool shows in the workspace Inspector for a record that is not an
 * engineering object of the shared model (a Concept, a design constraint, an alternative set). Data only: the
 * platform renders it with design-system components, so a tool cannot restyle the Inspector.
 */

export type InspectorTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface InspectorSubject {
  /** Stable record ID (the canonical ID; never shown to people). */
  id: string
  /** Human key shown to people, for example 'CST-001'. */
  key: string
  /** Record kind in words, for example 'Constraint'. */
  kind: string
  title: string
  badges?: { label: string; tone?: InspectorTone }[]
  sections: { title: string; fields: { label: string; value: string }[] }[]
}
