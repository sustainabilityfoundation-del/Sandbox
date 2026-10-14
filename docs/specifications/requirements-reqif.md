# ReqIF support and interoperability report

Maintained by the Requirements agent. Implementation: `packages/reqif` (`@ews/reqif`: reading,
writing, XHTML sanitising, `.reqifz`, schema validation) and `services/requirements/src/exchange`
(import preview/apply, export). Tests: `packages/reqif/src/*.test.ts`, `services/api/test/exchange.test.ts`.

## 1. Version and basis

- **OMG ReqIF 1.2** (formal/16-07-01, read in full). Namespace
  `http://www.omg.org/spec/ReqIF/20110401/reqif.xsd`, shared by ReqIF 1.0.1, 1.1 and 1.2; files are
  written with `REQ-IF-VERSION` `1.0`, the value the schema fixes.
- **Schemas**: OMG `reqif.xsd` (dtc/11-04-05) and `driver.xsd` (dtc/11-04-06) plus the W3C XHTML
  Modularization 1.1 modules and `xml.xsd` they import. They are downloaded by
  `npm run req:reqif:schemas` into `.data/reqif-schemas` and pinned by SHA-256 in
  `packages/reqif/schemas.lock.json`. They are **not committed**: the OMG specification licence
  forbids reposting. Validation uses libxml2 (xmllint-wasm). When the schemas are absent, previews
  and export reports say "not performed"; nothing claims validity.
- **Packaging** `.reqifz`: a ZIP with one or more `.reqif` files and the files their XHTML
  `object` elements reference. This is a tool convention (ProSTEP iViP implementation guide), not
  part of the OMG specification; the guide itself was not accessible (see research note). We import
  the first `.reqif` in the archive and say so if there are more.
- **No compliance claim.** The implementation is *based on* ReqIF 1.2.

## 2. Coverage

| Structure | Read | Written | Mapped to the module |
| --- | --- | --- | --- |
| Header (IDENTIFIER, COMMENT, CREATION-TIME, REPOSITORY-ID, tool IDs, TITLE) | ✓ | ✓ | Source key (REPOSITORY-ID, else tool + title, or a key entered by the user) |
| Datatypes: BOOLEAN, DATE, ENUMERATION (+ ENUM-VALUE with EMBEDDED-VALUE), INTEGER, REAL, STRING, XHTML | ✓ | ✓ | Custom attribute types (administrators import new definitions; otherwise values are preserved) |
| SPEC-OBJECT-TYPE, SPEC-RELATION-TYPE, SPECIFICATION-TYPE, RELATION-GROUP-TYPE with attribute definitions (incl. DEFAULT-VALUE, MULTI-VALUED, IS-EDITABLE) | ✓ | ✓ | Field roles by LONG-NAME (below) or custom attributes |
| SPEC-OBJECT with typed values | ✓ | ✓ | Requirement, or collection heading (chapter name without text) |
| SPECIFICATION with ordered SPEC-HIERARCHY | ✓ | ✓ | Collection with ordered nodes; nesting is structure only |
| SPEC-RELATION | ✓ | ✓ | `derives-from`, `decomposes`, `depends-on` when the type name says so; others reported unsupported |
| RELATION-GROUP | ✓ | preserved | Not a module concept; preserved and reported |
| XHTML values (THE-VALUE, THE-ORIGINAL-VALUE, IS-SIMPLIFIED) | ✓ | ✓ | Sanitised rich statement + plain text; original kept |
| ALTERNATIVE-ID | ✓ | ✓ | Kept in the model |
| LAST-CHANGE | ✓ | ✓ (revision timestamp) | Used for change and conflict detection |
| REQ-IF-TOOL-EXTENSION | preserved | re-emitted to the same source | Not interpreted |

Field roles by attribute LONG-NAME (case-insensitive): statement — `ReqIF.Text`, `Object Text`,
`Text`, `Description`; title — `ReqIF.Name`, `Name`, `Title`; heading — `ReqIF.ChapterName`,
`Object Heading`; plus `Rationale`, `Source`, `Acceptance criteria`; foreign ID — `ReqIF.ForeignID`,
`Absolute Number`. Everything else becomes a custom attribute (`reqif-<name>`) or is preserved.

## 3. Import (preview, then apply)

- **Security**: DOCTYPE and entity declarations are refused (no XXE, no entity expansion); no
  external resolution; size limits (100 MB XML, 512 MB expanded archive, 10 000 entries); archive
  paths must be relative, without `..`, drive letters or URL schemes; object references resolve only
  inside the package. XHTML is sanitised to an allow-list of the ReqIF XHTML modules (scripts,
  styles, event handlers, forms, non-http(s) links removed and reported); the UI renders it again
  through its own allow-list as React elements. Attachments are stored through the object-storage
  abstraction with provenance (import job, archive path) and served with `nosniff`, images inline
  only for PNG/JPEG/GIF/WebP.
- **Preview** classifies every record as new, changed, unchanged, conflicting or unsupported, with
  field changes, attribute and relation mappings, findings (structure, dangling references,
  duplicate identifiers, values that do not match their datatype, sanitising), schema validation
  and the policies below. Nothing is written except the import job.
- **Identity**: mappings are keyed by **(exchange source, ReqIF IDENTIFIER)**, never by title or by
  canonical UUID. The same identifiers from another source create separate records. Files exported
  by this project (`REPOSITORY-ID ews:<project>`) are matched by canonical ID.
- **Conflicts**: changed here and in the source → conflicting (default: keep local); changed only
  here → unchanged (local kept); file older than the last import → conflicting with a note.
- **Apply** is one transaction with per-record decisions (take incoming, keep local, skip). If
  anything changed since the preview the whole apply is refused (409).
- **No deletion on absence**: absent records are counted and left unchanged; collections only
  gain new items.
- Imported requirements start as **draft**; lifecycle, reviews and verification are not taken from
  files (ReqIF has no equivalent semantics).

## 4. Export

- Scope: selected requirements, collections, a configuration (applicability filter) or a
  requirements baseline (pinned revisions, relationships and structure).
- Our types: `ReqIF.ForeignID` (key), `ReqIF.Name`, `ReqIF.Text` (XHTML), `Rationale`, `Source`,
  `Acceptance criteria`, custom attributes with their datatypes, headings via `ReqIF.ChapterName`,
  relation types `derives-from (EWS)`, `decomposes (EWS)`, `depends-on (EWS)` with their meaning in
  DESC. Identifiers are `_<uuid>` (stable across exports).
- **Lossy mappings are reported** in the export job: lifecycle status, allocation to twin
  components, canonical ID, revision and verification methods are written only as *informative*
  string attributes (`EWS.*`); reviews, comments, history and baselines are not part of ReqIF;
  relationships leaving the selection are dropped.
- Re-export to a known source reuses that source's identifiers, types and preserved values, so the
  receiving tool can update its objects.
- Every ReqIF export is validated against the official schemas when installed (`report.schemaValidation`).

## 5. Interoperability actually tested

Externally produced files: the test corpus of **strictdoc-project/reqif** (Apache-2.0 repository) at
commit `b36694051d6b`, downloaded by `npm run req:reqif:samples` and **not redistributed** here. The
corpus collects files exported by the tools named in their headers; we did not produce them and
cannot verify their history beyond that.

Two levels were run on all 24 files (14 Oct 2026):

1. `packages/reqif/src/corpus.test.ts`: read → write → read; the semantic summary (objects, values,
   enumeration selections, relations, hierarchy, datatypes) is identical; schema validation of the
   original and of our re-written file.
2. `services/api/test/exchange.test.ts` ("external ReqIF files through the import API"): preview,
   apply, re-import of the same file → no new and no changed records.

| File (corpus path) | Source tool (header) | Objects / relations | Original schema-valid | Import via API | Re-import |
| --- | --- | --- | --- | --- | --- |
| ci.eclipse.org/TC1000…TC1801 (8 files) | Eclipse RMF (ReqIF Implementor Forum reference test cases) | 1–44 / 0–1 | yes | applied | no duplicates |
| Doors/01 (date datatype) | "dummy from doors" | 1 / 0 | yes | applied (dateTime without zone accepted) | no duplicates |
| Doors/02 (from a user) | IBM Rational DOORS | 3 / 0 | yes | applied (3 headings) | no duplicates |
| Doors/03 (from a user) | (header missing) | 1 / 0 | no (no THE-HEADER) | **refused** with an explicit finding | — |
| Doors/04–06 (from users) | IBM | 1 / 0 | yes, but types are not in the file | applied; dangling type references reported as warnings, values preserved | no duplicates |
| Doors/10 (Capella requirements VP) | IBM Rational DOORS | 1 / 0 | yes | applied | no duplicates |
| Polarion/01 (anonymised) | "Ppp ReqIF Roundtrip" (Polarion) | 101 / 0 | no (DATE values "aaa") | applied; invalid date values preserved and reported | no duplicates |
| examples/sample1_polarion, sample_polarion_reqifz | Polarion ReqIF Roundtrip | 2 / 0 | no (duplicate SPEC-HIERARCHY IDs) | applied; duplicate reported as warning | no duplicates |
| ReqIF_Studio/01 (anonymised) | ReqIF Studio | 137 / 14 | yes | applied; 14 relations of a type without an equivalent reported unsupported | no duplicates |
| SparxSystems EA 8.0 | microTool in-Step / Enterprise Architect 8.0 | 3 / 1 | yes | applied; references to objects missing from the file reported | no duplicates |
| org.eclipse.rmf/01, 02 (manually written) | "Manually written" | 2 / 0–1 | no (pre-standard namespace 20101201) | **refused** (values without definitions) with explicit findings | — |
| examples/sample2_sdoc | strictdoc | 18 / 0 | no (missing LAST-CHANGE, MAX-LENGTH) | applied | no duplicates |
| examples/sample3_eclipse_rmf | Eclipse RMF | 6 / 0 | yes | applied | no duplicates |

Whenever the original file was schema-valid, our re-written file was schema-valid too.

**Not tested**: any exchange *into* DOORS, DOORS Next, Polarion, Jama Connect, Codebeamer or ReqIF
Studio (no access to these tools); round trips through those tools; Jama and Codebeamer exports
(no samples available); `.reqifz` files with real embedded OLE/images from a tool (only a synthetic
archive and a Polarion archive without attachments). Interoperability with those tools is therefore
**not established**; the evidence is limited to reading their exported files.

## 6. Commands

```bash
npm run req:reqif:schemas      # download and pin the official schemas (.data/reqif-schemas)
npm run req:reqif:samples      # download the external sample corpus (.data/reqif-samples)
npx vitest run packages/reqif  # parser, writer, sanitiser, archive, schema and corpus tests
npm run req:test:db            # includes import/export through the API on real PostgreSQL
```
