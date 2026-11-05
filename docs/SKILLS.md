# Skills

`skills/` holds eight agent skills: written procedures that tell an AI
agent how to use this server's tools for a whole task (triage, audit,
safe change), in the right order and with the right profile. Skills
contain no code and make no network calls. They only reference tools
that omada-mcp registers, and a check during development confirms
every tool name in them exists.

## Index

| Skill | Kind | What it does | Profile it needs |
| --- | --- | --- | --- |
| [omada-network-audit](../skills/omada-network-audit/SKILL.md) | read-only | Health and security review: six-dimension Wi-Fi score, a 20-item security checklist, inventory, optional baseline for re-audits | `safe-read` + `OMADA_TOOL_CATEGORIES=all:r` |
| [omada-safe-change](../skills/omada-safe-change/SKILL.md) | write procedure | Dry run -> review -> apply -> read-back for any write tool; write -> read-back map, status contract, risk tiers, Omada error codes, hardware quirks | the write's own category (`ops-write`, `admin` or a narrow explicit grant) |
| [omada-wifi-troubleshoot](../skills/omada-wifi-troubleshoot/SKILL.md) | read-only | "Wi-Fi is slow" playbook: site evidence, client dossier, AP zoom, four-line verdict | `safe-read` + `all:r` |
| [omada-roaming-dfs](../skills/omada-roaming-dfs/SKILL.md) | read, hands off writes | Roaming and DFS: configured vs on-air radios, radar fallback, channel overlap, field encodings, measurement method | `all:r`; changes need `devices-ap:rw` / `wireless-radio:rw` |
| [omada-alert-triage](../skills/omada-alert-triage/SKILL.md) | read-only | Group and rank alerts, tie them to devices and uplinks | `safe-read` + `all:r` |
| [omada-support-assist](../skills/omada-support-assist/SKILL.md) | read-only | Ticket draft: alerts, events, audit trail, closest preceding change | `safe-read` + `all:r` |
| [omada-bulk-site-onboard](../skills/omada-bulk-site-onboard/SKILL.md) | read, then writes in waves | Multi-site conformance against a template or reference site, preflight, backups, waves | `all:r`; waves need `maintenance:rw` plus the categories being changed |
| [omada-guest-portal-wizard](../skills/omada-guest-portal-wizard/SKILL.md) | read, then writes | Guest VLAN and SSID preparation, portal steps for the controller UI, isolation test, privacy checklist | `all:r`; changes need `network-lan:rw`, `wireless-ssid:rw` |

Each skill folder has `SKILL.md` (frontmatter `name` and `description`,
then the workflow), `RESOURCES.md` (reference tables) and, for most,
`checklists/` and `examples/`.

## How skills relate to the server

- The server decides what is possible: the capability profile and
  `OMADA_TOOL_CATEGORIES` decide which tools are registered at all, and
  every write tool previews by default (`dryRun: true`).
- The skills decide how the agent works: which read tools to call first,
  how to interpret the results, and how to run a write through the
  omada-safe-change loop with an explicit human approval for each
  preview.
- Skills never assume a tool exists. If the profile hides a tool, the
  skill tells the operator which category grant is missing instead of
  working around it.
- Where a task needs something the server cannot do (create a site,
  bind a site template, create a captive portal, set a per-AP minimum
  RSSI), the skill says so and gives the controller-UI step.

Default `safe-read` categories cover dashboard, clients, client insights,
devices and firewall reads only. Most read-only skills want logs, sites
and wireless reads as well, so they recommend:

```
OMADA_CAPABILITY_PROFILE=safe-read
OMADA_TOOL_CATEGORIES=all:r
```

`all:r` registers every read tool and no write tool; recovery is never
included.

## Install for Claude Code

Skills are plain folders. Copy them into your personal skills directory
(available in every project) or into a project's `.claude/skills/`:

```bash
# personal
mkdir -p ~/.claude/skills
cp -R skills/omada-* ~/.claude/skills/

# or per project
mkdir -p .claude/skills
cp -R skills/omada-* .claude/skills/
```

Keep the skills together: they link to each other (for example every
write hands off to omada-safe-change). Restart Claude Code or start a new
session; the skills load from their `description` when a request matches.

Then register the server itself (see [INSTALL.md](INSTALL.md)). Claude
Code shows MCP tools with a prefix such as `mcp__safe-omada__listSites`;
the skills use the bare names and say so.

## Other agents

Agents without a skills system can still use the content:

- **Codex CLI and other AGENTS.md readers:** concatenate the `SKILL.md`
  files you need into the project's `AGENTS.md` (or reference them from
  it), drop the YAML frontmatter, and keep `RESOURCES.md` next to it.
- **Cursor:** save each `SKILL.md` as a rule under `.cursor/rules/`
  (for example `.cursor/rules/omada-safe-change.mdc`), with the skill's
  description as the rule description.
- **Others:** paste the relevant `SKILL.md` into the system or project
  prompt.

## Compact catalog mode

With `OMADA_CATALOG_MODE=compact` the server exposes only
`searchOperations`, `describeOperation`, `getServerCapabilities` and
`callOperation`. The skills still work: call each named tool through
`callOperation` after checking its schema with `describeOperation`.

## Provenance

The five original skills (alert triage, bulk onboarding, guest portal,
support assist, Wi-Fi troubleshoot) are adapted from ChenyqThu/omada-skill
(MIT) and rewritten for this server's tools. omada-roaming-dfs is adapted
from kaviththiranga/omada-mcp-server (MIT). omada-network-audit and
omada-safe-change are new; the audit rubric is our own design, inspired
by the idea of a fixed scoring rubric in mballoni/omada-controller-mcp
(GPL-3.0, no text or code used), and the error-code and quirk tables
summarise findings from WhiteOmadaMcp-public (MIT) and
thalisantunes/mcp-omada (Apache-2.0). See [NOTICE.md](../NOTICE.md).
