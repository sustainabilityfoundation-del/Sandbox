/**
 * @ews/sysml-core: the SysML Modeler semantic core (framework-free; runs in Node and the browser).
 *
 * - Metamodel registry (KerML/SysML v2 metaclasses, subset): metamodel/metaclasses
 * - Element store with reverse references: model/model; Systems Modeling API JSON: model/json
 * - Textual notation: parse / build / serialize (documented subset): syntax/*
 * - Derived semantics and name resolution: semantics/semantics
 * - Platform model library subset (and loader for other libraries): library/*
 * - Validation rules: validation/validate; units and expression evaluation: units/*
 * - Typed commands, transactions, change sets, identity-preserving text application: commands/*
 * - Queries and impact analysis: query/query
 *
 * Not SysML v2 conformant: see docs/modules/sysml/conformance.md for the supported subset.
 */
export * from './metamodel/metaclasses'
export { Model, refId, refIds, crossReferences, STRUCTURAL_REFS, type Element } from './model/model'
export { newId, uuidV5, UUID_PATTERN } from './model/ids'
export { remapElement } from './model/remap'
export { toJson, fromJson, modelToJson, type JsonElement } from './model/json'
export { parse, parseExpression, DEFINITION_KEYWORDS, USAGE_KEYWORDS, UNSUPPORTED_KEYWORDS, type ParseResult, type SyntaxDiagnostic } from './syntax/parser'
export { tokenize, KEYWORDS, type Range, type Position, type Token } from './syntax/lexer'
export { Builder, patch } from './syntax/build'
export { serialize, serializeElement, serializeExpression, usageKeyword, definitionKeyword } from './syntax/serializer'
export { loadText, type LoadTextResult } from './syntax/text'
export type * as Ast from './syntax/ast'
export { Semantics, semanticsOf, quote, type Resolved } from './semantics/semantics'
export { loadLibrary, platformLibrary, platformLibraryDiagnostics, emptyModel, type LibraryLoadResult } from './library/library'
export { LIBRARY_SOURCES } from './library/text'
export { validate, expectedTypeKinds, RULES, type RuleInfo } from './validation/validate'
export { diagnosticKey, type Diagnostic, type Severity } from './validation/diagnostic'
export * from './units/units'
export { evaluate, featureValue, formatValue, quantityDimension, type Value } from './units/evaluate'
export { executeCommand, resolveRef, splitQualifiedName, removeSubtree, isBodyRelationship, isTextEditableNamespace, CommandError, CREATABLE_KINDS, CONNECT_KINDS, METADATA_KINDS, type Command, type CommandContext, type CreatableKind, type ConnectKind } from './commands/commands'
export { applyTransaction, affectedElements, diagnosticsDelta, type TransactionInput, type TransactionResult, type ValidationPolicy, type DiagnosticsDelta } from './commands/transaction'
export { diffModels, applyChanges, invertChanges, summarizeChanges, describeSummary, type ElementChange, type ChangeSummaryItem } from './commands/changes'
export { COMMAND_SCHEMAS, checkCommandShape, type CommandSchema } from './commands/schemas'
export { structuralKeys, preserveIdentity } from './commands/reconcile'
export { findElements, summarize, incomingReferences, impact, children, type ElementQuery, type ElementSummary, type IncomingReference, type ChildSummary } from './query/query'
export { canonicalForm } from './conformance/canonical'
export { ACTUATOR_EXAMPLE, ACTUATOR_EXAMPLE_NAME } from './examples/actuator'
