# Resources: support assist

## Ticket template

```
# Incident: <site name> · <ISO start> to <ISO end> (<time zone>)

## Summary
<One sentence: what happened, where, and how many users or devices were affected.>

## Site context
<getNetworkHealthSummary: devices, clients, WAN state at time of writing>

## Alerts in window
<Top 20: [severity] time · type · target · message>
<"Alerts unavailable on this controller build" if diagnoseLogs says so>

## Events in window
<Notable events: reboots, disconnects, provisioning, WAN changes>

## Configuration changes (audit)
<time · user · action · object>
<Mark entries that precede an alert cluster: "closest preceding change (2 min before alerts)">

## Device / client context (optional)
<Type-specific detail tool summary>

## Suggested next steps (not executed)
- <action> via omada-safe-change, tool <name>, needs <grant>

## IDs
- siteId: <...>
- Device MAC(s): <...>
- Window (ms): <start>-<end>
```

## Window conversion

| Phrase | Rule |
| --- | --- |
| "last 24 h" | end = now; start = end - 86_400_000 |
| "this morning" | start = today 06:00 site time; end = now (confirm) |
| "13:00-14:00 UTC" | parse explicitly; keep UTC and also show site time |
| "the incident window" | ask for explicit times |

## Audit `searchKey` hints

`searchKey` is a plain substring match on action text or username.

| Question | Try |
| --- | --- |
| Who changed Wi-Fi? | `wlan`, `ssid`, `wireless` |
| Who touched a switch port or VLAN? | `port`, `vlan`, `profile` |
| Who rebooted or upgraded? | `reboot`, `upgrade`, `firmware` |
| Who changed firewall or NAT? | `acl`, `firewall`, `forward` |
| Who changed accounts? | use `getAuditLogsForGlobal` with `user` or `role` |

## Correlation patterns

| Pattern | Reading |
| --- | --- |
| Configuration change, then device alerts within 1-3 min | Strong temporal link; mention it, do not assert cause |
| SSID or RADIUS change, then a client auth-failure storm | Likely credentials or security-mode mismatch |
| Firmware upgrade, then paced device disconnects | Expected rollout behaviour unless alerts continue afterwards |
| No audit entries before the spike | Look outside the network: ISP (`getGatewayWanStatus`), power, physical |

## Related skills

- [omada-alert-triage](../omada-alert-triage/SKILL.md): pick the window and the main issue first.
- [omada-wifi-troubleshoot](../omada-wifi-troubleshoot/SKILL.md): ongoing Wi-Fi quality issues.
- [omada-safe-change](../omada-safe-change/SKILL.md): applying a fix.
