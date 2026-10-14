/**
 * @ews/reqif: ReqIF 1.2 reading, writing and packaging (OMG formal/16-07-01). No React, no
 * database, no @ews dependencies. Schema validation (Node only) is in '@ews/reqif/schema-validation'.
 *
 * Supported: header; all seven datatypes incl. enumeration values; spec object, relation,
 * specification and relation group types with typed attribute definitions (incl. defaults,
 * multi-valued enumerations); spec objects, relations and specifications with ordered hierarchy;
 * relation groups; XHTML values (sanitised, with the original kept); ALTERNATIVE-ID; LAST-CHANGE;
 * tool extensions (preserved, not interpreted); .reqifz archives with constrained paths.
 */
export * from './model'
export { readReqIF, type ReadOptions, type ReadResult } from './read'
export { writeReqIF, toNcName } from './write'
export { sanitizeXhtmlChildren, sanitizeXhtmlString, toReqifXhtml, xhtmlValueFrom, type SanitizeResult } from './xhtml'
export { readReqifz, writeReqifz, safeArchivePath, resolveReference, ArchiveError, LIMITS as ARCHIVE_LIMITS, type ReqifzContents } from './archive'
export { ReqIFParseError, parseXmlSecurely, decodeXml, MAX_XML_BYTES } from './xml'
