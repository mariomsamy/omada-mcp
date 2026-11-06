<div align="center">

# Omada MCP

**Talk to your TP-Link Omada network from any AI agent, safely.**

Read-only by default · dry-run by default · official Open API only

[![CI](https://github.com/mariomsamy/omada-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/mariomsamy/omada-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/omada-mcp)](https://www.npmjs.com/package/omada-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js 24+](https://img.shields.io/badge/node-24%2B-green)](https://nodejs.org)

[Quick start](#quick-start) ·
[What you can ask](#what-you-can-ask) ·
[Safety](#safety) ·
[Configuration](#configuration) ·
[Tools](#tools) ·
[Skills](#skills) ·
[Docs](#documentation) ·
[Credits](#credits)

</div>

---

## At a glance

| | |
| --- | --- |
| **Tools** | 433 in total: 429 operations (340 read, 89 write) plus 4 discovery tools. The default profile registers only the read tools you need. |
| **Safe by default** | Writes are not even registered until you grant them, and every write is a dry run until you pass `dryRun: false`. |
| **Agents** | Claude Code, Claude Desktop, Codex CLI, Cursor, Gemini CLI, VS Code / Copilot, Windsurf, Cline, OpenCode. |
| **Skills** | 8 ready-made workflows: audit, safe change, Wi-Fi troubleshooting, roaming and DFS, alert triage and more. |
| **Transport** | `stdio` (production). HTTP exists only as a loopback-only lab mode. |
| **Built from** | 23 public Omada MCP projects, merged and audited. See [Credits](#credits). |

## Quick start

**1. Create Open API credentials** on your controller:
**Global View → Settings → Platform Integration → Open API → Add New App**.
Choose **Client Mode** and start with a **Viewer** role. Copy the *Client ID*,
*Client Secret*, *Omada ID* and the *Interface Access Address* (your base URL).

**2. Build** (Node.js 24+):

```bash
git clone https://github.com/mariomsamy/omada-mcp.git && cd omada-mcp
npm ci && npm run build
```

**3. Connect your agent.** Pick one:

<details open>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add omada --scope user \
  -e OMADA_BASE_URL=https://<controller-host>:8043 \
  -e OMADA_CLIENT_ID=<client-id> \
  -e OMADA_CLIENT_SECRET=<client-secret> \
  -e OMADA_OMADAC_ID=<omada-id> \
  -e OMADA_STRICT_SSL=true \
  -e OMADA_CAPABILITY_PROFILE=safe-read \
  -- node /absolute/path/to/omada-mcp/dist/index.js
```

Or commit a project `.mcp.json`. Claude Code expands `${VAR}` from your shell, so the file holds no secrets:

```json
{
  "mcpServers": {
    "omada": {
      "command": "node",
      "args": ["/absolute/path/to/omada-mcp/dist/index.js"],
      "env": {
        "OMADA_BASE_URL": "${OMADA_BASE_URL}",
        "OMADA_CLIENT_ID": "${OMADA_CLIENT_ID}",
        "OMADA_CLIENT_SECRET": "${OMADA_CLIENT_SECRET}",
        "OMADA_OMADAC_ID": "${OMADA_OMADAC_ID}",
        "OMADA_STRICT_SSL": "true",
        "OMADA_CAPABILITY_PROFILE": "safe-read"
      }
    }
  }
}
```

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`).
Claude Desktop does not expand `${VAR}`, so put the real values in and protect the file.

```json
{
  "mcpServers": {
    "omada": {
      "command": "node",
      "args": ["/absolute/path/to/omada-mcp/dist/index.js"],
      "env": {
        "OMADA_BASE_URL": "https://<controller-host>:8043",
        "OMADA_CLIENT_ID": "<client-id>",
        "OMADA_CLIENT_SECRET": "<client-secret>",
        "OMADA_OMADAC_ID": "<omada-id>",
        "OMADA_STRICT_SSL": "true",
        "OMADA_CAPABILITY_PROFILE": "safe-read"
      }
    }
  }
}
```

</details>

<details>
<summary><b>Codex CLI, Cursor, Gemini, VS Code, Windsurf, Cline, OpenCode</b></summary>

Exact files and snippets for each agent (for example `~/.codex/config.toml`,
`~/.cursor/mcp.json`, `.vscode/mcp.json`) are in [docs/INSTALL.md](docs/INSTALL.md),
together with where each agent loads the [skills](#skills).

</details>

<details>
<summary><b>Docker (hardened)</b></summary>

No prebuilt image is published, so build it first:

```bash
docker build -t omada-mcp:local .
```

Then point your agent at the container. It needs no writable disk and no capabilities:

```json
{
  "mcpServers": {
    "omada": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--read-only", "--cap-drop=ALL", "--security-opt", "no-new-privileges",
        "-e", "OMADA_BASE_URL=https://<controller-host>:8043",
        "-e", "OMADA_CLIENT_ID=<client-id>",
        "-e", "OMADA_CLIENT_SECRET=<client-secret>",
        "-e", "OMADA_OMADAC_ID=<omada-id>",
        "-e", "OMADA_STRICT_SSL=true",
        "omada-mcp:local"
      ]
    }
  }
}
```

Or run it directly with an env file:
`docker run --rm -i --read-only --cap-drop=ALL --security-opt no-new-privileges --env-file .env omada-mcp:local`.
To trust a private CA, mount it read-only: `-v /path/ca.pem:/certs/ca.pem:ro -e OMADA_CA_FILE=/certs/ca.pem`.

</details>

**4. Check it works.** Restart the agent and ask: *"Run getServerCapabilities and list my sites."*

> **Remote access.** The base URL is the controller's own *Interface Access Address*
> (port 8043). To reach it from outside your LAN, use a VPN, Tailscale or a tunnel
> to that address. TP-Link Cloud Access is a web-console relay: its cloud Open API host
> does not serve on-premise controllers (it answers `-7131 Controller ID not exist`).
> Self-signed certificate? Keep `OMADA_STRICT_SSL=true` and set `OMADA_CA_FILE` instead of turning TLS checks off.

## What you can ask

| Ask your agent | Tool or skill behind it |
| --- | --- |
| "Give me a health overview of my network." | `getNetworkHealthSummary` |
| "Audit my network and rank the problems." | `getNetworkAuditReport`, skill `omada-network-audit` |
| "Which alerts keep repeating, and which device is behind them?" | `groupSiteAlerts` |
| "Are any of my devices out of date?" | `checkFirmwareUpdates` |
| "Which AP has the worst Wi-Fi?" | `getWifiHealthSummary`, skill `omada-wifi-troubleshoot` |
| "Who is on my network and what are they using?" | `listClients`, `listMostActiveClients` |
| "Hide this SSID." (preview first, then apply) | `updateSsid`, skill `omada-safe-change` |

Writes need a profile that grants them (see [Safety](#safety)).

## Safety

The server enforces these itself. They do not replace human approval, so configure your agent to ask before running write tools.

| Guarantee | What it means |
| --- | --- |
| **Read-only by default** | Write tools are not registered unless the profile or categories grant them. |
| **Dry run by default** | Every write returns a `planned` preview (with a field-level diff) and sends no mutating request until you pass `dryRun: false`. |
| **Read-back** | Key writes verify the controller state afterwards and report `verified`, `mismatch`, `unknown`, `unverifiable` or `partial`. Others report `submitted`; read them back (see the `omada-safe-change` skill). |
| **Recovery isolation** | Restores need an explicit `recovery:rw` grant plus `confirmDangerous: true`. Neither `admin` nor `all:rw` includes it. |
| **No raw API tool** | No generic method/path tool, no private web API, no header-supplied credentials. Credentials come only from the environment. |
| **Redaction and audit** | Secrets are masked in logs and results, and every mutation writes an audit event. |
| **stdio first, TLS on** | HTTP is lab-only, loopback-only and needs two opt-in variables. TLS verification is on by default. |

### Capability profiles

| Profile | What is registered | Typical use |
| --- | --- | --- |
| `safe-read` (default) | Reads for dashboard, clients, client insights, devices, firewall ACL and traffic | First install, monitoring |
| `safe-read` + `OMADA_TOOL_CATEGORIES=all:r` | Every read tool, no write tool | Audits, triage, troubleshooting skills |
| `ops-write` | Reads for dashboard, clients, devices, logs, WAN, threats, VPN; writes for clients and maintenance (backups) | Day-to-day operations |
| `admin` | All categories, read and write, except recovery | Planned configuration changes |
| `recovery:rw` (explicit only) | Restore tools, also needing `confirmDangerous: true` | Operator-led disaster recovery |

`OMADA_TOOL_CATEGORIES` replaces the profile defaults (the server then reports profile `custom`), so grant only what you need, for example `all:r,wireless-radio:rw`. `compatibility` is a deprecated alias for `admin`.

## Configuration

All settings are environment variables. [`.env.example`](.env.example) is the full reference.

### Connection

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `OMADA_BASE_URL` | Yes | - | Controller base URL (its Interface Access Address) |
| `OMADA_CLIENT_ID` | Yes | - | Open API client ID |
| `OMADA_CLIENT_SECRET` | Yes | - | Open API client secret |
| `OMADA_OMADAC_ID` | Yes | - | Omada ID (`omadacId`) |
| `OMADA_SITE_ID` | No | - | Default site. If omitted and a single site exists it is used; zero or several sites return an error. |
| `OMADA_STRICT_SSL` | No | `true` | Enforce TLS certificate validation |
| `OMADA_CA_FILE` | No | - | PEM private CA bundle (keeps hostname verification). Mount it read-only in Docker. |
| `OMADA_TIMEOUT` | No | `30000` | HTTP timeout in milliseconds |

### Tools and logging

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `OMADA_CAPABILITY_PROFILE` | No | `safe-read` | `safe-read`, `ops-write`, `admin` or `compatibility` |
| `OMADA_TOOL_CATEGORIES` | No | profile default | Explicit category override; recovery needs `recovery:rw` |
| `OMADA_CATALOG_MODE` | No | `standard` | `standard` tools, or `compact` discovery and dispatch |
| `OMADA_INCLUDE_DEPRECATED` | No | `false` | Include deprecated aliases |
| `OMADA_ALLOW_TOOL_HEADERS` | No | `false` | Expose only bounded `X-Request-ID` / `X-Correlation-ID` headers |
| `OMADA_WEBHOOK_ALLOWED_HOSTS` | No | - | Allowlist of webhook destination hosts for the log and audit notification tools |
| `MCP_SERVER_LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `MCP_SERVER_LOG_FORMAT` | No | `plain` | `plain`, `json` or `gcp-json` |

### Writes, webhooks and logs

- **Previews.** A dry run sends read requests only and no mutating request. Update tools whose current value is readable include a field-level `diff` (`changed[]` with `path`, `before`, `planned`, secrets masked). Review it, then pass `dryRun: false`. `submitted` means the controller accepted the request; only `verified` means a matching read-back. See the [0.19 migration guide](docs/operations/0.19-migration.md) for verification limits.
- **Webhooks.** `updateLogNotificationSettings` and `updateAuditNotificationSettings` can send client MACs, IPs and host names off-network. Applying a change needs `confirmWebhookChange: true`. Every destination must be `https`, must not be a private, loopback or link-local literal, must resolve only to public addresses and, when `OMADA_WEBHOOK_ALLOWED_HOSTS` is set, must be on that list.
- **Restore** also needs `confirmDangerous: true`. This is an argument check, not enforced human approval. Configure approvals in your MCP host and grant `recovery:rw` only for intended recovery.
- **Logs.** At `info` a tool call logs the tool name, argument names and identifier fields only, and Omada request URLs have client MACs and IPs replaced by `[mac]` and `[ip]`. Full masked arguments appear only at `debug`. Keep log retention short ([security model](docs/security-model.md#log-retention)).

<details>
<summary><b>Optional HTTP lab mode (not for production)</b></summary>

HTTP only starts when both `MCP_SERVER_USE_HTTP=true` and `MCP_UNSAFE_ENABLE_HTTP=true` are set. Use it only for local lab and debugging.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `MCP_SERVER_USE_HTTP` | No | `false` | Legacy lab-only switch |
| `MCP_UNSAFE_ENABLE_HTTP` | No | `false` | Explicit acknowledgement required |
| `MCP_HTTP_PORT` | No | `3000` | HTTP port |
| `MCP_HTTP_BIND_ADDR` | No | `127.0.0.1` | Loopback only (`127.0.0.1` or `::1`) |
| `MCP_HTTP_PATH` | No | `/mcp` | MCP endpoint path |
| `MCP_HTTP_BEARER_TOKEN` | Yes (HTTP only) | - | At least 32 characters (for example `openssl rand -hex 32`). The HTTP transport never runs unauthenticated. |
| `MCP_HTTP_ALLOWED_ORIGINS` | No | `127.0.0.1, localhost` | Allowed origins; `*` is refused |
| `MCP_HTTP_ENABLE_HEALTHCHECK` | No | `true` | Enable the health check |
| `MCP_HTTP_HEALTHCHECK_PATH` | No | `/healthz` | Health check path |
| `MCP_HTTP_ALLOW_CORS` | No | `true` | Enable CORS |
| `MCP_HTTP_NGROK_ENABLED` | No | `false` | Legacy placeholder; disabled in the safe baseline |
| `MCP_HTTP_NGROK_AUTH_TOKEN` | No | - | Legacy placeholder |

</details>

## Skills

Eight skills in [`skills/`](skills/) teach an agent whole workflows with this server.
For Claude Code: `cp -R skills/omada-* ~/.claude/skills/`. Other agents: [docs/SKILLS.md](docs/SKILLS.md).

| Skill | Use it to |
| --- | --- |
| `omada-network-audit` | Run a read-only health and security review |
| `omada-safe-change` | Make a change: dry run, review, apply, read back |
| `omada-wifi-troubleshoot` | Diagnose slow or unreliable Wi-Fi |
| `omada-roaming-dfs` | Tune roaming and DFS channels |
| `omada-alert-triage` | Triage alerts and find the cause |
| `omada-support-assist` | Handle a user's connectivity complaint |
| `omada-bulk-site-onboard` | Onboard many sites consistently |
| `omada-guest-portal-wizard` | Set up a guest portal |

## Tools

Every registered tool has a row below, grouped by area. Each area is collapsed
(read and write tools separately) so the page stays scannable. Areas and tools are in alphabetical order.

| Area | Tools | What it covers |
| --- | ---: | --- |
| [Workflows and discovery](#workflows-and-discovery) | 10 | Composite diagnostics, safe multi-step writes, and catalog discovery tools. |
| [Account Cloud](#account-cloud) | 4 | Cloud access, MFA, and remote binding status. |
| [Account Users](#account-users) | 6 | User and role management for the controller. |
| [Composite Troubleshooting Tools](#composite-troubleshooting-tools) | 6 | Single-call tools that internally aggregate multiple Omada API calls in parallel. Use these instead… |
| [Controller](#controller) | 7 | Controller-level settings: certificates, ports, data retention, telemetry, and global dashboard. |
| [Dashboard / Monitor](#dashboard--monitor) | 17 | Site dashboard widgets: WiFi and switch summaries, PoE usage, CPU/memory top-N, traffic activities,… |
| [Device](#device) | 67 | Device inventory, per-device detail (switches, gateways, APs), firmware, cable tests, and device… |
| [Firewall & ACL](#firewall--acl) | 3 | 802.1X authentication and RADIUS proxy settings. |
| [Firewall IDS / IPS](#firewall-ids--ips) | 1 | Intrusion detection and prevention system configuration. |
| [Firewall Traffic & QoS](#firewall-traffic--qos) | 14 | Traffic shaping, QoS policies, application control, URL filtering, and MAC filtering. |
| [Insight](#insight) | 4 | Site-level security insights: threat events, WIDS, rogue AP detection, and VPN tunnel stats. |
| [Logs](#logs) | 5 | Site-level and global event, alert, and audit logs. |
| [Maintenance](#maintenance) | 14 | Controller and site backups, restores, and rogue AP exports. |
| [Network](#network) | 92 | WAN/LAN configuration, SSIDs, WLAN groups, routing, NAT, DHCP, DNS, firewall settings, bandwidth… |
| [Profiles](#profiles) | 16 | RADIUS, PPSK, service, QoS, schedule, group policy, VLAN, user role, and portal profiles. |
| [Schedules](#schedules) | 5 | PoE, port, reboot, and firmware upgrade schedules. |
| [Security & Threat Management](#security--threat-management) | 2 | Global threat intelligence, IPS alerts, and top-threat summaries. |
| [Site & Client](#site--client) | 24 | Site listing, client monitoring, and client-level operational controls (rate limits, block/unblock,… |
| [VPN](#vpn) | 7 | Site-to-site and client-to-site VPN configuration, tunnel details, and user management. |
| [Ported operations](#ported-operations) | 54 | Tools ported from sibling MIT-licensed Omada MCP projects (see [NOTICE.md](NOTICE.md)). Every route… |
| [API operation map](#api-operation-map) | - | Omada operation IDs mapped to MCP tool names. |

### Workflows and discovery

| Tool | Description |
| --- | --- |
| `callOperation` | Compact mode only: invokes an enabled operation through its existing schema and handler. |
| `describeOperation` | Returns an enabled operation's exact argument schema and permission. |
| `diagnoseCameraConnectivity` | Resolves a camera client and reads its detail/session evidence; reports missing data and network drilldowns without claiming to diagnose Frigate inference. |
| `diagnoseLogs` | Reads recent event, alert and audit pages plus log settings; distinguishes unavailable data from empty results and reports incomplete history. `detail: "summary"` (default) reports notification settings as enabled counts; `detail: "full"` lists every type. |
| `getServerCapabilities` | Reports version, effective catalog, profile and validation limits. |
| `getWifiHealthSummary` | Composes dashboard, channel, interference and retry evidence with timestamps, missing sections and bounded review heuristics. Read-only. `detail: "summary"` (default) keeps findings, per-AP retry/drop averages and occupied-channel utilisation; `detail: "full"` adds raw time series. |
| `searchOperations` | Searches only enabled operations by name, description or category. |
| `setApRadio` | Previews or updates one supported AP band with advertised channel/width validation, preserved sibling settings and bounded readback verification. |
| `setSwitchPorts` | Previews or updates name, status, PoE, profile or override for 1–32 explicit ports. Checks existence, guards known LAG disruption and reports per-port verification/partial completion. |
| `updateSsid` | Previews or updates SSID name, broadcast visibility, guest status or sharing policy while preserving required security fields. Broadcast visibility is not SSID enable/disable. |

### Account Cloud

Cloud access, MFA, and remote binding status.

<details>
<summary>Read tools (6)</summary>

| Tool | Description |
|---|---|
| `getCloudAccessStatus` | Get cloud access status for the controller. |
| `getCloudUserInfo` | Get cloud user account information. |
| `getMfaStatus` | Get global MFA (multi-factor authentication) status. |
| `getRemoteBindingStatus` | Get remote binding status between controller and cloud. |

</details>

### Account Users

User and role management for the controller.

<details>
<summary>Read tools (6)</summary>

| Tool | Description |
|---|---|
| `getAllCloudUsers` | List all cloud users on the controller, excluding the root account. |
| `getAllLocalUsers` | List all local users on the controller, excluding the root account. |
| `getAllRoles` | [DEPRECATED] Use `getUserRoleProfile` instead. List all user roles configured on the controller. |
| `getAllUsersApp` | List all users (cloud and local) in grid view. |
| `getAvailableRoles` | List roles available for user assignment. |
| `getRoleDetail` | Get detailed information about a specific role. Requires `roleId`. |

</details>

### Composite Troubleshooting Tools

Single-call tools that internally aggregate multiple Omada API calls in parallel. Use these instead of chaining individual tools when you need a quick overview or are starting a troubleshooting session.

<details>
<summary>Read tools (6)</summary>

| Tool | Description |
|---|---|
| `diagnoseClient` | Composite: given a client MAC, IP, or hostname — fetches current connection status, detailed client info (VLAN, signal, policy), and recent connection history in one call. |
| `getGatewayHealth` | Composite: auto-discovers the gateway then fetches its detail (CPU, memory, firmware), WAN port statuses, LAN interface statuses, and port list in one call. Use for internet/WAN diagnostics. |
| `getNetworkAuditReport` | Composite, read-only: prioritised audit (severity-ordered findings with evidence and recommendations, compact sections, `unavailable` list) from devices, WAN status, clients, grouped alerts, rogue APs, IPS, pending devices and per-AP Wi-Fi retry/drop/channel data. No writes or scans. |
| `getNetworkHealthSummary` | Composite: combines dashboard overview (device/client counts), internet/WAN status, client distribution, and recent active threats into a single response. First call for any troubleshooting session. |
| `getSecurityOverview` | Composite: combines active threat list (up to 20, newest first) and firewall settings into one response. Use for security posture checks or investigating alerts. |
| `groupSiteAlerts` | Composite, read-only: site alerts for a window (default 24 h, paginated with a cap and `truncated` flag) grouped by alert key with counts, first/last seen and parsed subjects (rogue DHCP IP/MAC, IP-conflict clients, WAN port), matched to current clients/devices by exact MAC/IP. |

</details>

### Controller

Controller-level settings: certificates, ports, data retention, telemetry, and global dashboard.

<details>
<summary>Read tools (7)</summary>

| Tool | Description |
|---|---|
| `getCertificate` | Get SSL/TLS certificate configuration for the controller. |
| `getClientHistoryDataEnable` | Get the client history data collection enable setting. |
| `getControllerPort` | Get the controller port configuration for device adoption. |
| `getDataRetention` | Get data retention settings for the controller. |
| `getExperienceImprovement` | Get the experience improvement program setting (telemetry). |
| `getGlobalDashboardOverview` | Get global controller dashboard overview without client data. |
| `getPortalPort` | Get portal port configuration for the controller web interface. |

</details>

### Dashboard / Monitor

Site dashboard widgets: WiFi and switch summaries, PoE usage, CPU/memory top-N, traffic activities, VPN tunnel stats, and RF analytics.

<details>
<summary>Read tools (16)</summary>

| Tool | Description |
|---|---|
| `getChannels` | Gets channel distribution and utilization across all APs. |
| `getDashboardMostActiveEaps` | Gets most active access points from the site dashboard. Optional `start`/`end` (Unix seconds); default: last hour. |
| `getDashboardMostActiveSwitches` | Gets most active switches from the site dashboard. Optional `start`/`end` (Unix seconds); default: last hour. |
| `getDashboardOverview` | Get the site overview: device counts, client counts, connectivity graph, and overall health status. |
| `getDashboardPoEUsage` | Gets PoE usage data from the site dashboard. |
| `getDashboardSwitchSummary` | Gets switch summary from the site dashboard. Optional `start`/`end` (Unix seconds); default: last hour. |
| `getDashboardTopCpuUsage` | Gets top CPU usage data from the site dashboard. Optional `start`/`end` (Unix seconds); default: last hour. |
| `getDashboardTopMemoryUsage` | Gets top memory usage data from the site dashboard. Optional `start`/`end` (Unix seconds); default: last hour. |
| `getDashboardTrafficActivities` | Gets traffic activity data from the site dashboard. Optional `start`/`end` (Unix seconds); default: last hour. |
| `getDashboardWifiSummary` | Gets WiFi summary from the site dashboard. Optional `start`/`end` (Unix seconds); default: last hour. |
| `getGridDashboardIpsecTunnelStats` | Gets IPsec tunnel statistics. |
| `getGridDashboardOpenVpnTunnelStats` | Gets OpenVPN tunnel statistics by type. Requires `type` parameter. |
| `getGridDashboardTunnelStats` | Gets VPN tunnel statistics. Required: `type` (0 = Server, 1 = Client). |
| `getInterference` | Gets top RF interference sources detected by APs. |
| `getIspLoad` | Gets per-WAN ISP link load over a time range. Requires `start` and `end` timestamps (seconds). |
| `getRetryAndDroppedRate` | Gets wireless retry rate and dropped packet rate over a time range. Requires `start` and `end` timestamps (seconds). |
| `getTrafficDistribution` | Gets traffic distribution by protocol/app type over a time range. Requires `start` and `end` timestamps (seconds). |

</details>

### Device

Device inventory, per-device detail (switches, gateways, APs), firmware, cable tests, and device configuration.

<details>
<summary>Read tools (62)</summary>

| Tool | Description |
|---|---|
| `checkFirmwareUpdates` | Read-only firmware audit of every adopted device in a site: current vs latest known firmware (per-device latest info plus the stable firmware pool) with status `up-to-date`, `update-available` or `unknown`. Never upgrades; unknown is never guessed. |
| `getAllDeviceBySite` | Gets all devices in a site including offline and disconnected devices. |
| `getApDetail` | Fetches detailed configuration and status for a specific access point. |
| `getApGeneralConfig` | Gets general configuration for an AP (name, LED, country). Requires `apMac`. |
| `getApIpv6Config` | Get IPv6 configuration for a specific access point. Requires `apMac`. |
| `getApLldpConfig` | Gets LLDP configuration for an AP. Requires `apMac`. |
| `getApQosConfig` | Get QoS configuration for a specific access point. Requires `apMac`. |
| `getApRadios` | Gets radio information for a specific access point. |
| `getApSnmpConfig` | Gets SNMP configuration for an AP. Requires `apMac`. |
| `getApUplinkConfig` | Gets uplink configuration for an AP (wired/mesh mode). Requires `apMac`. |
| `getApVlanConfig` | Get VLAN configuration for an access point, including management VLAN and per-SSID VLAN tagging settings. |
| `getCableTestFullResults` | Gets full per-port cable diagnostics for a switch. Requires `switchMac`. |
| `getCableTestLogs` | Gets cable test history for a switch. Requires `switchMac`. |
| `getDevice` | [DEPRECATED] Use `listDevices` instead and filter results client-side. This tool filters the site device list in-process; there is no dedicated device-detail endpoint. |
| `getDeviceTagList` | Get the list of device tags defined in a site. |
| `getDownlinkWiredDevices` | Gets wired downlink devices on an AP's LAN ports. Requires `apMac`. |
| `getFirmwareInfo` | Gets the latest available firmware info for a device. Use `listDevices` for MACs. |
| `getFirmwareUpgradePlan` | Get the firmware upgrade plan list for devices managed by the controller. |
| `getGatewayDetail` | Fetches detailed configuration and status for a specific gateway. |
| `getGatewayLanStatus` | Gets LAN port status for a specific gateway. |
| `getGatewayPorts` | Gets port information for a specific gateway. |
| `getGatewayWanStatus` | Gets WAN port status for a specific gateway. |
| `getGridAutoCheckUpgrade` | Gets the auto-check firmware upgrade plan list (paginated). |
| `getMeshStatistics` | Gets mesh link statistics for an AP. Requires `apMac`. |
| `getOswStackLagList` | Gets Link Aggregation Group (LAG) list for a switch stack. Requires `stackId`. |
| `getRadiosConfig` | Gets per-radio configuration for an AP (channel, power, width). Requires `apMac`. |
| `getRFScanResult` | Gets last RF scan results for an AP. Requires `apMac`. |
| `getSitesApsAvailableChannel` | Get list of available channels for an AP. Requires `apMac`. |
| `getSitesApsBridge` | Get bridge configuration for an AP. Requires `apMac`. |
| `getSitesApsChannelLimit` | Get channel limit configuration for an AP. Requires `apMac`. |
| `getSitesApsIpSetting` | Get IP settings for an AP. Requires `apMac`. |
| `getSitesApsLoadBalance` | Get load balance configuration for an AP. Requires `apMac`. |
| `getSitesApsOfdma` | Get OFDMA configuration for an AP. Requires `apMac`. |
| `getSitesApsPowerSaving` | Get power saving configuration for an AP. Requires `apMac`. |
| `getSitesApsTrunkSetting` | Get trunk port setting for an AP. Requires `apMac`. |
| `getSitesDeviceWhiteList` | Get the device adoption whitelist for a site (paginated). |
| `getSitesGatewaysGeneralConfig` | Get general configuration for a gateway. Requires `gatewayMac`. |
| `getSitesGatewaysPin` | Get PIN information for a gateway. Requires `gatewayMac`. |
| `getSitesGatewaysSimCardUsed` | Get SIM card usage info for a gateway. Requires `gatewayMac`. |
| `getSitesHealthGatewaysWansDetails` | Get gateway WAN health details. Requires `gatewayMac`. |
| `getSitesSwitchesEs` | Get ES switch details. Requires `switchMac`. |
| `getSitesSwitchesEsGeneralConfig` | Get ES switch general configuration. Requires `switchMac`. |
| `getSpeedTestResults` | Gets last speed test results for an AP. Requires `apMac`. |
| `getStackNetworkList` | Gets VLAN network list for a switch stack (paginated). Requires `stackId`. |
| `getStackPorts` | Gets port information for a switch stack. |
| `getSwitchDetail` | Fetches detailed configuration and status for a specific switch. |
| `getSwitchGeneralConfig` | Gets general configuration for a switch. Requires `switchMac`. |
| `getSwitchStackDetail` | Retrieves detailed configuration and status for a switch stack. |
| `getUpgradeLogs` | Get firmware upgrade logs showing the history of upgrade operations performed on devices. |
| `getUpgradeOverviewCritical` | Get the number of critical models available for upgrade. |
| `getUpgradeOverviewTryBeta` | Get the current status of the try-beta firmware upgrade switch. |
| `getUplinkWiredDetail` | Get wired uplink detail for an access point: uplink switch, port number, link speed, and PoE status. |
| `listDevices` | Lists provisioned devices for a given site. |
| `listDevicesStats` | Queries statistics for global adopted devices with pagination and filtering. |
| `listPendingDevices` | Lists devices pending adoption in a site. |
| `listSitesApsPorts` | List ports for an AP. Requires `apMac`. |
| `listSitesCableTestSwitchesIncrementResults` | Get incremental cable test results for a switch. Requires `switchMac`. |
| `listSitesCableTestSwitchesPorts` | List cable test port info for a switch. Requires `switchMac`. |
| `listSitesStacks` | List switch stacks in a site (paginated). |
| `listSwitchNetworks` | Lists VLAN network assignments for a switch (paginated). Requires `switchMac`. |
| `listUpgradeFirmwares` | List available firmware packages for upgrade (paginated). |
| `listUpgradeOverviewFirmwares` | List firmware overview for upgradeable devices (paginated; optional `channel`: 0 stable (default), 1 RC, 2 beta). |
| `searchDevices` | Searches for devices globally across all sites the user has access to. |

</details>

<details>
<summary>Write tools (4)</summary>

| Tool | Description |
|---|---|
| `setApChannelLimit` | Updates AP channel-limit configuration with support checks and dry-run preview. Requires `apMac`. |
| `setApConfig` | Updates documented AP configuration families with dry-run preview. Covers AP general, IP, IPv6, QoS, radio, service, load-balance, OFDMA, trunk, bridge, WLAN group, port, channel, AFC, and antenna settings. Setter-only families return planned payloads and an explicit warning when controller readback is unavailable. Requires `apMac`. |
| `setApPowerSaving` | Updates AP power saving configuration with support checks and dry-run preview. Requires `apMac`. |
| `setGatewayConfig` | Updates documented gateway configuration families with dry-run preview. Covers general, services, advanced, radios, WLAN, and port settings. Setter-only families return planned payloads and an explicit warning when controller readback is unavailable. Requires `gatewayMac`. |

</details>

### Firewall & ACL

802.1X authentication and RADIUS proxy settings.

<details>
<summary>Read tools (3)</summary>

| Tool | Description |
|---|---|
| `getApplicationAcl` | [DEPRECATED] Get application control rules. Alias for `getAppControlRules`. |
| `getDot1xConfig` | Get 802.1X switch port authentication setting. Alias for `getSwitchDot1xSetting`. |
| `getRadiusProxyConfig` | Get global RADIUS proxy configuration (controller-level, no siteId). |

</details>

### Firewall IDS / IPS

Intrusion detection and prevention system configuration.

<details>
<summary>Read tools (1)</summary>

| Tool | Description |
|---|---|
| `getGlobalSecuritySetting` | [DEPRECATED] Use `getThreatList` instead. Get global security/threat management list. Alias for `getThreatList`. |

</details>

### Firewall Traffic & QoS

Traffic shaping, QoS policies, application control, URL filtering, and MAC filtering.

<details>
<summary>Read tools (11)</summary>

| Tool | Description |
|---|---|
| `getAppControlCategories` | Get application control category list. |
| `getAppControlRules` | Get application control rules (paginated). |
| `getBandwidthCtrlDetail` | Get bandwidth control details for a site. |
| `getDscpConfig` | [DEPRECATED] Alias for `getQosPolicy`. |
| `getGatewayQosClassRules` | Get gateway QoS class rules (paginated). |
| `getMacFilterDetail` | Get MAC filter general setting. Alias for `getMacFilteringGeneralSetting`. |
| `getQosMarkingRule` | [DEPRECATED] Alias for `getQosPolicy`. |
| `getQosPolicy` | Get QoS policy configuration for a site. |
| `getQosPolicyRule` | [DEPRECATED] Alias for `getQosPolicy`. |
| `getTrafficPriority` | Get traffic priority rules for a site. |
| `getTrafficStats` | [DEPRECATED] Use `getDashboardTrafficActivities` instead. Get WAN usage statistics. Alias for `getWanUsageStats`. |
| `getUrlFilterBlacklist` | Get URL filter MAC deny list. Alias for `getGridDenyMacFiltering`. |
| `getUrlFilterRules` | Get URL filter gateway rules. Alias for `getGridGatewayRule`. |
| `getUrlFilterWhitelist` | Get URL filter MAC allow list. Alias for `getGridAllowMacFiltering`. |

</details>

### Insight

Site-level security insights: threat events, WIDS, rogue AP detection, and VPN tunnel stats.

<details>
<summary>Read tools (6)</summary>

| Tool | Description |
|---|---|
| `getRogueAps` | Gets rogue access points detected in a site. |
| `getVpnTunnelStats` | Gets VPN tunnel statistics for a site. |
| `getWids` | Gets WIDS (Wireless Intrusion Detection) information for a site. Reads all pages. |
| `listSiteThreatManagement` | Lists site-level threat management events. |

</details>

### Logs

Site-level and global event, alert, and audit logs.

<details>
<summary>Read tools (5)</summary>

| Tool | Description |
|---|---|
| `listGlobalAlerts` | Lists global alert logs across all sites. |
| `listGlobalEvents` | Lists global event logs across all sites. |
| `listSiteAlerts` | Lists site alert logs. |
| `listSiteAuditLogs` | Lists site audit logs. |
| `listSiteEvents` | Lists site event logs. |

</details>

### Maintenance

Controller and site backups, restores, and rogue AP exports.

<details>
<summary>Read tools (5)</summary>

| Tool | Description |
|---|---|
| `getBackupFileList` | List available controller backup files. |
| `getBackupResult` | Get the result of the most recent controller backup operation. |
| `getRestoreResult` | Get the result of the most recent controller restore operation. |
| `getRogueApExport` | Export Rogue AP scan results for a site in CSV or Excel format. |
| `getSiteBackupFileList` | List available backup files for a site. |
| `getSiteBackupResult` | Get the backup result for a site. |

</details>

<details>
<summary>Write tools (8)</summary>

| Tool | Description |
|---|---|
| `backupController` | Trigger a controller configuration backup to the self/cloud server. |
| `backupControllerToFileServer` | Trigger a controller configuration backup to an external file server (FTP/SFTP). |
| `backupSites` | Trigger a multi-site configuration backup to the self/cloud server (up to 300 sites). |
| `backupSitesToFileServer` | Trigger a multi-site configuration backup to an external file server (up to 300 sites). |
| `restoreController` | Restore controller configuration from a backup file on the self/cloud server. |
| `restoreControllerFromFileServer` | Restore controller configuration from a backup file on an external file server. |
| `restoreSites` | Restore multiple site configurations from backup files on the self/cloud server. |
| `restoreSitesFromFileServer` | Restore multiple site configurations from backup files on an external file server. |

</details>

### Network

WAN/LAN configuration, SSIDs, WLAN groups, routing, NAT, DHCP, DNS, firewall settings, bandwidth control, and related network services.

<details>
<summary>Read tools (55)</summary>

| Tool | Description |
|---|---|
| `getAccessControl` | Gets controller access control configuration. |
| `getAlg` | Gets ALG (Application Layer Gateway) configuration. |
| `getApLoadBalance` | [DEPRECATED] Use `getSitesApsLoadBalance` instead. Same endpoint, retained for backward compatibility. getSitesApsLoadBalance is the canonical tool name. |
| `getApOfdmaConfig` | [DEPRECATED] Use `getSitesApsOfdma` instead. Same endpoint, retained for backward compatibility. getSitesApsOfdma is the canonical tool name. |
| `getApplicationControlStatus` | Gets application control status for a site. |
| `getBandwidthControl` | Gets global bandwidth control configuration. |
| `getDdnsGrid` | Gets DDNS entries (paginated). |
| `getDhcpReservationGrid` | Gets DHCP reservations (paginated). |
| `getDisableNatList` | Gets the list of wired networks with NAT disabled (paginated). |
| `getDnsCacheDataList` | Gets the DNS cache data list (paginated). |
| `getDnsCacheSetting` | Gets DNS cache setting. |
| `getDnsProxy` | Gets DNS proxy configuration. |
| `getFirewallSetting` | Gets the site-global firewall settings returned by the official Omada firewall endpoint. |
| `getGridBandwidthCtrlRule` | Gets bandwidth control rules (paginated). |
| `getGridIpMacBinding` | Gets IP-MAC binding entries (paginated). |
| `getGridOtoNats` | Gets 1:1 NAT rules (paginated). |
| `getGridPolicyRouting` | Gets policy routing rules (paginated). |
| `getGridSessionLimitRule` | Gets per-rule session limit rules (paginated). |
| `getGridVirtualWan` | Gets virtual WAN list (paginated). |
| `getIgmp` | Gets IGMP snooping and proxy setting. |
| `getInterfaceLanNetwork` | Gets interface-level LAN network bindings. Optional type filter (0=WAN, 1=LAN). |
| `getInterfaceLanNetworkV2` | Get interface-level LAN network bindings (v2 API). Returns richer per-interface VLAN and network data. |
| `getInternet` | [DEPRECATED] Use `getInternetInfo` instead. Gets full WAN/Internet configuration for the site gateway. |
| `getInternetBasicPortInfo` | Gets WAN port summary/basic info for the site gateway. |
| `getInternetInfo` | Gets internet configuration information for a site. |
| `getInternetLoadBalance` | Gets WAN load balancing configuration (failover/load balance). |
| `getIpMacBindingGeneralSetting` | Gets IP-MAC binding global toggle setting. |
| `getIptvSetting` | Gets IPTV service configuration for the site. |
| `getIspBandScan` | Gets ISP band scan results for a WAN port. Requires `portUuid`. |
| `getLanClientCount` | Gets client distribution breakdown across LAN segments. |
| `getLanDnsRules` | Gets LAN DNS rules for the site (paginated). |
| `getLanNetworkList` | [DEPRECATED] Use `getLanNetworkListV2` instead. This tool aggregates all pages; getLanNetworkListV2 is explicitly paginated. |
| `getLanNetworkListV2` | Get the LAN network list using the v2 API, with richer VLAN and DHCP data (paginated). |
| `getLanProfileEsUsage` | Gets EAP/switch device usage for a LAN profile. Requires `profileId`. |
| `getLanProfileList` | Gets the list of LAN profiles configured in a site. |
| `getLldpSetting` | Gets LLDP global setting. |
| `getLtePortConfig` | Gets LTE/cellular WAN port configuration. |
| `getMulticastRateLimit` | Get multicast rate limit settings for a site. |
| `getNtpSetting` | Gets NTP server configuration and synchronisation status. |
| `getOspfInterface` | Gets OSPF interface configuration for the site gateway. |
| `getOspfNeighbors` | Gets OSPF neighbor devices for the site gateway. |
| `getOspfProcess` | Gets OSPF process configuration for the site gateway. |
| `getPortForwardingStatus` | Gets port forwarding status and rules. Required: `type` (`user` or `upnp`). Optional pagination: `page` (default 1), `pageSize` (default 10). |
| `getRateLimitProfiles` | Gets the list of available rate limit profiles for bandwidth control. |
| `getRemoteLoggingSetting` | Gets remote logging (syslog) configuration. |
| `getSessionLimit` | Gets session limit global setting. |
| `getSnmpSetting` | Gets SNMP configuration (version, community string). |
| `getSshSetting` | Gets SSH settings for a site. |
| `getSsidDetail` | Gets detailed information for a specific SSID. Required: `wlanId` and `ssidId`. |
| `getSsidList` | Gets the list of SSIDs in a WLAN group. |
| `getStaticRoutingInterfaceList` | Gets available interfaces for static routing. |
| `getSwitchVlanInterface` | Gets VLAN interface configuration for a specific switch. Requires `switchMac`. |
| `getSyslogConfig` | Deprecated; alias of `getRemoteLoggingSetting` for controller syslog configuration. |
| `getUpnpSetting` | Gets UPnP setting for the site gateway. |
| `getVpnSettings` | Gets VPN settings for a site. |
| `getVrrpConfig` | Gets VRRP configuration for OSW devices. |
| `getWanHealthDetail` | [DEPRECATED] Alias for the WAN health tool; kept for backward compatibility. Requires `gatewayMac`. |
| `getWanIspProfile` | Gets ISP scan profile result for a WAN port. Requires `portUuid`. |
| `getWanLanStatus` | Gets WAN-LAN connectivity status for a site. |
| `getWanNatConfig` | Gets one-to-one NAT rules (paginated). |
| `getWanPortDetail` | [DEPRECATED] Use `getWanPortsConfig` instead. Gets detailed WAN port configuration for all gateway WAN ports. |
| `getWanPortsConfig` | Gets per-port WAN configuration including connection type and IP settings. |
| `getWanQosConfig` | Gets QoS configuration for gateway WAN ports. |
| `getWanUsageStats` | [DEPRECATED] Use `getDashboardTrafficActivities` instead. Gets WAN traffic usage statistics for the site. |
| `getWlanGroupList` | Gets the list of WLAN groups configured in a site. |
| `listAllSsids` | Lists wireless SSIDs across all WLAN groups. Optional `type` (1 AP, 2 wireless router, 3 both; default 3). |
| `listEapAcls` | Lists access point (EAP) ACL rules. |
| `listGroupProfiles` | Lists group profiles (IP, MAC, or port groups). |
| `listOsgAcls` | Lists gateway (OSG) ACL rules. |
| `listPolicyRoutes` | [DEPRECATED] Use `getGridPolicyRouting` instead. This tool aggregates all pages; getGridPolicyRouting is paginated. |
| `listPortForwardingRules` | [DEPRECATED] Use `getPortForwardingList` instead. Lists NAT port forwarding rules. |
| `listRadiusProfiles` | Lists RADIUS authentication profiles. |
| `listSiteToSiteVpns` | Lists site-to-site VPN configurations. |
| `listStaticRoutes` | [DEPRECATED] Use `getGridStaticRouting` instead. This tool aggregates all pages; getGridStaticRouting returns a single paginated page. |
| `listTimeRangeProfiles` | Lists time range profiles. |

</details>

<details>
<summary>Write tools (13)</summary>

| Tool | Description |
|---|---|
| `createDhcpReservation` | Creates a DHCP reservation after validating the target LAN and optional IP address. |
| `createEapAcl` | Creates an EAP ACL rule with dry-run preview using the official Omada EAP ACL schema. |
| `createGatewayAcl` | Creates a gateway ACL rule with dry-run preview using the official Omada Gateway ACL schema. |
| `createSwitchAcl` | Creates a switch (OSW) ACL rule with dry-run preview using the official Omada SwitchACLConfig schema. |
| `deleteAcl` | Deletes an ACL rule with dry-run preview after confirming the ACL exists. |
| `deleteAppControlRule` | Deletes an application control rule with dry-run preview after confirming the rule exists. |
| `deleteBandwidthControlRule` | Deletes a bandwidth control rule with dry-run preview after confirming the rule exists. |
| `deleteDhcpReservation` | Deletes a DHCP reservation by MAC address with a dry-run preview option. |
| `setAccessControl` | Updates portal access control settings with dry-run preview and schema validation for pre-auth and free-auth policy entries. |
| `setAclConfigTypeSetting` | Updates the gateway ACL mode (`through profiles` or `custom`) with dry-run preview. |
| `setAppControlRule` | Creates or updates an application control rule with dry-run preview after validating the create/update payload shape, existing rule id, and referenced application ids. |
| `setBandwidthControlRule` | Creates or updates a bandwidth control rule with dry-run preview after validating the target rule id plus referenced LAN and WAN identifiers. |
| `setFirewallSetting` | Updates site firewall settings with dry-run preview using the official Omada Open API firewall endpoint. |
| `updateDhcpReservation` | Updates a DHCP reservation after validating the target LAN and optional IP address. |
| `updateEapAcl` | Updates an EAP ACL rule with dry-run preview after confirming the ACL exists. |
| `updateGatewayAcl` | Updates a gateway ACL rule with dry-run preview after confirming the ACL exists. |
| `updateSwitchAcl` | Updates a switch (OSW) ACL rule with dry-run preview after confirming the ACL exists. |

</details>

### Profiles

RADIUS, PPSK, service, QoS, schedule, group policy, VLAN, user role, and portal profiles.

<details>
<summary>Read tools (14)</summary>

| Tool | Description |
|---|---|
| `getAppGroupProfile` | [DEPRECATED] Get MAC group profiles. Alias for `getGroupPolicyDetail` with groupType="2". |
| `getBuiltinRadiusUsers` | Get built-in RADIUS server user list (paginated). |
| `getGoogleLdapProfile` | Get Google LDAP profile configuration for a site. |
| `getGroupPolicyDetail` | Get group policy profiles filtered by group type. |
| `getIpGroupProfile` | [DEPRECATED] Get IP group profiles. Alias for `getGroupPolicyDetail` with groupType="0". |
| `getPortalProfile` | Get captive portal profiles for a site. |
| `getPpskNetworkProfile` | List PPSK network profiles for a site by type. |
| `getPpskUserGroup` | Get PPSK user group details for a specific profile. |
| `getPpskUserList` | [DEPRECATED] Alias for `getPpskUserGroup`. |
| `getQosProfile` | Get rate limit profiles. Alias for `getRateLimitProfiles`. |
| `getRadiusUserDetail` | [DEPRECATED] Alias for `getBuiltinRadiusUsers`. |
| `getScheduleProfile` | Get time range profiles. Alias for `listTimeRangeProfiles`. |
| `getServiceProfile` | Get service type profiles (paginated). Alias for `listServiceType`. |
| `getUrlGroupProfile` | [DEPRECATED] Get URL/port group profiles. Alias for `getGroupPolicyDetail` with groupType="1". |
| `getUserRoleProfile` | Get user role profiles from the controller (global, no siteId). |
| `getVlanProfile` | Get LAN/VLAN profiles. Alias for `getLanProfileList`. |

</details>

### Schedules

PoE, port, reboot, and firmware upgrade schedules.

<details>
<summary>Read tools (5)</summary>

| Tool | Description |
|---|---|
| `getPoeScheduleList` | List PoE schedules for a site. |
| `getPortScheduleList` | List port schedules for a site. |
| `getPortSchedulePorts` | List ports with port schedule assignments for a site. |
| `getRebootScheduleList` | List device reboot schedules for a site template. Requires `siteTemplateId`. |
| `getUpgradeScheduleList` | List firmware upgrade schedules for a site. |

</details>

### Security & Threat Management

Global threat intelligence, IPS alerts, and top-threat summaries.

<details>
<summary>Read tools (2)</summary>

| Tool | Description |
|---|---|
| `getThreatList` | Gets global threat management list. Required: `archived` (bool). Optional: `startTime`/`endTime` (seconds since epoch), `severity` (0=Critical, 1=Major, 2=Moderate/Concerning, 3=Minor, 4=Low), `page`, `pageSize`. |
| `getTopThreats` | Gets top threats from the global threat management view. Optional `start`/`end` (Unix seconds); default: last 24 hours. |

</details>

### Site & Client

Site listing, client monitoring, and client-level operational controls (rate limits, block/unblock, reconnect).

<details>
<summary>Read tools (14)</summary>

| Tool | Description |
|---|---|
| `getClient` | [DEPRECATED] Use `listClients` instead. When you have a client MAC, `getClientDetail` is also available. This tool filters the site client list in-process. |
| `getSiteCapacity` | Get site capacity settings including maximum device and client counts. |
| `getSiteDetail` | Get detailed information about a site, including name, region, timezone, and configuration. |
| `getSiteDeviceAccount` | Get device account settings for a site. |
| `getSiteNtpStatus` | Get NTP server status and configuration for a site. |
| `getSiteRememberSetting` | Get the remember device setting for a site. |
| `getSiteSpecification` | Get site specification including device limits and feature capabilities. |
| `getSiteTemplateConfig` | Get configuration settings for a site template. Requires `siteTemplateId`. |
| `getSiteTemplateDetail` | Get detailed information about a site template. Requires `siteTemplateId`. |
| `getSiteTemplateList` | List all site templates configured on the controller. |
| `getSiteUrl` | Get the URL associated with a site for OpenAPI access. |
| `listClients` | Lists active client devices for a site. |
| `listClientsActivity` | Gets client activity statistics over time. |
| `listClientsPastConnections` | Gets past connection history for clients. |
| `listMostActiveClients` | Gets the most active clients sorted by traffic usage. |
| `listSites` | Lists all sites configured on the controller. |

</details>

<details>
<summary>Write tools (5)</summary>

| Tool | Description |
|---|---|
| `blockClient` | Blocks a client from network access with an auditable mutation summary. |
| `disableClientRateLimit` | Disables bandwidth rate limiting for a specific client. |
| `reconnectClient` | Forces a client to reconnect with an auditable mutation summary. |
| `setClientRateLimit` | Sets custom bandwidth limits (download/upload) for a specific client. |
| `setClientRateLimitProfile` | Applies a predefined rate limit profile to a specific client. |
| `unblockClient` | Restores a blocked client to network access with an auditable mutation summary. |

</details>

<details>
<summary>Write tools (device-level, 2)</summary>

| Tool | Description |
|---|---|
| `rebootDevice` | Reboots a managed device with an auditable mutation summary. |
| `setDeviceLed` | Changes the LED of one AP, switch or gateway through its documented general-config route, after confirming the device and its type. |

</details>

### VPN

Site-to-site and client-to-site VPN configuration, tunnel details, and user management.

<details>
<summary>Read tools (6)</summary>

| Tool | Description |
|---|---|
| `getAdvancedVpnSetting` | Get advanced VPN configuration settings for a site. Alias for `getVpnSettings`. |
| `getIpsecTunnelDetail` | Get detailed config for a specific IPsec tunnel by ID. Alias for `getSiteToSiteVpnInfo`. |
| `getIpsecTunnelList` | List all site-to-site VPN (IPsec) tunnels. Alias for `listSiteToSiteVpns`. |
| `getVpnClientStatus` | Get status of client-to-site VPN clients. Alias for `listClientToSiteVpnClients`. |
| `getVpnRouteConfig` | [DEPRECATED] Use `getGridPolicyRouting` instead. This tool aggregates all pages; getGridPolicyRouting is paginated. |
| `getVpnUserDetail` | Get users for a specific client-to-site VPN server. |
| `getVpnUserList` | Get VPN users for a site (paginated). |

</details>

### Ported operations

Tools ported from sibling MIT-licensed Omada MCP projects (see [NOTICE.md](NOTICE.md)). Every route was re-verified against the bundled OpenAPI snapshots in `docs/openapi/`; candidates without a documented route, duplicates of existing tools and private-API tools were skipped and are listed in [docs/porting-skipped.md](docs/porting-skipped.md). All writes default to `dryRun: true`. Tools marked destructive carry `destructiveHint` and sit in categories that only the `admin` profile (or an explicit `OMADA_TOOL_CATEGORIES` grant) enables; `ops-write` only grants the non-destructive `updateClient` from this set.

<details>
<summary>Read tools (5)</summary>

| Tool | Category | Risk | Description |
|---|---|---|---|
| `getRfPlanningHistoryDetail` | `wireless-radio` | read | Gets one RF planning history entry, including the recommended and previous configuration. |
| `getServerInfo` | `controller` | read | Reports this MCP server package name/version and Node.js runtime. Local only; no controller request. |
| `getWlanExperienceIndex` | `wireless-radio` | read | Gets the site WLAN experience index from recent WLAN optimization scans. |
| `listRebootSchedules` | `schedules` | read | Lists device reboot schedules configured for a site. |
| `listRfPlanningHistory` | `wireless-radio` | read | Lists RF planning (WLAN optimization) history entries for a site. |

</details>

<details>
<summary>Write tools (49)</summary>

| Tool | Category | Risk | Description |
|---|---|---|---|
| `adoptDevice` | `devices-general` | write | Starts adoption of a pending device after checking it is in the site's pending list; optional device credentials are never echoed. |
| `applyRfPlanningHistory` | `wireless-radio` | destructive | Applies the recommended or previous configuration from an RF planning history entry. Admin profile only. |
| `cancelRfOptimization` | `wireless-radio` | write | Cancels a running WLAN (RF planning) optimization. |
| `createLanNetwork` | `network-lan` | write | Creates a LAN network with dry-run preview. |
| `createLanProfile` | `network-lan` | write | Creates a LAN (switch port) profile with dry-run preview. |
| `createPoeSchedule` | `schedules` | destructive | Creates a site PoE schedule (it powers PoE ports off outside the time range). Admin profile only. |
| `createPortForward` | `network-nat` | destructive | Creates a NAT port forwarding rule with dry-run preview. Admin profile only. |
| `createRebootSchedule` | `schedules` | destructive | Creates a site reboot schedule (it schedules device reboots). Admin profile only. |
| `createRoute` | `network-routing` | destructive | Creates a static route with dry-run preview. Admin profile only. |
| `createSsid` | `wireless-ssid` | write | Creates an SSID in an existing WLAN group (checked first) with dry-run preview; secrets are redacted from output. |
| `deleteAlertLogs` | `logs` | destructive | Permanently deletes alert logs (site or global); broad selections need explicit confirmation. Admin profile only. |
| `deleteEventLogs` | `logs` | destructive | Permanently deletes event logs (site or global); broad selections need explicit confirmation. Admin profile only. |
| `deleteLanNetwork` | `network-lan` | destructive | Deletes an existing LAN network after an existence preflight. Admin profile only. |
| `deletePoeSchedule` | `schedules` | destructive | Deletes an existing site PoE schedule after an existence preflight. Admin profile only. |
| `deletePortForward` | `network-nat` | destructive | Deletes an existing NAT port forwarding rule after an existence preflight. Admin profile only. |
| `deleteRebootSchedule` | `schedules` | destructive | Deletes an existing site reboot schedule after an existence preflight. Admin profile only. |
| `deleteRfPlanningHistory` | `wireless-radio` | destructive | Deletes an RF planning history entry. Admin profile only. |
| `deleteRoute` | `network-routing` | destructive | Deletes an existing static route after an existence preflight. Admin profile only. |
| `deleteSsid` | `wireless-ssid` | destructive | Deletes an SSID (clients disconnect); preview shows the current SSID detail. Admin profile only. |
| `resetLogNotificationSettings` | `logs` | destructive | Resets log notification settings to defaults (site or global); preview shows current settings. Admin profile only. |
| `resolveAlertLogs` | `logs` | write | Marks site alert logs as resolved; broad selections need explicit confirmation. |
| `setGatewayWanConnect` | `devices-gateway` | destructive | Connects or disconnects a gateway WAN port; disconnecting can take the site offline. Admin profile only. |
| `setIpsSetting` | `firewall-ids` | destructive | Modifies the site IDS/IPS configuration with a preview of the current configuration. Admin profile only. |
| `setSiteLed` | `sites` | write | Enables or disables the site-wide device LED setting with preview. |
| `setSwitchNetworks` | `devices-switch` | destructive | Batch modifies switch VLAN interfaces with a preview of the current list. Admin profile only. |
| `startCableTest` | `devices-switch` | destructive | Starts a cable test on explicit switch ports of a switch known to the site (may briefly interrupt link); read results with getCableTestFullResults. |
| `startFirmwareUpgrade` | `devices-general` | destructive | Starts an online firmware upgrade of one device known to the site (device reboots); preview shows the device and current firmware info. Admin profile only. |
| `startRfOptimization` | `wireless-radio` | destructive | Starts WLAN (RF planning) optimization; can change AP channels/power. Admin profile only. |
| `updateAuditNotificationSettings` | `logs` | destructive | Modifies audit log notification settings (site or global) with preview; a webhook change needs `confirmWebhookChange: true`. Admin profile only. |
| `updateBandSteering` | `wireless-radio` | write | Updates the site band steering setting with a preview of the current setting. |
| `updateBeaconControl` | `wireless-radio` | write | Updates the site beacon control and airtime fairness setting with a preview of the current setting. |
| `updateClient` | `clients` | write | Sets a client's display name with dry-run preview. |
| `updateLanNetwork` | `network-lan` | destructive | Updates an existing LAN network after an existence preflight; preview shows the current record. Admin profile only. |
| `updateLanProfile` | `network-lan` | destructive | Updates an existing LAN (switch port) profile after an existence preflight; preview shows the current record. Admin profile only. |
| `updateLogNotificationSettings` | `logs` | write | Modifies log notification settings (site or global, v2 route) with a preview of the current settings; a webhook change needs `confirmWebhookChange: true` and public https destinations. |
| `updateMesh` | `wireless-radio` | destructive | Updates the site mesh setting with a preview of the current setting. Admin profile only. |
| `updatePoeSchedule` | `schedules` | destructive | Replaces an existing site PoE schedule after an existence preflight. Admin profile only. |
| `updatePortForward` | `network-nat` | destructive | Updates an existing NAT port forwarding rule after an existence preflight; preview shows the current record. Admin profile only. |
| `updateRebootSchedule` | `schedules` | destructive | Replaces an existing site reboot schedule after an existence preflight. Admin profile only. |
| `updateRfPlanningConfig` | `wireless-radio` | write | Modifies the RF planning deploy configuration with a preview of the current configuration. |
| `updateRoaming` | `wireless-radio` | write | Updates the site roaming setting with a preview of the current setting. |
| `updateRoute` | `network-routing` | destructive | Updates an existing static route after an existence preflight; preview shows the current record. Admin profile only. |
| `updateSsidHotspotV2` | `wireless-ssid` | write | Updates SSID Hotspot 2.0 with a preview of the current SSID detail. |
| `updateSsidMacFilter` | `wireless-ssid` | destructive | Updates SSID MAC filter settings with a preview of the current SSID detail. Admin profile only. |
| `updateSsidMultiCastConfig` | `wireless-ssid` | write | Updates SSID multicast/broadcast management settings with a preview of the current SSID detail. |
| `updateSsidRateControl` | `wireless-ssid` | write | Updates SSID 802.11 data rate control settings with a preview of the current SSID detail. |
| `updateSsidRateLimit` | `wireless-ssid` | write | Updates SSID SSID and per-client rate limit settings with a preview of the current SSID detail. |
| `updateSsidWlanSchedule` | `wireless-ssid` | destructive | Updates SSID WLAN schedule with a preview of the current SSID detail. Admin profile only. |
| `updateWanPortSetting` | `network-wan` | destructive | Modifies one WAN port's settings with a preview of the current WAN configuration. Admin profile only. |

</details>

### API operation map

Maps each Omada Open API operation ID to the MCP tool that implements it.

<details>
<summary><strong>Supported Omada API Operations</strong> — compatibility table mapping Omada API operation IDs to MCP tool names</summary>

| Operation ID                        | Description                                               | Tool                          |
| ----------------------------------- | --------------------------------------------------------- | ----------------------------- |
| `addRule` | Create an application control rule with dry-run support. | `setAppControlRule` |
| `batchModifyPortConfig` | Update multiple gateway ports with dry-run support. | `setGatewayConfig` |
| `createBandwidthCtrlRule` | Create a bandwidth control rule with dry-run support. | `setBandwidthControlRule` |
| `createDhcpReservation` | Create a DHCP reservation for the site after LAN/IP validation and duplicate-IP preflight. | `createDhcpReservation` |
| `createEapAcl` | Create an EAP ACL with dry-run support. | `createEapAcl` |
| `createOsgAcl` | Create a gateway ACL with dry-run support. | `createGatewayAcl` |
| `createOswAcl` | Create a switch ACL with dry-run support. | `createSwitchAcl` |
| `deleteAcl` | Delete an ACL rule with dry-run support. | `deleteAcl` |
| `deleteBandwidthCtrlRule` | Delete a bandwidth control rule with dry-run support. | `deleteBandwidthControlRule` |
| `deleteRules` | Delete an application control rule with dry-run support. | `deleteAppControlRule` |
| `deleteSitesSettingServiceDhcp` | Delete an existing DHCP reservation for the site. | `deleteDhcpReservation` |
| `disableClientRateLimit` | Disable rate limiting for a specific client, removing any bandwidth.... | `disableClientRateLimit` |
| `editRule` | Update an application control rule with dry-run support. | `setAppControlRule` |
| `getAccessControl` | Get controller access control configuration. | `getAccessControl` |
| `getAclConfigTypeSetting` | Get gateway ACL config mode for the site gateway. | `getAclConfigTypeSetting` |
| `getAclConfigTypeSetting` | Get the ACL configuration type setting for the site gateway (L2 or .... | `getAclConfigTypeSetting` |
| `getAlerts` | List global alert logs across all sites.                  | `listGlobalAlerts` |
| `getAlg` | Get ALG (Application Layer Gateway) configuration for the site gateway. | `getAlg` |
| `getAllCloudUsersExcludeRoot` | List all cloud users excluding root. | `getAllCloudUsers` |
| `getAllDeviceBySite` | Get all devices in a site including offline and disconnected devices. | `getAllDeviceBySite` |
| `getAllLocalUsersExcludeRoot` | List all local users excluding root. | `getAllLocalUsers` |
| `getAllRoles` | [DEPRECATED] Use `getUserRoleProfile` instead. List all roles. | `getAllRoles` |
| `getAp` | Get detailed info for a specific access point.            | `getApDetail` |
| `getApDetail` | Fetch full configuration and status for a specific access point: mo.... | `getApDetail` |
| `getApGeneralConfig` | Get general configuration for an access point. | `getApGeneralConfig` |
| `getApLldpConfig` | Get LLDP (Link Layer Discovery Protocol) configuration for an acces.... | `getApLldpConfig` |
| `getApLoadBalanceConfig` | Get AP load balance configuration. | `getApLoadBalance` |
| `getApOfdmaConfig` | [DEPRECATED] Use `getSitesApsOfdma` instead. Same endpoint, retained for backward compatibility. getSitesApsOfdma is the canonical tool name. | `getApOfdmaConfig` |
| `getAppControlCategories` | Get application control category list. | `getAppControlCategories` |
| `getAppControlRules` | Get application control rules (paginated). | `getAppControlRules` |
| `getAppGridUsers` | List all users in app grid view. | `getAllUsersApp` |
| `getApplicationControlStatus` | Get application control status for a site.                | `getApplicationControlStatus` |
| `getApRadios` | Get radio info for a specific access point.               | `getApRadios` |
| `getApRadios` | Get radio status for a specific access point: 2.4GHz and 5GHz band .... | `getApRadios` |
| `getApSnmpConfig` | Get SNMP configuration for an access point. | `getApSnmpConfig` |
| `getApUplinkConfig` | Get the uplink configuration for an access point. | `getApUplinkConfig` |
| `getAttackDefenseSetting` | Get the DDoS and attack defense configuration, including flood prot.... | `getAttackDefenseSetting` |
| `getAuditLogSettingForGlobal` | Get global audit log notification settings for the controller. | `getAuditLogSettingForGlobal` |
| `getAuditLogSettingForSite` | Get site-level audit log notification settings, including audit eve.... | `getAuditLogSettingForSite` |
| `getAuditLogsForGlobal` | Get global audit logs (paginated). | `getAuditLogsForGlobal` |
| `getAvailableRole` | List available roles. | `getAvailableRoles` |
| `getBackupResult` | Get controller backup result. | `getBackupResult` |
| `getBandSteeringSetting` | Get the band steering configuration. | `getBandSteeringSetting` |
| `getBandwidthControl` | Get the global bandwidth control configuration for the site. | `getBandwidthControl` |
| `getBandwidthCtrl` | [DEPRECATED] Use `getBandwidthControl` instead. Get the global bandwidth control configuration for the site. | `getBandwidthControl` |
| `getBandwidthCtrlDetail` | Get bandwidth control details for a site. | `getBandwidthCtrlDetail` |
| `getBeaconControlSetting` | Get the beacon control setting, which manages 802.11 beacon transmi.... | `getBeaconControlSetting` |
| `getCableTestLogs` | Get cable test logs for a switch. | `getCableTestLogs` |
| `getCertificate` | Get certificate configuration. | `getCertificate` |
| `getChannelLimitSetting` | [DEPRECATED] Get the channel limit setting that restricts which cha.... | `getChannelLimitSetting` |
| `getChannels` | Get channel distribution and utilization across all APs. | `getChannels` |
| `getClient` | [DEPRECATED] Use `listClients` instead. When you have a client MAC, `getClientDetail` is also available. This tool filters the site client list in-process. | `getClient` |
| `getClientActiveTimeout` | Get the client inactivity timeout setting. | `getClientActiveTimeout` |
| `getClientActivity` | Get client activity statistics over time.                 | `listClientsActivity` |
| `getClientDetail` | Get full detail for a specific client by MAC address, including con.... | `getClientDetail` |
| `getClientHistoryDataEnable` | Get client history data enable setting. | `getClientHistoryDataEnable` |
| `getClientsDistribution` | Get client count distribution by connection type and band (wired, 2.... | `getClientsDistribution` |
| `getClientToSiteVpnServerInfo` | Get detailed configuration for a specific client-to-site VPN server.... | `getClientToSiteVpnServerInfo` |
| `getCloudAccessStatus` | Get cloud access status. | `getCloudAccessStatus` |
| `getCloudUserInfo` | Get cloud user info. | `getCloudUserInfo` |
| `getControllerPort` | Get controller port setting. | `getControllerPort` |
| `getControllerStatus` | Get the Omada controller health and status, including running state.... | `getControllerStatus` |
| `getDashboardMostActiveEaps` | Get the most active access points from the site dashboard by traffic. | `getDashboardMostActiveEaps` |
| `getDashboardPoEUsage` | Get PoE (Power over Ethernet) usage statistics for a site, showing .... | `getDashboardPoEUsage` |
| `getDashboardSwitchSummary` | Get switch summary for a site dashboard: total switch count, total .... | `getDashboardSwitchSummary` |
| `getDashboardTopCpuUsage` | Get the top devices by CPU usage for a site, useful for identifying.... | `getDashboardTopCpuUsage` |
| `getDashboardTopMemoryUsage` | Get top memory usage data for devices from the site dashboard. | `getDashboardTopMemoryUsage` |
| `getDashboardTrafficActivities` | Get traffic activity data and throughput summary from the site dashboard. | `getDashboardTrafficActivities` |
| `getDashboardWifiSummary` | Get WiFi summary for a site dashboard: total APs, connected AP coun.... | `getDashboardWifiSummary` |
| `getDataRetention` | Get data retention settings. | `getDataRetention` |
| `getDdnsGrid` | Get DDNS (Dynamic DNS) entries for the site gateway. | `getDdnsGrid` |
| `getDevice` | [DEPRECATED] Use `listDevices` instead. This alias filters the device list in-process to return a single device; there is no separate device-detail API. | `getDevice` |
| `getDeviceAccessManagement` | Get the device access management settings, controlling which device.... | `getDeviceAccessManagement` |
| `getDeviceList` | List devices assigned to a site.                          | `listDevices`, ~~`getDevice`~~ [DEPRECATED] |
| `getDhcpReservationGrid` | Get DHCP reservations for the site. | `getDhcpReservationGrid` |
| `getDisableNatList` | Get the list of wired networks with NAT disabled (paginated). | `getDisableNatList` |
| `getDnsCacheDataList` | Get the DNS cache data list for the site (paginated). | `getDnsCacheDataList` |
| `getDnsCacheSetting` | Get DNS cache setting for the site gateway. | `getDnsCacheSetting` |
| `getDnsProxy` | Get DNS proxy configuration for the site gateway. | `getDnsProxy` |
| `getEapAclList` | List access point ACL rules.                              | `listEapAcls` |
| `getEapDot1xSetting` | Get the 802.1X EAP setting for access points, controlling port-base.... | `—` |
| `getEvents` | List global event logs across all sites.                  | `listGlobalEvents` |
| `getExpImprove` | Get experience improvement setting. | `getExperienceImprovement` |
| `getFirewallSetting` | Get the site-global firewall settings returned by the official Omada firewall endpoint. | `getFirewallSetting` |
| `getFirewallSetting` | Get the site-global firewall settings returned by the official Omada firewall endpoint. | `getFirewallSetting` |
| `getFirmwareInfo` | Get the latest available firmware information for a device. | `getFirmwareInfo` |
| `getGateway` | Get detailed info for a specific gateway.                 | `getGatewayDetail` |
| `getGatewayDetail` | Fetch full configuration and status for a specific gateway: model, .... | `getGatewayDetail` |
| `getGatewayLanPortStatus` | Get LAN port status for a specific gateway.               | `getGatewayLanStatus` |
| `getGatewayLanStatus` | Get LAN port status for a specific gateway: port link state, speed,.... | `getGatewayLanStatus` |
| `getGatewayPorts` | Get port info for a specific gateway.                     | `getGatewayPorts` |
| `getGatewayPorts` | Get all WAN and LAN port details for a specific gateway: link statu.... | `getGatewayPorts` |
| `getGatewayQosClassRules` | Get gateway QoS class rules (paginated). | `getGatewayQosClassRules` |
| `getGatewayWanPortStatus` | Get WAN port status for a specific gateway.               | `getGatewayWanStatus` |
| `getGatewayWanStatus` | Get the WAN port status and connectivity information for a specific.... | `getGatewayWanStatus` |
| `getGeneralSettings` | Get the global general settings for the Omada controller, including.... | `getGeneralSettings` |
| `getGernalSettings_1` | Get global dashboard overview without client data. | `getGlobalDashboardOverview` |
| `getGlobalMFAStatus` | Get global MFA status. | `getMfaStatus` |
| `getGlobalThreatList` | Get global view threat management list.                   | `getThreatList` |
| `getGoogleLdapProfile` | Get Google LDAP profile configuration for a site. | `getGoogleLdapProfile` |
| `getGridActiveClients` | List active clients connected to a site.                  | `listClients`, ~~`getClient`~~ [DEPRECATED] |
| `getGridAdoptedDevicesStatByGlobal` | Query statistics for global adopted devices.              | `listDevicesStats`            |
| `getGridAllowList` | Get the IPS allow list (paginated). | `getGridAllowList` |
| `getGridAllowMacFiltering` | Get the MAC address allow-list entries (paginated). | `getGridAllowMacFiltering` |
| `getGridBandwidthCtrlRule` | Get bandwidth control rules for the site gateway. | `getGridBandwidthCtrlRule` |
| `getGridBlockList` | Get the IPS block list (paginated). | `getGridBlockList` |
| `getGridClientHistory` | Get per-client connection history (paginated). | `getGridClientHistory` |
| `getGridDashboardTunnelStats` | Get VPN tunnel statistics for the grid dashboard view. | `getGridDashboardTunnelStats` |
| `getGridDenyMacFiltering` | Get the MAC address deny-list entries (paginated). | `getGridDenyMacFiltering` |
| `getGridEapRule` | Get the URL filter AP rules (paginated). | `getGridEapRule` |
| `getGridGatewayRule` | Get the URL filter gateway rules (paginated). | `getGridGatewayRule` |
| `getGridIpMacBinding` | Get IP-MAC binding entries for the site. | `getGridIpMacBinding` |
| `getGridIpsecFailover` | Get IPsec failover configuration (paginated). | `getGridIpsecFailover` |
| `getGridKnownClients` | Get historical known clients list (paginated). | `getGridKnownClients` |
| `getGridOtoNats` | Get 1:1 NAT rules for the site gateway. | `getGridOtoNats` |
| `getGridPastConnections` | Get client past connection history.                       | `listClientsPastConnections` |
| `getGridPendingDevices` | List devices pending adoption in a site.                  | `listPendingDevices` |
| `getGridPolicyRouting` | Get policy routing rules for the site gateway. | `getGridPolicyRouting` |
| `getGridSessionLimitRule` | Get per-rule session limit rules for the site gateway. | `getGridSessionLimitRule` |
| `getGridSignature` | Get the IPS signature list (paginated). | `getGridSignature` |
| `getGridStaticRouting` | Get static routing rules for the site gateway with explicit pagination. | `getGridStaticRouting` |
| `getGridVirtualWan` | Get virtual WAN list for the site gateway. | `getGridVirtualWan` |
| `getGroupProfileList` | List group profiles (IP, MAC, port groups).               | `listGroupProfiles` |
| `getGroupProfilesByType` | Get group profiles filtered by type (e.g. | `getGroupProfilesByType` |
| `getIgmp` | Get IGMP (Internet Group Management Protocol) setting for the site. | `getIgmp` |
| `getInterfaceLanNetwork` | Get interface-level LAN network bindings. | `getInterfaceLanNetwork` |
| `getInterference` | Get top RF interference sources detected by APs. | `getInterference` |
| `getInternet` | [DEPRECATED] Use `getInternetInfo` instead. Get internet configuration info for a site.               | `getInternetInfo` |
| `getInternet` | [DEPRECATED] Use `getInternetInfo` instead. Get full WAN/Internet configuration for the site gateway. | `getInternet` |
| `getInternetBasicPortInfo` | Get WAN port summary / basic info for the site gateway. | `getInternetBasicPortInfo` |
| `getInternetInfo` | Get internet configuration information for a site, including WAN se.... | `getInternetInfo` |
| `getInternetLoadBalance` | Get WAN load balancing configuration for the site gateway. | `getInternetLoadBalance` |
| `getIpsConfig` | Get the IPS (Intrusion Prevention System) global configuration, inc.... | `getIpsConfig` |
| `getIpsecVpnStats` | Get IPsec VPN tunnel statistics for a site (paginated), including a.... | `getIpsecVpnStats` |
| `getIptvSetting` | Get IPTV service configuration for the site. | `getIptvSetting` |
| `getIspBandScan` | Get ISP band scan results for a WAN port. Requires `portUuid`. | `getIspBandScan` |
| `getIspLoad` | Get per-WAN ISP link load over a time range. | `getIspLoad` |
| `getLanClientCount` | Get client distribution breakdown across LAN segments (wired, wireless, guest). | `getLanClientCount` |
| `getLanDnsRules` | Get LAN DNS rules configured for the site (paginated). | `getLanDnsRules` |
| `getLanNetworkList` | [DEPRECATED] Use `getLanNetworkListV2` instead. This tool aggregates all pages; getLanNetworkListV2 is explicitly paginated. | `getLanNetworkList` |
| `getLanProfileEsUsage` | Get EAP/switch device usage for a specific LAN profile. Requires `profileId`. | `getLanProfileEsUsage` |
| `getLanProfileList` | Get LAN profile list.                                     | `getLanProfileList` |
| `getLanProfileList` | Get the list of LAN profiles configured in a site. | `getLanProfileList` |
| `getLdapProfileList` | List all LDAP authentication profiles configured on the site. | `getLdapProfileList` |
| `getLldpSetting` | Get LLDP (Link Layer Discovery Protocol) global setting for the site. | `getLldpSetting` |
| `getLogging` | Get the controller logging configuration, including log levels and .... | `getLogging` |
| `getLogSettingForGlobal` | Get global log notification settings (v1), including global alert r.... | `getLogSettingForGlobal` |
| `getLogSettingForGlobalV2` | Get global log notification settings (v2), with extended notificati.... | `—` |
| `getLogSettingForSite` | Get site-level log notification settings (v1), including alert reci.... | `getLogSettingForSite` |
| `getLogSettingForSiteV2` | Get site-level log notification settings (v2), with extended notifi.... | `—` |
| `getLtePortConfig` | Get LTE/cellular WAN port configuration for the site gateway. | `getLtePortConfig` |
| `getMacAuthSetting` | Get the MAC authentication global setting. | `getMacAuthSetting` |
| `getMacAuthSsids` | Get per-SSID MAC authentication settings showing which SSIDs have M.... | `getMacAuthSsids` |
| `getMacFilteringGeneralSetting` | Get the MAC filtering global setting. | `getMacFilteringGeneralSetting` |
| `getMailServerStatus` | Get the mail server connection status for the controller. | `getMailServerStatus` |
| `getMeshSetting` | Get the mesh networking configuration including mesh topology mode .... | `getMeshSetting` |
| `getMeshStatistics` | Get mesh link statistics for an access point. | `getMeshStatistics` |
| `getMostActiveClients` | Get most active clients sorted by traffic.                | `listMostActiveClients` |
| `getMulticastRateLimitByOpenApi` | Get multicast rate limit setting. | `getMulticastRateLimit` |
| `getNtpServerStatus` | Get NTP server status for a site. | `getSiteNtpStatus` |
| `getNtpSetting` | Get NTP server configuration and synchronisation status for the site. | `getNtpSetting` |
| `getOsgAclList` | List gateway ACL rules.                                   | `listOsgAcls` |
| `getOsgCustomAclList` | Get the custom gateway ACL rules list (paginated). | `getOsgCustomAclList` |
| `getOspfInterface` | Get OSPF interface configuration for the site gateway. | `getOspfInterface` |
| `getOspfNeighbors` | Get OSPF neighbor devices for the site gateway. | `getOspfNeighbors` |
| `getOspfProcess` | Get OSPF process configuration for the site gateway. | `getOspfProcess` |
| `getOswAclList` | List switch ACL rules. | `getOswAclList` |
| `getOswAclList` | Get the switch ACL list (paginated). | `getOswAclList` |
| `getOswStackDetail` | Retrieve details for a switch stack.                      | `getSwitchStackDetail` |
| `getOswStackLagList` | Get Link Aggregation Group (LAG) list for a switch stack. | `getOswStackLagList` |
| `getOuiProfileList` | Get the OUI-based device profile list (paginated). | `getOuiProfileList` |
| `getPastClientNum` | Get historical client count trend over a time range. | `getPastClientNum` |
| `getPoeScheduleList` | List PoE schedules for a site. | `getPoeScheduleList` |
| `getPortalPort` | Get portal port setting. | `getPortalPort` |
| `getPortalProfile` | Get captive portal profiles for a site. | `getPortalProfile` |
| `getPortForwardingList` | List NAT port forwarding rules.                           | `getPortForwardingList` (prefer); ~~`listPortForwardingRules`~~ [DEPRECATED] |
| `getPortForwardingList` | Get a paginated page of NAT port forwarding rules for the site gateway. | `getPortForwardingListPage` |
| `getPortForwardingStatus` | Get port forwarding status and rules for a site. | `getPortForwardingStatus` |
| `getPortForwardStatus` | Get port forwarding status by type.                       | `getPortForwardingStatus` |
| `getPortScheduleList` | List port schedules for a site. | `getPortScheduleList` |
| `getPortSchedulePorts` | List ports with port schedules. | `getPortSchedulePorts` |
| `getPPSKProfiles` | List Private PSK (PPSK) profiles for the site by type. | `getPPSKProfiles` |
| `getPpskUserGroup` | Get PPSK user group details for a specific profile ID. | `getPpskUserGroup` |
| `getQosPolicy` | Get QoS policy configuration for a site. | `getQosPolicy` |
| `getRadioFrequencyPlanningConfig` | Get the RF planning configuration for the site, including frequency.... | `getRadioFrequencyPlanningConfig` |
| `getRadioFrequencyPlanningResult` | Get the RF planning result for the site. | `getRadioFrequencyPlanningResult` |
| `getRadiosConfig` | Get per-radio configuration for an access point. | `getRadiosConfig` |
| `getRadiusProfileList` | List RADIUS authentication profiles.                      | `listRadiusProfiles` |
| `getRadiusProxyConfig` | Get global RADIUS proxy configuration (controller-level). | `getRadiusProxyConfig` |
| `getRadiusServer` | Get the global RADIUS server configuration for the controller. | `getRadiusServer` |
| `getRadiusUserList` | List local RADIUS server users (paginated). | `getRadiusUserList` |
| `getRateLimitProfileList` | Get rate limit profile list.                              | `getRateLimitProfiles` |
| `getRateLimitProfiles` | Get the list of available rate limit profiles for a site. | `getRateLimitProfiles` |
| `getRebootScheduleList_1` | List reboot schedules for a site template. | `getRebootScheduleList` |
| `getRemoteBindingStatus` | Get remote binding status. | `getRemoteBindingStatus` |
| `getRemoteLogging` | Get the global syslog/remote logging configuration, including syslo.... | `getRemoteLogging` |
| `getRemoteLoggingSetting` | Get remote logging (syslog) configuration for the site. | `getRemoteLoggingSetting` |
| `getRestoreResult` | Get controller restore result. | `getRestoreResult` |
| `getRetention` | Get the data retention configuration for the controller, including .... | `getRetention` |
| `getRetryAndDroppedRate` | Get wireless retry rate and dropped packet rate over a time range. | `getRetryAndDroppedRate` |
| `getRFScanResult` | [DEPRECATED] Get the last RF scan results for an access point. | `getRFScanResult` |
| `getRoamingSetting` | Get the client roaming configuration, including 802.11r/k/v setting.... | `getRoamingSetting` |
| `getRogueAps` | Get rogue access points detected in a site.               | `getRogueAps` |
| `getRogueAps` | Get the list of rogue (unauthorized) access points detected by WIDS.... | `getRogueAps` |
| `getRole` | Get role detail. | `getRoleDetail` |
| `getRoutingTable` | Get the live routing table for a site filtered by type. | `getRoutingTable` |
| `getSelfServerFileList` | List controller backup files. | `getBackupFileList` |
| `getSelfServerSiteFileList` | List site backup files. | `getSiteBackupFileList` |
| `getServiceTypeSummary` | Get a summary of service type profiles for the site, including pred.... | `getServiceTypeSummary` |
| `getSessionLimit` | Get the session limit global setting for the site gateway. | `getSessionLimit` |
| `getSiteAlerts` | List site alert logs.                                     | `listSiteAlerts` |
| `getSiteAuditLogs` | List site audit logs.                                     | `listSiteAuditLogs` |
| `getSiteBackupResult` | Get site backup result. | `getSiteBackupResult` |
| `getSiteDeviceAccountSetting` | Get site device account setting. | `getSiteDeviceAccount` |
| `getSiteEntity` | Get site detail. | `getSiteDetail` |
| `getSiteEvents` | List site event logs.                                     | `listSiteEvents` |
| `getSiteList` | List controller sites.                                    | `listSites` |
| `getSiteRememberSettingByOpenApi` | Get site remember device setting. | `getSiteRememberSetting` |
| `getSitesApsChannelLimit` | Get AP channel-limit configuration. | `getSitesApsChannelLimit` |
| `getSitesApsPowerSaving` | Get AP power saving configuration. | `getSitesApsPowerSaving` |
| `getSiteSettingCap` | Get site capacity setting. | `getSiteCapacity` |
| `getSiteSpecification` | Get site specification. | `getSiteSpecification` |
| `getSiteTemplateConfiguration` | Get site template configuration. | `getSiteTemplateConfig` |
| `getSiteTemplateEntity` | Get site template detail. | `getSiteTemplateDetail` |
| `getSiteTemplateList` | List site templates. | `getSiteTemplateList` |
| `getSiteThreatManagementList` | List site-level threat management events.                 | `listSiteThreatManagement` |
| `getSiteToSiteVpnInfo` | Get detailed information about a specific site-to-site VPN by ID, i.... | `getSiteToSiteVpnInfo` |
| `getSiteToSiteVpnList` | List site-to-site VPN configurations.                     | `listSiteToSiteVpns` |
| `getSiteUrlByOpenApi` | Get site URL. | `getSiteUrl` |
| `getSnmpSetting` | Get SNMP configuration for the site. | `getSnmpSetting` |
| `getSpeedTestResults` | Get the last speed test results for an access point. | `getSpeedTestResults` |
| `getSshSetting` | Get SSH settings for a site.                              | `getSshSetting` |
| `getSshSetting` | Get SSH access settings for a site. | `getSshSetting` |
| `getSsidDetail` | Get detailed SSID configuration.                          | `getSsidDetail` |
| `getSsidDetail` | Get detailed information for a specific SSID (wireless network), in.... | `getSsidDetail` |
| `getSsidList` | Get SSID list for a WLAN group.                           | `getSsidList` |
| `getSsidList` | Get the list of SSIDs (wireless networks) configured in a WLAN group. | `getSsidList` |
| `getSsidListAll` | List SSIDs across all WLAN groups.                        | `listAllSsids` |
| `getSsidsBySite` | Get a flat SSID list filtered by device type. | `getSsidsBySite` |
| `getSslVpnServerSetting` | Get the SSL VPN server configuration, including port, protocol, and.... | `getSslVpnServerSetting` |
| `getStackNetworkList` | Get the VLAN network list for a switch stack. | `getStackNetworkList` |
| `getStackPorts` | Get port info for a switch stack.                         | `getStackPorts` |
| `getStackPorts` | Get all port information for a switch stack. | `getStackPorts` |
| `getStaticRoutingList` | List static routing rules.                                | `getGridStaticRouting` (prefer); ~~`listStaticRoutes`~~ [DEPRECATED] |
| `getSwitch` | Get detailed info for a specific switch.                  | `getSwitchDetail` |
| `getSwitchDetail` | Fetch full configuration and status for a specific switch: model, f.... | `getSwitchDetail` |
| `getSwitchDot1xSetting` | Get the 802.1X switch port authentication setting. | `—` |
| `getSwitchStackDetail` | Fetch detailed information for a specific switch stack. | `getSwitchStackDetail` |
| `getSwitchVlanInterface` | Get VLAN interface configuration for a specific switch. Requires `switchMac`. | `getSwitchVlanInterface` |
| `getSyslogConfig` | [DEPRECATED] Alias of `getRemoteLogging` for controller syslog configuration. | `getSyslogConfig` |
| `getThreatCount` | Get the global threat count grouped by severity level (critical, hi.... | `getThreatSeverity` |
| `getThreatDetail` | Get detailed information about a specific IPS threat event by its ID. | `getThreatDetail` |
| `getThreatList` | Get the global view threat management list. | `getThreatList` |
| `getTimeRangeProfileList` | List time range profiles.                                 | `listTimeRangeProfiles` |
| `getTopThreatList` | Get top threats from global threat management.            | `getTopThreats` |
| `getTopThreats` | Get the top threats from the global threat management view across a.... | `getTopThreats` |
| `getTrafficDistribution` | Get traffic distribution by protocol and application type over a ti.... | `getTrafficDistribution` |
| `getTrafficPriority` | Get traffic priority rules for a site. | `getTrafficPriority` |
| `getUiInterface` | Get the UI interface settings for the controller, including timeout.... | `getUiInterface` |
| `getUpgradeScheduleList` | List upgrade schedules for a site. | `getUpgradeScheduleList` |
| `getUpnpSetting` | Get UPnP (Universal Plug and Play) setting for the site. | `getUpnpSetting` |
| `getUrlFilterGeneral` | Get the URL filter global setting, including whether URL filtering .... | `getUrlFilterGeneral` |
| `getUserRoleProfile` | Get user role profiles from the controller (global). | `getUserRoleProfile` |
| `getVpn` | Get VPN settings for a site.                              | `getVpnSettings` |
| `getVpnSettings` | Get VPN configuration settings for a site. | `getVpnSettings` |
| `getVpnTunnelStats` | Get VPN tunnel statistics for a site.                     | `getVpnTunnelStats` |
| `getVpnTunnelStats` | Get VPN tunnel statistics for a site (paginated), including active .... | `getVpnTunnelStats` |
| `getVpnUserDetail` | Get users for a specific client-to-site VPN server by ID. | `getVpnUserDetail` |
| `getVpnUserList` | Get VPN users for a site (paginated). | `getVpnUserList` |
| `getVrrpConfig` | Get VRRP configuration for OSW devices on the site. | `getVrrpConfig` |
| `getWanHealthDetail` | [DEPRECATED] Alias for the WAN health tool; kept for backward compatibility. Requires `gatewayMac`. | `getWanHealthDetail` |
| `getWanIspProfile` | Get ISP scan profile result for a WAN port. Requires `portUuid`. | `getWanIspProfile` |
| `getWanLanStatus` | Get WAN-LAN connectivity status for a site.               | `getWanLanStatus` |
| `getWanLanStatus` | Get the WAN and LAN connectivity status for a site. | `getWanLanStatus` |
| `getWanNatConfig` | Get one-to-one NAT configuration (WAN NAT rules) for the site gateway (paginated). | `getWanNatConfig` |
| `getWanPortDetail` | [DEPRECATED] Use `getWanPortsConfig` instead. Get detailed WAN port configuration for all gateway WAN ports on the site. | `getWanPortDetail` |
| `getWanPortsConfig` | Get WAN port settings for the site gateway. | `getWanPortsConfig` |
| `getWanQosConfig` | Get QoS configuration for gateway WAN ports on the site. | `getWanQosConfig` |
| `getWanUsageStats` | [DEPRECATED] Use `getDashboardTrafficActivities` instead. Get WAN traffic usage statistics and activity data for the site. | `getWanUsageStats` |
| `getWebhookForGlobal` | Get the global webhook notification settings, including webhook URL.... | `getWebhookForGlobal` |
| `getWebhookLogsForGlobal` | Get webhook dispatch logs (paginated). | `getWebhookLogsForGlobal` |
| `getWids` | Get WIDS information for a site.                          | `getWids` |
| `getWids` | Get Wireless Intrusion Detection System (WIDS) information for a si.... | `getWids` |
| `getWidsBlacklist` | Get the WIPS (Wireless Intrusion Prevention System) rogue AP blackl.... | `getWidsBlacklist` |
| `getWireguardSummary` | Get a summary of WireGuard VPN configurations for the site, includi.... | `getWireguardSummary` |
| `getWlanGroupList` | Get WLAN group list.                                      | `getWlanGroupList` |
| `getWlanGroupList` | Get the list of WLAN groups configured in a site. | `getWlanGroupList` |
| `listAllSsids` | List all wireless SSIDs across all WLAN groups in a site: SSID name.... | `listAllSsids` |
| `listClients` | List all network clients (wired and wireless) connected to a site. | `listClients` |
| `listClientsActivity` | Get client activity statistics over time from the dashboard. | `listClientsActivity` |
| `listClientsPastConnections` | Get client past connection list with historical connection data. | `listClientsPastConnections` |
| `listClientToSiteVpnClients` | List all client-to-site VPN client configurations on the site. | `listClientToSiteVpnClients` |
| `listClientToSiteVpnServers` | List all client-to-site VPN server configurations on the site, incl.... | `listClientToSiteVpnServers` |
| `listDevices` | List all provisioned (adopted) network devices in a site: gateways,.... | `listDevices` |
| `listDevicesStats` | Query statistics for global adopted devices with pagination and fil.... | `listDevicesStats` |
| `listEapAcls` | List EAP (access point) ACL rules for a site: wireless client acces.... | `listEapAcls` |
| `listGlobalAlerts` | List alert logs across all sites on the controller: threshold breac.... | `listGlobalAlerts` |
| `listGlobalEvents` | List system event logs across all sites on the controller. | `listGlobalEvents` |
| `listGroupProfiles` | List group profiles (IP groups, MAC groups, port groups) configured.... | `listGroupProfiles` |
| `listMdnsProfile` | List all Bonjour/mDNS service profiles configured on the site for c.... | `listMdnsProfile` |
| `listMostActiveClients` | Get the most active clients in a site, sorted by total traffic. | `listMostActiveClients` |
| `listOsgAcls` | List gateway (OSG) ACL rules for a site: firewall rules controlling.... | `listOsgAcls` |
| `listPendingDevices` | List devices discovered on the network but not yet adopted into thi.... | `listPendingDevices` |
| `listPolicyRoutes` | [DEPRECATED] Use `getGridPolicyRouting` instead. This tool aggregates all pages; getGridPolicyRouting is paginated. | `listPolicyRoutes` |
| `listPortForwardingRules` | [DEPRECATED] Use `getPortForwardingList` instead. List all NAT port forwarding rules for a site: external port, inter.... | `listPortForwardingRules` |
| `listRadiusProfiles` | List RADIUS authentication profiles configured for a site: server I.... | `listRadiusProfiles` |
| `listServiceType` | List service type profiles (paginated). | `listServiceType` |
| `listSiteAlerts` | List alert logs for a site: threshold breaches, device failures, se.... | `listSiteAlerts` |
| `listSiteAuditLogs` | List admin audit logs for a site: who made what configuration chang.... | `listSiteAuditLogs` |
| `listSiteEvents` | List system event logs for a site: device online/offline, client co.... | `listSiteEvents` |
| `listSites` | List all sites configured on the Omada controller. | `listSites` |
| `listSiteThreatManagement` | List site-level threat management events detected by IPS, with opti.... | `listSiteThreatManagement` |
| `listSiteToSiteVpns` | List site-to-site VPN configurations: tunnel name, remote IP, statu.... | `listSiteToSiteVpns` |
| `listStaticRoutes` | [DEPRECATED] Use `getGridStaticRouting` instead. This tool aggregates all pages; getGridStaticRouting returns a single paginated page. | `listStaticRoutes` |
| `listSwitchNetworks` | List VLAN network assignments for a switch. | `listSwitchNetworks` |
| `listTimeRangeProfiles` | List time range profiles configured for a site. | `listTimeRangeProfiles` |
| `listWireguard` | List WireGuard VPN tunnels (paginated). | `listWireguard` |
| `listWireguardPeers` | List WireGuard peers (paginated). | `listWireguardPeers` |
| `modifyAccessControl` | Update portal access control configuration with dry-run support. | `setAccessControl` |
| `modifyAclConfigTypeSetting` | Update gateway ACL config mode with dry-run support. | `setAclConfigTypeSetting` |
| `modifyAfcConfig` | Update AP AFC configuration with dry-run support. | `setApConfig` |
| `modifyAntennaGainConfig` | Update AP antenna gain settings with dry-run support. | `setApConfig` |
| `modifyApBridgeInfo` | Update AP bridge settings with dry-run support. | `setApConfig` |
| `modifyApChannelConfig` | Update AP channel configuration with dry-run support. | `setApConfig` |
| `modifyApLoadBalanceConfig` | Update AP load-balance settings with dry-run support. | `setApConfig` |
| `modifyApOfdmaConfig` | Update AP OFDMA settings with dry-run support. | `setApConfig` |
| `modifyApPort` | Update AP port settings with dry-run support. | `setApConfig` |
| `modifyApQosConfig` | Update AP QoS settings with dry-run support. | `setApConfig` |
| `modifyApServicesConfig` | Update AP service settings with dry-run support. | `setApConfig` |
| `modifyApTrunkSettingConfig` | Update AP trunk settings with dry-run support. | `setApConfig` |
| `modifyBandwidthCtrlRule` | Update a bandwidth control rule with dry-run support. | `setBandwidthControlRule` |
| `modifyConfigAdvanced` | Update gateway advanced settings with dry-run support. | `setGatewayConfig` |
| `modifyConfigGeneral` | Update gateway config/general settings with dry-run support. | `setGatewayConfig` |
| `modifyConfigRadios` | Update gateway radio configuration with dry-run support. | `setGatewayConfig` |
| `modifyConfigServices` | Update gateway services configuration with dry-run support. | `setGatewayConfig` |
| `modifyConfigWlans` | Update gateway WLAN configuration with dry-run support. | `setGatewayConfig` |
| `modifyEapAcl` | Update an EAP ACL with dry-run support. | `updateEapAcl` |
| `modifyFirewallSetting` | Update site firewall settings with dry-run support. | `setFirewallSetting` |
| `modifyFirewallSetting` | Update site firewall settings with dry-run support. | `setFirewallSetting` |
| `modifyGeneralConfig_1` | Update gateway general configuration with dry-run support. | `setGatewayConfig` |
| `modifyGeneralConfig_2` | Update AP general configuration with dry-run support. | `setApConfig` |
| `modifyIpSettingConfig` | Update AP IP settings with dry-run support. | `setApConfig` |
| `modifyIpv6SettingConfig` | Update AP IPv6 settings with dry-run support. | `setApConfig` |
| `modifyOsgAcl` | Update a gateway ACL with dry-run support. | `updateGatewayAcl` |
| `modifyOswAcl` | Update a switch ACL with dry-run support. | `updateSwitchAcl` |
| `modifyPortConfig` | Update a gateway port configuration with dry-run support. | `setGatewayConfig` |
| `modifyRadiosConfig` | Update AP radio settings with dry-run support. | `setApConfig` |
| `searchDevices` | Search for devices globally across all sites the user has access to. | `searchDevices` |
| `searchGlobalDevice` | Search for devices across all accessible sites.           | `searchDevices` |
| `setClientRateLimit` | Set custom rate limit (bandwidth control) for a specific client. | `setClientRateLimit` |
| `setClientRateLimitProfile` | Apply a predefined rate limit profile to a specific client. | `setClientRateLimitProfile` |
| `updateClientRateLimitSetting` | Set rate limit setting for a client.                      | `setClientRateLimit`, `setClientRateLimitProfile`, `disableClientRateLimit` |
| `updateSitesApsChannelLimit` | Update AP channel-limit configuration with dry-run support. | `setApChannelLimit` |
| `updateSitesApsPowerSaving` | Update AP power saving configuration with dry-run support. | `setApPowerSaving` |
| `updateSitesSettingServiceDhcp` | Update an existing DHCP reservation for the site. | `updateDhcpReservation` |
| `updateWlanGroupConfig` | Update AP WLAN group assignment with dry-run support. | `setApConfig` |

</details>

## Documentation

| Document | Contents |
| --- | --- |
| [docs/INSTALL.md](docs/INSTALL.md) | Agent configuration, credentials, profiles, TLS |
| [docs/SKILLS.md](docs/SKILLS.md) | Skill index and installation |
| [docs/security-model.md](docs/security-model.md) | Security model |
| [docs/operator-guide.md](docs/operator-guide.md) | Operator guide |
| [docs/support-matrix.md](docs/support-matrix.md) | Controller and device support |
| [docs/COMPARISON.md](docs/COMPARISON.md) | The 23 surveyed repositories and verdicts |
| [docs/MERGE-NOTES.md](docs/MERGE-NOTES.md) | What was merged, what was fixed, known limitations |
| [docs/porting-skipped.md](docs/porting-skipped.md) | Ported and skipped tools |
| [CHANGELOG.md](CHANGELOG.md) | Release notes |
| [CLAUDE.md](CLAUDE.md) | Contributor guide for AI coding agents |

## Development

Run builds and tests in a container (see [CLAUDE.md](CLAUDE.md)), never against a production controller.

| Task | Command |
| --- | --- |
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Lint and type-check | `npm run check` |
| Tests with coverage gates | `npm run test:coverage` |
| README and tool sync (after build) | `node scripts/check-readme-sync.mjs` |
| Tool and test mapping | `node scripts/check-tool-tests.mjs` |
| MCP Inspector | `npm run inspector` |

The repo bundles the Omada Open API spec in `docs/openapi/` as the reference for every endpoint.
Write tools are checked against a stub controller in tests but not all have been validated on a live controller; see the [support matrix](docs/support-matrix.md) and the [0.19 migration guide](docs/operations/0.19-migration.md).

## Credits

This project stands on the work of the authors below. Licenses and
copyright lines are in [NOTICE.md](NOTICE.md); the full survey is in
[docs/COMPARISON.md](docs/COMPARISON.md).

| Repository | Author | License | What we took |
| --- | --- | --- | --- |
| [gaspareduard/Omada-mcp](https://github.com/gaspareduard/Omada-mcp) | gaspareduard | MIT | **Base project** (code): safety model, capability profiles, catalog, tools, tests, CI |
| [MiguelTVMS/tplink-omada-mcp](https://github.com/MiguelTVMS/tplink-omada-mcp) | João Miguel Tabosa Vaz Marques Silva | MIT | **Code** via the base: original tool surface and registry pattern |
| [realtydev/omada-mcp](https://github.com/realtydev/omada-mcp) | Alex Gibson (realtydev) | MIT | **Code ported**: write tools (port forwards, routes, WAN, IPS and others), `getServerInfo`, re-verified against the spec |
| [aljopro/tplink-omada-mcp](https://github.com/aljopro/tplink-omada-mcp) | aljopro | MIT | **Code ported**: `adoptDevice`, `setSiteLed`, LAN writes; spec-validation idea |
| [Zesty0wl/omada-mcp](https://github.com/Zesty0wl/omada-mcp) | Zesty0wl | MIT | **Code ported** (re-implemented on Open API routes): PoE and reboot schedules |
| [daniel-k/omada-mcp](https://github.com/daniel-k/omada-mcp) | daniel-k | MIT | **Code ported**: RF planning, SSID sections, log and notification writes |
| [ChenyqThu/omada-skill](https://github.com/ChenyqThu/omada-skill) | Chen Yuanquan | MIT | **Skills**: five skills adapted and rewritten for this server |
| [kaviththiranga/omada-mcp-server](https://github.com/kaviththiranga/omada-mcp-server) | Kavith Lokuhewage | MIT | **Skills**: roaming/DFS knowledge as `omada-roaming-dfs` |
| [dfla-me/omada-mcp](https://github.com/dfla-me/omada-mcp) | dfla-me | MIT | **Idea only**: whole-object edits and override detection in `omada-safe-change` |
| [margosmark/omada-mcp](https://github.com/margosmark/omada-mcp) | Mark Arslan | MIT | **Idea only**: controller quirks and data-honesty rules; certificate pinning planned |
| [samhaque/omada-controller-mcp](https://github.com/samhaque/omada-controller-mcp) | samhaque | MIT | **Idea only**: search/describe catalog pattern, HTTP hardening ideas |
| [samhaque/nooa-omada-agent](https://github.com/samhaque/nooa-omada-agent) | samhaque | Apache-2.0 | **Idea only**: triage -> investigate pattern |
| [thalisantunes/mcp-omada](https://github.com/thalisantunes/mcp-omada) | thalisantunes | Apache-2.0 | **Idea only**: write-guard and audit design, hardware quirks (in skills) |
| [ricardo-david-francisco/WhiteOmadaMcp-public](https://github.com/ricardo-david-francisco/WhiteOmadaMcp-public) | ricardo-david-francisco | MIT | **Idea only**: encodings, error-code table and hardware findings (in skills) |
| [sirfyyn/fyos-plugin-betrieb](https://github.com/sirfyyn/fyos-plugin-betrieb) | sirfyyn | Apache-2.0 | **Idea only**: read-only facade for autonomous agents |
| [mballoni/omada-controller-mcp](https://github.com/mballoni/omada-controller-mcp) | mballoni | GPL-3.0-only | **Idea only**: fixed scoring rubric with baseline, re-designed independently for `omada-network-audit`; no GPL text or code included |
| [RonaldPhilipsen/omada-mcp](https://github.com/RonaldPhilipsen/omada-mcp) | RonaldPhilipsen | none | **Idea only**: registration-time gating, spec-hash pinning; no code (no license) |
| [jkohen/omada-mcp](https://github.com/jkohen/omada-mcp) | jkohen | none | **Rejected**: no license file, nothing copied |
| [wonjo-linc/MCP-Omada](https://github.com/wonjo-linc/MCP-Omada) | wonjo-linc | none | **Rejected**: no license file, nothing copied |
| [kohlsalem/omada-mcp](https://github.com/kohlsalem/omada-mcp) | kohlsalem | none | **Rejected**: no license; nothing beyond existing reads |
| [OmadaIdentity/omada-mcp-server](https://github.com/OmadaIdentity/omada-mcp-server) | Omada A/S | Omada Technology Preview License | **Excluded**: Omada Identity product, unrelated to TP-Link |
| [walkerpauldavid/omadaidentitymcpserver](https://github.com/walkerpauldavid/omadaidentitymcpserver) | walkerpauldavid | none found | **Excluded**: Omada Identity product, unrelated to TP-Link |
| [bforejt/omada-composer](https://github.com/bforejt/omada-composer) | bforejt | none | **Excluded**: empty repository |

## Devcontainer support

The repository includes a ready-to-use [devcontainer](https://containers.dev/) configuration with a dedicated Omada controller sidecar for local development and testing. See [`.devcontainer/README.md`](.devcontainer/README.md) for details.

## License

This project is licensed under the [MIT License](LICENSE).
