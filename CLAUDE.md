# CLAUDE.md: contributor guide for AI coding agents

omada-mcp is a TypeScript (ESM, Node 24) MCP server for TP-Link
Omada controllers, using only the official Open API. Safety is the
product: read-only by default, dry-run by default, no raw API access.
Read [CODEBASE.md](CODEBASE.md) and [CONTRIBUTING.md](CONTRIBUTING.md)
before larger changes.

## Commands

Run all of these **inside a container** (the devcontainer in
`.devcontainer/`, or a throwaway `node:24-bookworm-slim` container with
the repo mounted). Do not run tests, builds or `npm install` on the host.

```bash
npm ci --ignore-scripts
npm run check                        # Biome lint + tsc --noEmit
npm run build                        # tsc -> dist/
npm run test:coverage                # Vitest with per-file thresholds (use this, not `npm test`)
node scripts/check-tool-tests.mjs    # every src/tools/<name>.ts has tests/tools/<name>.test.ts
node scripts/check-readme-sync.mjs   # every registered tool has a README row (run after build)
```

Example one-off container run:

```bash
docker run --rm -v "$PWD":/src:ro node:24-bookworm-slim \
  sh -c 'cp -r /src /work && cd /work && npm ci --ignore-scripts && npm run check && npm run test:coverage'
```

Never point tests or the inspector at a production controller. Tests use
mocks and stubs only.

## Layout

- `src/tools/<toolName>.ts`: **one file per tool**, registered in
  `src/tools/index.ts` (`TOOL_REGISTRY` entry with category and
  permission).
- `tests/tools/<toolName>.test.ts`: **1:1 test file per tool**, enforced
  by `scripts/check-tool-tests.mjs`.
- `src/omadaClient/`: HTTP client per API area. `src/config.ts`: the
  only place that reads `process.env`.
- `src/server/`: catalog, common wrappers (`wrapToolHandler`,
  `wrapMutationToolHandler`), transports.
- `docs/openapi/*.json`: the bundled Omada Open API spec, the only
  source of truth for routes.
- `skills/`: agent skills (Markdown only). `docs/`: user docs.

## Rules for new or changed tools

1. **Spec first.** The verb, path and body must match an operation in
   `docs/openapi/`. Never infer or guess a route.
2. **Never add a raw or generic API tool** (any method/any path,
   operation-ID dispatch to arbitrary endpoints, the private `/api/v2`
   web API, cookie/CSRF login, or header-supplied credentials).
3. **Writes are dry-run by default:** `dryRun: z.boolean().default(true)`
   (or `.optional().default(true)`), use `wrapMutationToolHandler`,
   return before any mutating client call when `dryRun` is true, read
   current state for the preview, and read back after apply where the
   API allows it.
4. **Category and permission:** put the tool in the right category with
   `permission: 'write'` for any mutation. Destructive tools must not be
   reachable from `safe-read` or `ops-write` (see
   `tests/toolCategories.test.ts`). Restore-type operations belong in
   `recovery`.
5. **Validate inputs strictly:** use the shared schemas (`siteInputSchema`,
   MAC and resource-ID schemas, pagination helpers). Encode every path
   segment.
6. **Secrets:** never log or return credentials; rely on the shared
   redaction and add new secret field names to it when the spec has them.
7. **Docs:** add a row for the tool in **both** `README.md` and
   `README.Docker.md` (do not rename or remove existing rows). If a
   skill should use the tool, update the skill and keep tool names real.
8. **Tests:** registration, schema rejection, dry-run (no mutating call)
   and apply paths, plus error paths for admin writes. Coverage: 90 %
   per file, 70 % branches globally.

## Do not

- Commit, push, publish or deploy without the maintainer asking.
- Put real controller URLs, IDs or credentials in code, tests, docs or
  examples. Use placeholders.
- Weaken a default (read-only profile, `dryRun: true`, strict TLS,
  loopback-only HTTP) to make something easier.
