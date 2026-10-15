/**
 * @ews/cad-kernel (ADR-0021): browser-safe entry point. The Node in-process kernel is in
 * '@ews/cad-kernel/node'; the Web Worker client in '@ews/cad-kernel/worker-client'.
 */
export { inspectStep, type StepInspection } from './step'
export { detectFormat, type DetectedFormat, type FormatSupport } from './detect'
export { OCCT_KERNEL_INFO } from './occt/info'
