/**
 * Validator for the JSON Schema subset used by command inputs (draft 2020-12 keywords: type,
 * properties, required, additionalProperties, enum, const, items, minItems, maxItems, minimum,
 * maximum, exclusiveMinimum, exclusiveMaximum, minLength, maxLength, pattern, oneOf, anyOf).
 * The schemas themselves are published unchanged in the command catalogue.
 */

export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null' | ('object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null')[]
  description?: string
  title?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean
  enum?: readonly unknown[]
  const?: unknown
  items?: JsonSchema
  minItems?: number
  maxItems?: number
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  oneOf?: JsonSchema[]
  anyOf?: JsonSchema[]
  default?: unknown
  examples?: unknown[]
}

const typeOf = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' && Number.isInteger(v) ? 'integer' : typeof v)

function matchesType(t: string, v: unknown): boolean {
  const actual = typeOf(v)
  return t === actual || (t === 'number' && actual === 'integer')
}

/** Returns problems as "path: message" strings (empty when valid). */
export function validateSchema(schema: JsonSchema, value: unknown, path = 'input'): string[] {
  const errors: string[] = []
  if (schema.oneOf) {
    const ok = schema.oneOf.filter((s) => validateSchema(s, value, path).length === 0).length
    if (ok !== 1) errors.push(`${path}: must match exactly one allowed form${ok > 1 ? ' (matches several)' : ''}`)
    return errors
  }
  if (schema.anyOf) {
    if (!schema.anyOf.some((s) => validateSchema(s, value, path).length === 0)) errors.push(`${path}: does not match any allowed form`)
    return errors
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((t) => matchesType(t, value))) {
      errors.push(`${path}: must be ${types.join(' or ')}`)
      return errors
    }
  }
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path}: must be ${JSON.stringify(schema.const)}`)
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(`${path}: must be a finite number`)
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: must be ≥ ${schema.minimum}`)
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: must be ≤ ${schema.maximum}`)
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(`${path}: must be > ${schema.exclusiveMinimum}`)
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) errors.push(`${path}: must be < ${schema.exclusiveMaximum}`)
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: must have at least ${schema.minLength} character(s)`)
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: must have at most ${schema.maxLength} characters`)
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match ${schema.pattern}`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: needs at least ${schema.minItems} item(s)`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: allows at most ${schema.maxItems} item(s)`)
    if (schema.items) value.forEach((v, i) => errors.push(...validateSchema(schema.items!, v, `${path}[${i}]`)))
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    for (const key of schema.required ?? []) if (obj[key] === undefined) errors.push(`${path}.${key}: is required`)
    for (const [key, v] of Object.entries(obj)) {
      const prop = schema.properties?.[key]
      if (prop) {
        if (v !== undefined) errors.push(...validateSchema(prop, v, `${path}.${key}`))
      } else if (schema.additionalProperties === false) errors.push(`${path}.${key}: is not an allowed field`)
    }
  }
  return errors
}
