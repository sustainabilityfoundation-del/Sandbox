import type { SettingDefinition, SettingValue } from '@ews/platform-sdk'
import { pair } from '../settingsPair'

/**
 * Settings of the orchestrator (docs/modules/ai-interface/orchestration.md): `ai.routing.mode`, one
 * `ai.routing.providers.<provider>` switch per commercial provider, and `ai.context.mode` (ECII Amendment 2). All have project
 * ceilings through `pair()`: a person can only narrow what an administrator allows.
 */

export type RoutingMode = 'economy' | 'balanced' | 'quality' | 'manual'
export type RoutingDefault = Exclude<RoutingMode, 'manual'>
export type ContextMode = 'off' | 'digest' | 'full'

/** Ordered from narrowest to widest, as the ceiling comparison requires: Economy spends least, Manual leaves the choice to the person. */
export const ROUTING_MODES: { value: RoutingMode; label: string; description: string }[] = [
  { value: 'economy', label: 'Automatic: Economy', description: 'The cheapest model that handles tool calls reliably.' },
  { value: 'balanced', label: 'Automatic: Balanced', description: 'The cheapest model rated for engineering work (tier 2 or higher).' },
  { value: 'quality', label: 'Automatic: Maximum quality', description: 'The highest rated model available.' },
  { value: 'manual', label: 'Manual', description: 'You choose the provider and model. Required for a ChatGPT plan connection.' },
]

/** Providers the routing settings know (adapters are added per provider; a provider without an adapter is never called). */
export const ROUTING_PROVIDERS: { id: string; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'xai', label: 'xAI' },
]

export const CONTEXT_MODES: { value: ContextMode; label: string; description: string }[] = [
  { value: 'off', label: 'Off', description: 'No platform context is added to model requests.' },
  { value: 'digest', label: 'Digest', description: 'A short standing digest of the project context is added.' },
  { value: 'full', label: 'Full', description: 'The digest and targeted retrieval are added.' },
]

export const routingModeSettingId = 'ai.routing.mode'
export const routingProviderSettingId = (provider: string) => `ai.routing.providers.${provider}`
export const CONTEXT_MODE_SETTING_ID = 'ai.context.mode'

export function ROUTING_AND_CONTEXT_DEFINITIONS(routingDefault: RoutingDefault = 'balanced'): SettingDefinition[] {
  return [
    ...pair({
      id: routingModeSettingId,
      ceilingId: 'ai.routing-ceiling.mode',
      label: 'Model selection',
      description: 'How the assistant picks the model: automatically (Economy, Balanced, Maximum quality) or Manual.',
      helpId: 'ai.policy',
      type: 'enum',
      options: ROUTING_MODES,
      default: routingDefault,
      ceilingDefault: 'manual',
      group: 'Model selection',
    }),
    ...ROUTING_PROVIDERS.flatMap((p) =>
      pair({
        id: routingProviderSettingId(p.id),
        ceilingId: `ai.routing-ceiling.providers.${p.id}`,
        label: `Use ${p.label}`,
        description: `Allow requests to go to ${p.label} models.`,
        helpId: 'ai.policy',
        type: 'boolean',
        default: true,
        ceilingDefault: true,
        group: 'Model selection',
      }),
    ),
    ...pair({
      id: CONTEXT_MODE_SETTING_ID,
      ceilingId: 'ai.context-ceiling.mode',
      label: 'Platform context',
      description: 'How much project context is added to model requests. The context assembler is a later increment; today this setting only records the choice.',
      helpId: 'ai.policy',
      type: 'enum',
      options: CONTEXT_MODES,
      default: 'off',
      ceilingDefault: 'full',
      group: 'Model selection',
    }),
  ]
}

export interface RoutingSettings {
  mode: RoutingMode
  /** Providers switched off by the person or the project (a provider with no switch counts as allowed). */
  disallowedProviders: ReadonlySet<string>
  contextMode: ContextMode
}

/** Reads the routing settings from effective setting values (already clamped to the project ceilings). */
export function routingFromSettings(values: Record<string, SettingValue>, fallback: RoutingDefault = 'balanced'): RoutingSettings {
  const rawMode = values[routingModeSettingId]
  const mode: RoutingMode = ROUTING_MODES.some((m) => m.value === rawMode) ? (rawMode as RoutingMode) : fallback
  const disallowed = new Set<string>()
  for (const p of ROUTING_PROVIDERS) if (values[routingProviderSettingId(p.id)] === false) disallowed.add(p.id)
  const rawContext = values[CONTEXT_MODE_SETTING_ID]
  const contextMode: ContextMode = CONTEXT_MODES.some((m) => m.value === rawContext) ? (rawContext as ContextMode) : 'off'
  return { mode, disallowedProviders: disallowed, contextMode }
}
