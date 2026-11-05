# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.x (latest) | Yes |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/mariomsamy/omada-mcp/security) of this repository.
2. Click **"Report a vulnerability"**.
3. Describe the issue, steps to reproduce, and potential impact.

You will receive an acknowledgement within **72 hours** and a resolution timeline within **7 days**.

## Scope

**In scope:**
- Credential exposure or leakage through MCP tool responses, logs, or error messages
- Capability profile bypass (accessing tools outside the configured profile)
- Authentication weaknesses in the OAuth2 client credentials flow
- DNS rebinding or origin validation bypasses in HTTP transport mode
- Container image vulnerabilities in the published Docker image
- Dependency vulnerabilities with a known exploit path

**Out of scope:**
- Vulnerabilities in the TP-Link Omada controller itself
- Issues requiring physical access to the network
- Social engineering attacks
- Issues in the HTTP transport that require `MCP_UNSAFE_ENABLE_HTTP=true` — HTTP mode is explicitly documented as unsafe and lab-only

## Security Design

This server is designed with a defense-in-depth approach:

- **stdio-first**: The production baseline uses stdio, which does not expose any network surface.
- **Credentials via environment only**: No credentials are accepted as tool arguments.
- **Capability gating**: Tools are segmented into categories (e.g., `clients`, `firewall-acl`) with read/write permission levels. The default profile (`safe-read`) exposes only read-only tools.
- **No secrets in logs**: Credential values are masked before logging.
- **Loopback-only HTTP**: When HTTP mode is explicitly enabled, the server binds to loopback addresses only.

See [docs/security-model.md](./docs/security-model.md) for the full security design.

## Dependency audit status (1.0.0)

Version 1.0.0 migrates the runtime to `zod@4.6.7`, which fixes [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (memory exhaustion while validating oversized constrained collections). `npm audit --omit=dev` reports 0 vulnerabilities, and CI and the publish workflow now fail on any high or critical production advisory (`npm audit --omit=dev --audit-level=high`).

The full development audit still reports five high-severity entries, all from copies of `zod@3` inside the optional MCP Inspector dependency tree (`@modelcontextprotocol/inspector*`, `@mcp-ui/client`). Inspector is a development-only tool and is excluded from production installs and the container image. Its upgrade is tracked separately.

Payload size (64 KB) and depth (8) caps and the 1 MB HTTP body cap remain in place as defence in depth.
