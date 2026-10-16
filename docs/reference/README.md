# Generated service API references

Run `npm run docs:api` after installing the repository's locked dependencies.
The generator reads OpenAPI from the in-process API host using Fastify injection;
it never opens an HTTP listener. This fallback is necessary because Visualization's
route list is private to its plugin. All references therefore use the real hosted
OpenAPI documents rather than copied operation definitions.

The temporary embedded PostgreSQL database is migrated without seed data and
removed afterward. No external database, API credentials or AI accounts are used.
Provider and image adapter registries are empty and fetch calls are refused.
PostgreSQL binaries must already be available through the installed dependencies.

Expected pages: requirements.md, concepts.md, sysml.md, cad.md, projects.md,
settings.md, assistant.md and visualization.md. Service registrations are read from
the host; an unknown base-path export fails generation instead of silently skipping
it. Generation fails on missing documents or empty operation lists.

Pages group operations by tag and list method, path, operationId, summary,
request body schema and response schema names by status/media type. Unnamed inline
schemas are identified as inline, not assigned invented component names. Output
is sorted and has no dates or runtime identifiers. Do not edit generated pages.

To check determinism, generate once, capture checksums of the generated Markdown,
then generate again and compare checksums. Existing tracked output should also
show no diff after regeneration without API changes.

Initial generated pages are pending: dependency installation was blocked by the
execution environment's external-services approval review. This branch must not
be treated as acceptance-complete until generation and `npm run check` succeed.
