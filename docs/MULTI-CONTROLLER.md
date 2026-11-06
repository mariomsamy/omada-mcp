# Several controllers in one server

By default omada-mcp talks to one controller configured with
`OMADA_BASE_URL`, `OMADA_CLIENT_ID`, `OMADA_CLIENT_SECRET` and
`OMADA_OMADAC_ID`. That mode is unchanged.

To reach several controllers (for example a home controller and an office
controller) from one MCP server, point `OMADA_CONTROLLERS_FILE` at a JSON
file of named profiles. The agent then picks a controller per call with a
`controller` argument.

## How it works

- **Profiles file.** `OMADA_CONTROLLERS_FILE=/path/to/controllers.json`.
  When it is set, the single-controller variables (`OMADA_BASE_URL`,
  `OMADA_CLOUD_REGION`, `OMADA_CLIENT_ID`, `OMADA_CLIENT_SECRET`,
  `OMADA_OMADAC_ID`, `OMADA_SITE_ID`, `OMADA_STRICT_SSL`, `OMADA_CA_FILE`,
  `OMADA_TIMEOUT`) are **ignored** and a startup warning names the ones that
  were set. Everything else (`OMADA_CAPABILITY_PROFILE`,
  `OMADA_TOOL_CATEGORIES`, catalog mode, logging) applies as before.
- **Default controller.** The entry with `"default": true`, otherwise the
  first entry.
- **The `controller` argument.** With two or more profiles every tool gets
  an extra `controller` argument whose allowed values are the profile names:
  - read tools may omit it; the default controller is used;
  - write tools (including dry-run previews) **must** name the controller.
    Without it the call is refused, so a change can never land on the
    wrong controller by accident.
  - an unknown name is rejected with the list of configured names.

  With exactly one profile no argument is added and every tool schema is
  identical to single-controller mode.
- **One client per controller.** Each profile gets its own HTTP client,
  OAuth token cache and TLS settings, created on first use. A controller
  that is down or unreachable only fails the calls aimed at it.
- **Same safety model.** The capability profile and categories apply to
  all controllers alike; writes still preview by default (`dryRun: true`).
  Mutation audit events and tool logs include the controller **name**
  (never its URL or credentials), and mutation results report it as
  `controller`.
- **`listControllers`.** A read-only tool, registered whenever the file
  is set, that returns each profile's name, base-URL host, default flag
  and default site. It returns no credentials, `omadacId`, paths or query
  strings and makes no controller request.
- **stdio only.** The lab-only HTTP transport refuses to start with
  `OMADA_CONTROLLERS_FILE`.

## The profiles file

```json
{
  "controllers": [
    {
      "name": "home",
      "baseUrl": "https://<home-controller-host>:8043",
      "clientId": "<client-id>",
      "clientSecret": "<client-secret>",
      "omadacId": "<omadac-id>",
      "default": true
    },
    {
      "name": "office",
      "baseUrl": "https://<office-controller-host>",
      "clientId": "<client-id>",
      "clientSecret": "<client-secret>",
      "omadacId": "<omadac-id>",
      "siteId": "<default-site-id>",
      "caFile": "/absolute/path/office-ca.pem",
      "timeout": 30000
    }
  ]
}
```

| Field | Required | Default | Notes |
| --- | --- | --- | --- |
| `name` | Yes | - | `^[a-z0-9][a-z0-9_-]{0,31}$`; unique. This is the value of the `controller` argument. |
| `baseUrl` | Yes | - | `http(s)://host[:port]`; no user/password, query string or fragment. |
| `clientId`, `clientSecret`, `omadacId` | Yes | - | From the controller's Open API app (see [INSTALL.md](INSTALL.md)). |
| `siteId` | No | - | Default site for that controller. |
| `strictSsl` | No | `true` | Keep it on; prefer `caFile`. `false` logs a startup warning. |
| `caFile` | No | - | PEM CA bundle for a private CA; host-name checks stay on. |
| `timeout` | No | `30000` | Request timeout in milliseconds (max 600000). |
| `default` | No | first entry | At most one entry may set it. |

The file is validated strictly at startup: unknown keys (typos such as
`clientSecert`), duplicate names, missing fields, more than one default,
more than 32 controllers or a file over 1 MiB stop the server with a
message naming the entry and field, never a value. Invalid JSON is
reported as "not valid JSON" without quoting the file.

A list (rather than an object keyed by name) is used on purpose: JSON
parsers silently keep the last of two duplicate keys, while duplicate
names in a list are detected and rejected, and list order makes "first
entry is the default" unambiguous.

## Security notes

- **Permissions.** The file holds client secrets. On Linux and macOS the
  server refuses to start if group or others have any permission on it:
  run `chmod 600 controllers.json` and keep it owned by the user that runs
  the server. (Windows is not checked; restrict the file's ACL yourself.)
- **Secrets stay in the file.** They are never logged, returned by a tool
  or included in an error message. Startup logs list only names, hosts
  and default flags.
- **Least privilege per controller.** Create a separate Open API app on
  each controller, with a viewer role unless you really need writes.
- **Do not commit the file.** Keep it outside the repository, for example
  in `~/.config/omada-mcp/controllers.json`.

## Agent configuration

The agent config then needs only the file path; no secrets live in it.

### Claude Code

```bash
claude mcp add omada --scope user \
  -e OMADA_CONTROLLERS_FILE=/absolute/path/controllers.json \
  -e OMADA_CAPABILITY_PROFILE=safe-read \
  -- node /absolute/path/to/omada-mcp/dist/index.js
```

### Claude Desktop, Cursor and other JSON configs

```json
{
  "mcpServers": {
    "omada": {
      "command": "node",
      "args": ["/absolute/path/to/omada-mcp/dist/index.js"],
      "env": {
        "OMADA_CONTROLLERS_FILE": "/absolute/path/controllers.json",
        "OMADA_CAPABILITY_PROFILE": "safe-read"
      }
    }
  }
}
```

### Codex CLI

```toml
[mcp_servers.omada]
command = "node"
args = ["/absolute/path/to/omada-mcp/dist/index.js"]

[mcp_servers.omada.env]
OMADA_CONTROLLERS_FILE = "/absolute/path/controllers.json"
OMADA_CAPABILITY_PROFILE = "safe-read"
```

### Docker

The image runs as a non-root user, so run it as the file's owner and
mount the file read-only:

```bash
docker run -i --rm --read-only --cap-drop=ALL --security-opt no-new-privileges \
  --user "$(id -u):$(id -g)" \
  -v /absolute/path/controllers.json:/config/controllers.json:ro \
  -e OMADA_CONTROLLERS_FILE=/config/controllers.json \
  omada-mcp:local
```

## Using it

Ask the agent to "list the Omada controllers" (`listControllers`), then
for example "list devices on the office controller". The agent passes
`"controller": "office"`; without it, reads go to the default controller.
For a change, the agent must say which controller it targets, and the
change still previews first.
