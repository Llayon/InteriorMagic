# Planning intent integration v1

Status: superseded by the versioned Planning Contract v2 intent transport; this
document remains historical context.

## Authority boundaries

The browser owns the live `RoomProject`, disposable `PlanningScene` derivation,
Track B validation, deterministic planning, read-only Preview, atomic Apply and
editor history. The server owns only the Groq credential and Qwen request
packaging. The LLM may choose the supported activity, one supplied opaque focal
ID and the order of supported relative priorities.

The LLM never receives or controls room geometry, coordinates, dimensions,
footprints, collision data, candidate transforms, numeric weights, proposals,
history or Apply. Browser-to-server data is limited to trimmed user text and
bounded focal descriptors (`id`, `kind`, optional `label`).

HTTP/transport success is not semantic intent success. `{ ok: true, output }`
only means the Groq transport completed. The output remains untrusted, and Track
B alone classifies success, unsupported intent, ambiguous focal, invalid model
output, unknown focal ID or provider error. No provider or client repair is
allowed.

## Provider and deployment

The server adapter uses Groq `qwen/qwen3.6-27b`, JSON object mode, no reasoning,
temperature `0.2`, 200 completion tokens and no streaming. `GROQ_API_KEY` is a
Worker secret; the browser receives only the non-secret endpoint URL.

The Worker has no route, workers.dev URL or preview URL and is not deployed by
CI. Browser CORS is restricted to the exact non-secret `ALLOWED_ORIGIN` value;
foreign origins and unqualified preflight requests fail closed. CORS is
transport plumbing, not authentication. The Worker must remain off the public
internet until an authoritative abuse/authentication boundary exists.

Worker observability is disabled by default, and application code does not log
user text or provider output. Operational telemetry may only be enabled later
with an explicit privacy-safe logging design.

The benchmark preserved boundary safety across 135 calls, while relative
priority order was correct in 28/40 cases (70%). Model output therefore remains
advisory intent. Deterministic planning, mandatory Preview and explicit user
Apply remain the safety boundary.
