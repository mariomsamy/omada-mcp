# Install for your AI agent

safe-omada-mcp is a local **stdio** MCP server. Your agent starts it as a
child process and passes the controller settings as environment
variables. All examples use placeholders: replace `<...>` with your own
values and never commit real credentials.

## 1. Create Open API credentials in Omada

1. Open the controller in a browser, switch to **Global View**.
2. Go to **Settings > Platform Integration > Open API** and choose
   **Add New App**.
3. Mode: **Client** (client credentials). Give it a clear name, for
   example `ai-agent-readonly`.
4. Role and scope: start with a **viewer** role limited to the sites the
   agent should see. Create a separate app with an administrator role
   only when you really need writes.
5. Save and copy the **Client ID**, **Client Secret** and the
   **Omada ID** (`omadacId`) shown on that page.

You will need:

| Variable | Value |
| --- | --- |
| `OMADA_BASE_URL` | Controller URL, for example `https://<controller-host>:8043` |
| `OMADA_CLIENT_ID` | Client ID from the Open API app |
| `OMADA_CLIENT_SECRET` | Client Secret from the Open API app |
| `OMADA_OMADAC_ID` | The controller's Omada ID |
| `OMADA_SITE_ID` | Optional default site (use the `listSites` tool to find IDs) |
| `OMADA_STRICT_SSL` | `true` (default). Keep it on |
| `OMADA_CA_FILE` | Optional path to a PEM CA bundle for a private CA |
| `OMADA_CAPABILITY_PROFILE` | `safe-read` (default), `ops-write` or `admin` |
| `OMADA_TOOL_CATEGORIES` | Optional explicit categories; replaces the profile defaults |

The full list is in `.env.example`.

### TLS: keep `OMADA_STRICT_SSL=true`

Controllers often use self-signed certificates. Do not switch
verification off. Instead export the controller's CA (or the
self-signed certificate) as PEM and point `OMADA_CA_FILE` at it; host
name checks stay on. Only in a throwaway lab should you set
`OMADA_STRICT_SSL=false`.

## 2. Pick a capability profile

| Profile | Registers | Use it for |
| --- | --- | --- |
| `safe-read` (default) | Read tools for dashboard, clients, client insights, devices, firewall | First install, monitoring |
| `safe-read` + `OMADA_TOOL_CATEGORIES=all:r` | Every read tool, no write tool | The read-only skills (audit, triage, troubleshooting) |
| `ops-write` | Reads above plus client actions and backups | Day-to-day operations |
| `admin` | All categories read and write, except recovery | Configuration changes, ideally time-boxed |
| explicit `recovery:rw` | Restore tools | Operator-only disaster recovery |

Start with `safe-read`. Even with write tools enabled, every write
previews by default (`dryRun: true`) and only applies when called again
with `dryRun: false`. Configure your agent to ask before running write
tools.

## 3. Build the server

```bash
git clone <this-repository-url> safe-omada-mcp
cd safe-omada-mcp
npm ci
npm run build          # produces dist/index.js
```

The examples below use `/absolute/path/to/safe-omada-mcp/dist/index.js`.
Node.js 24 or later is required. The Docker variant at the end needs no
local Node.js.

## 4. Configure your agent

### Claude Code

Command line (stored in your user or project config):

```bash
claude mcp add safe-omada --scope user \
  -e OMADA_BASE_URL=https://<controller-host>:8043 \
  -e OMADA_CLIENT_ID=<client-id> \
  -e OMADA_CLIENT_SECRET=<client-secret> \
  -e OMADA_OMADAC_ID=<omadac-id> \
  -e OMADA_STRICT_SSL=true \
  -e OMADA_CAPABILITY_PROFILE=safe-read \
  -- node /absolute/path/to/safe-omada-mcp/dist/index.js
```

Or a project `.mcp.json` that reads the secrets from your shell
environment (so the file holds no secrets and can be committed):

```json
{
  "mcpServers": {
    "safe-omada": {
      "command": "node",
      "args": ["/absolute/path/to/safe-omada-mcp/dist/index.js"],
      "env": {
        "OMADA_BASE_URL": "${OMADA_BASE_URL}",
        "OMADA_CLIENT_ID": "${OMADA_CLIENT_ID}",
        "OMADA_CLIENT_SECRET": "${OMADA_CLIENT_SECRET}",
        "OMADA_OMADAC_ID": "${OMADA_OMADAC_ID}",
        "OMADA_STRICT_SSL": "true",
        "OMADA_CAPABILITY_PROFILE": "safe-read",
        "OMADA_TOOL_CATEGORIES": "all:r"
      }
    }
  }
}
```

Skills: copy them to `~/.claude/skills/` (see [SKILLS.md](SKILLS.md)):

```bash
mkdir -p ~/.claude/skills && cp -R skills/omada-* ~/.claude/skills/
```

### Claude Desktop

Edit `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`,
Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "safe-omada": {
      "command": "node",
      "args": ["/absolute/path/to/safe-omada-mcp/dist/index.js"],
      "env": {
        "OMADA_BASE_URL": "https://<controller-host>:8043",
        "OMADA_CLIENT_ID": "<client-id>",
        "OMADA_CLIENT_SECRET": "<client-secret>",
        "OMADA_OMADAC_ID": "<omadac-id>",
        "OMADA_STRICT_SSL": "true",
        "OMADA_CAPABILITY_PROFILE": "safe-read"
      }
    }
  }
}
```

Restart Claude Desktop. Claude Desktop stores these values in plain
text: protect the file and prefer a read-only Open API app.

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.omada]
command = "node"
args = ["/absolute/path/to/safe-omada-mcp/dist/index.js"]

[mcp_servers.omada.env]
OMADA_BASE_URL = "https://<controller-host>:8043"
OMADA_CLIENT_ID = "<client-id>"
OMADA_CLIENT_SECRET = "<client-secret>"
OMADA_OMADAC_ID = "<omadac-id>"
OMADA_STRICT_SSL = "true"
OMADA_CAPABILITY_PROFILE = "safe-read"
```

Skills: Codex reads `AGENTS.md`. Copy the `SKILL.md` content you need
(without the YAML frontmatter) into your project's `AGENTS.md`, or link
to the skill files from it.

### Cursor

User-wide `~/.cursor/mcp.json` or per project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "safe-omada": {
      "command": "node",
      "args": ["/absolute/path/to/safe-omada-mcp/dist/index.js"],
      "env": {
        "OMADA_BASE_URL": "https://<controller-host>:8043",
        "OMADA_CLIENT_ID": "<client-id>",
        "OMADA_CLIENT_SECRET": "<client-secret>",
        "OMADA_OMADAC_ID": "<omadac-id>",
        "OMADA_STRICT_SSL": "true",
        "OMADA_CAPABILITY_PROFILE": "safe-read"
      }
    }
  }
}
```

Skills: save each `SKILL.md` as a rule in `.cursor/rules/`
(for example `.cursor/rules/omada-safe-change.mdc`).

### Gemini CLI

`~/.gemini/settings.json` (user) or `.gemini/settings.json` (project):

```json
{
  "mcpServers": {
    "safe-omada": {
      "command": "node",
      "args": ["/absolute/path/to/safe-omada-mcp/dist/index.js"],
      "env": {
        "OMADA_BASE_URL": "$OMADA_BASE_URL",
        "OMADA_CLIENT_ID": "$OMADA_CLIENT_ID",
        "OMADA_CLIENT_SECRET": "$OMADA_CLIENT_SECRET",
        "OMADA_OMADAC_ID": "$OMADA_OMADAC_ID",
        "OMADA_STRICT_SSL": "true",
        "OMADA_CAPABILITY_PROFILE": "safe-read"
      }
    }
  }
}
```

Skills: put the relevant `SKILL.md` content in `GEMINI.md`.

### VS Code (GitHub Copilot agent mode)

`.vscode/mcp.json` in the workspace. The secret is prompted for once and
stored by VS Code instead of the file:

```json
{
  "inputs": [
    { "type": "promptString", "id": "omada-client-secret", "description": "Omada Open API client secret", "password": true }
  ],
  "servers": {
    "safe-omada": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/safe-omada-mcp/dist/index.js"],
      "env": {
        "OMADA_BASE_URL": "https://<controller-host>:8043",
        "OMADA_CLIENT_ID": "<client-id>",
        "OMADA_CLIENT_SECRET": "${input:omada-client-secret}",
        "OMADA_OMADAC_ID": "<omadac-id>",
        "OMADA_STRICT_SSL": "true",
        "OMADA_CAPABILITY_PROFILE": "safe-read"
      }
    }
  }
}
```

Skills: copy relevant content into `.github/copilot-instructions.md`.

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "safe-omada": {
      "command": "node",
      "args": ["/absolute/path/to/safe-omada-mcp/dist/index.js"],
      "env": {
        "OMADA_BASE_URL": "https://<controller-host>:8043",
        "OMADA_CLIENT_ID": "<client-id>",
        "OMADA_CLIENT_SECRET": "<client-secret>",
        "OMADA_OMADAC_ID": "<omadac-id>",
        "OMADA_STRICT_SSL": "true",
        "OMADA_CAPABILITY_PROFILE": "safe-read"
      }
    }
  }
}
```

### Cline

Open the Cline MCP Servers panel, choose "Configure MCP Servers" and add
to `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "safe-omada": {
      "command": "node",
      "args": ["/absolute/path/to/safe-omada-mcp/dist/index.js"],
      "env": {
        "OMADA_BASE_URL": "https://<controller-host>:8043",
        "OMADA_CLIENT_ID": "<client-id>",
        "OMADA_CLIENT_SECRET": "<client-secret>",
        "OMADA_OMADAC_ID": "<omadac-id>",
        "OMADA_STRICT_SSL": "true",
        "OMADA_CAPABILITY_PROFILE": "safe-read"
      },
      "disabled": false
    }
  }
}
```

Leave "auto-approve" off for write tools.

### OpenCode

`opencode.json` (project) or `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "safe-omada": {
      "type": "local",
      "command": ["node", "/absolute/path/to/safe-omada-mcp/dist/index.js"],
      "enabled": true,
      "environment": {
        "OMADA_BASE_URL": "https://<controller-host>:8043",
        "OMADA_CLIENT_ID": "<client-id>",
        "OMADA_CLIENT_SECRET": "<client-secret>",
        "OMADA_OMADAC_ID": "<omadac-id>",
        "OMADA_STRICT_SSL": "true",
        "OMADA_CAPABILITY_PROFILE": "safe-read"
      }
    }
  }
}
```

Skills: OpenCode reads `AGENTS.md`; use the same approach as Codex.

### Docker variant (any agent)

Build the image once:

```bash
docker build -t safe-omada-mcp:local .
```

Then use `docker` as the command. `-e NAME` without a value passes the
variable through from the agent's environment, so secrets stay out of
the config file:

```json
{
  "mcpServers": {
    "safe-omada": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--read-only", "--cap-drop=ALL", "--security-opt", "no-new-privileges",
        "-e", "OMADA_BASE_URL",
        "-e", "OMADA_CLIENT_ID",
        "-e", "OMADA_CLIENT_SECRET",
        "-e", "OMADA_OMADAC_ID",
        "-e", "OMADA_STRICT_SSL=true",
        "-e", "OMADA_CAPABILITY_PROFILE=safe-read",
        "safe-omada-mcp:local"
      ]
    }
  }
}
```

To use a private CA, add `-v /absolute/path/ca.pem:/certs/ca.pem:ro` and
`-e OMADA_CA_FILE=/certs/ca.pem`. Translate the same `command`/`args`
into TOML for Codex.

## 5. Check it works

Ask the agent to "list Omada sites" (needs `sites:r`, so with the plain
`safe-read` defaults ask it to "list devices" instead) and to "show the
server capabilities" (`getServerCapabilities` reports the active profile
and categories).

## Do not

- Expose the server over HTTP to a network. HTTP is lab-only and needs
  two explicit opt-in variables.
- Put real secrets in files you commit.
- Turn on agent auto-approval for write tools.
- Grant `recovery:rw` except for a planned restore.

## HTTP mode (lab only) and webhook changes

- HTTP transport needs `MCP_SERVER_USE_HTTP=true`, `MCP_UNSAFE_ENABLE_HTTP=true` and `MCP_HTTP_BEARER_TOKEN` (32+ characters, sent as `Authorization: Bearer ...`). It binds to loopback only, checks Host/Origin, caps bodies at 1 MB and sessions at 16. A `*` origin is refused. Prefer stdio.
- `updateLogNotificationSettings` and `updateAuditNotificationSettings` are admin-only and destructive. Applying a webhook change requires `confirmWebhookChange: true`. Webhook URLs must be https and public.
- Write payloads are validated against allowlists of known keys, with a 64 KB size and depth-8 cap. IDs such as `siteId` must match `^[A-Za-z0-9_-]{1,128}$`.
- Docker: build locally with `docker build -t omada-mcp:local .`; no prebuilt image is published.
