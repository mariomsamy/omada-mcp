# Example: two APs flooding the alert log

Operator: "Our dashboard is full of red alerts since this morning."

Server: `safe-read`, `OMADA_TOOL_CATEGORIES=all:r`.

1. `getSiteDetail`: time zone Asia/Dubai. Window "since this morning" =
   today 06:00 to now, echoed back as ISO, converted to milliseconds.
2. `getNetworkHealthSummary`: 2 of 6 APs disconnected right now.
3. `listSiteAlerts { startTime, endTime, pageSize: 100 }`, 3 pages,
   212 alerts, window fully covered.
4. Groups:
   - [critical] AP disconnected · AP-Lobby ×61, first 06:12, last 11:40
   - [critical] AP disconnected · AP-Cafe ×58, first 06:12, last 11:41
   - [warning] client auth failure · 17 clients ×74
   - [info] other ×19
5. Zoom: `listDevices` -> MACs. `getApDetail` for both: uptime under 10
   minutes, firmware current. `getUplinkWiredDetail` for both: same
   switch SW-Ground, ports 3 and 4, PoE.
6. `getSwitchDetail` for SW-Ground: PoE budget close to the maximum.
   `listSiteEvents` 06:00-06:30: a new PoE camera came online at 06:10.
7. Report: the two AP groups are one issue. Likely PoE budget exhaustion
   on SW-Ground since the camera was added; the client auth failures
   are clients losing those APs.

Hand-offs, none executed:

- Review PoE allocation on SW-Ground; any port change goes through
  omada-safe-change with `setSwitchPorts` (`devices-switch:rw`).
- Ticket with evidence: omada-support-assist.
