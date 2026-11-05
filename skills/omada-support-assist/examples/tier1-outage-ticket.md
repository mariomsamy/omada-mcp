# Example: store outage ticket

Operator: "Draft a ticket for the outage at Store-14 between 13:00 and
14:00 UTC today."

Server: `safe-read`, `OMADA_TOOL_CATEGORIES=all:r`.

1. Window echoed: 13:00-14:00 UTC (17:00-18:00 store time), converted to
   milliseconds.
2. `getNetworkHealthSummary`: 1 gateway, 1 switch, 2 APs; all up now.
3. `listSiteAlerts`: 38 alerts, mostly "AP disconnected" for both APs
   from 13:03 to 13:21, plus "client DHCP failure" from 13:04.
4. `listSiteEvents`: switch SW-Store reprovisioned at 13:02.
5. `listSiteAuditLogs` (12:30-14:00): "Edit LAN network Staff (VLAN 20)"
   by admin-2 at 13:01; "Edit LAN network Staff" by admin-2 at 13:19.
6. Snapshot: `getSwitchDetail` for SW-Store, uplink port up, no errors.

Draft (abridged):

```
# Incident: Store-14 · 2026-11-05T13:00Z to 2026-11-05T14:00Z (UTC)

## Summary
Both APs at Store-14 lost connectivity for about 18 minutes; clients
failed DHCP during the same period.

## Configuration changes (audit)
13:01 · admin-2 · Edit LAN network Staff (VLAN 20)
      closest preceding change (2 min before the first alert)
13:19 · admin-2 · Edit LAN network Staff
      alerts stop 2 min later

## Suggested next steps (not executed)
- Compare the current Staff network with the 13:01 version
  (getLanNetworkListV2); any correction via omada-safe-change,
  updateLanNetwork, needs network-lan:rw (admin).
```

The draft does not say the VLAN edit caused the outage; it shows the
timing and leaves the conclusion to the operator.
