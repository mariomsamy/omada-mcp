# Resources: alert triage

## Severity normalisation

Controllers emit severity under different names and spellings. Normalise
before ranking:

| Normalised | Seen as |
| --- | --- |
| critical | `Critical`, `CRITICAL`, `Emergency` |
| error | `Error`, `High`, `Major` |
| warning | `Warning`, `Warn`, `Medium`, `Concerning` |
| info | `Info`, `Notice`, `Low`, `Minor` |
| unknown | missing or anything else |

Rank: critical > error > warning > info > unknown, but always open the
unknown bucket: new alert types often land there.

Threat severity in `getThreatList` is numeric: 0 critical, 1 major,
2 moderate/concerning, 3 minor, 4 low.

## Time windows

`listSiteAlerts`, `listSiteEvents` and `listClientsPastConnections` use
Unix milliseconds:

```
24 h = 86_400_000      7 d = 604_800_000      30 d = 2_592_000_000
```

`getRetryAndDroppedRate` uses Unix seconds. Always echo the ISO window
back in the site time zone (`getSiteDetail`).

## Device context by type

| Target | Detail tool | Extra |
| --- | --- | --- |
| Access point | `getApDetail` | `getApRadios`, `getUplinkWiredDetail`, `getMeshStatistics` (mesh APs) |
| Switch | `getSwitchDetail` | `getCableTestFullResults` (if a test was run), `listSitesStacks` / `getSwitchStackDetail` for stacks |
| Easy-managed switch | `getSitesSwitchesEs` | `getSitesSwitchesEsGeneralConfig` |
| Gateway | `getGatewayDetail` | `getGatewayHealth`, `getGatewayWanStatus`, `getSitesHealthGatewaysWansDetails` |
| Client | `diagnoseClient` | `getGridClientHistory` |

## Typical patterns

| Pattern | Evidence | Reading |
| --- | --- | --- |
| Several APs disconnect at the same minute | same uplink switch in `getUplinkWiredDetail` | Switch, PoE budget or uplink problem, not the APs |
| One AP repeatedly disconnects and reconnects | constant MAC, growing count | Cable, PoE or failing AP; check the switch port |
| Gateway WAN down/up pairs | `getGatewayWanStatus`, events | ISP or modem instability |
| Client authentication failure storm on one SSID | many client MACs, same SSID | Recent passphrase or RADIUS change; check audit logs (omada-support-assist) |
| Paced device disconnects every few minutes | events show upgrades or reboots | Firmware rollout or reboot schedule (`getRebootScheduleList`), expected |

## Report template

```
# Alert triage: <site> · <ISO start> to <ISO end> (<time zone>)
Alerts read: <n> (complete | stopped at <n>, tail not read)
Live state: <healthy | degraded: ...>

## Ranked groups
1. [critical] <alert type> · <device name> ×<count> · first <t> · last <t>
   Sample: "<message>"
   Device: <status, uptime, firmware, CPU/mem, clients>
   Uplink: <switch / port>
2. ...

## Hand-offs (not executed)
- <e.g. check PoE budget on SW-Core port 12: omada-safe-change, setSwitchPorts>
- <e.g. ticket with audit evidence: omada-support-assist>
- <e.g. resolve reviewed alerts: resolveAlertLogs via omada-safe-change, needs logs:rw>
```

## Related skills

- [omada-support-assist](../omada-support-assist/SKILL.md)
- [omada-wifi-troubleshoot](../omada-wifi-troubleshoot/SKILL.md)
- [omada-safe-change](../omada-safe-change/SKILL.md)
