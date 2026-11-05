# Example: mixed 24 h log and an empty-log false alarm

Operator: "Triage the last 24 hours for the warehouse site."

Server: `safe-read`, `OMADA_TOOL_CATEGORIES=all:r`.

1. Window: now minus 86_400_000 ms to now, echoed back in the site time
   zone.
2. `listSiteAlerts` returns 0 rows. Instead of reporting "quiet site":
3. `diagnoseLogs` shows the alert section as unavailable on this
   controller build while events are present. The report says alerts are
   unknown, not zero.
4. `listSiteEvents` for the same window: 140 events. Grouped:
   - gateway WAN1 down/up ×6 (all between 02:00 and 02:40)
   - switch SW-Rack port 18 link down/up ×22
   - routine client connect/disconnect ×112
5. Zoom: `getGatewayHealth` shows WAN1 up now with 2 % packet loss;
   `getGatewayWanStatus` agrees. `getSwitchDetail` for SW-Rack: port 18
   flapping, connected to an AP.
6. Report ranks the WAN flaps first (site-wide impact, night-time ISP
   maintenance is a candidate), then the port 18 flap (cable or AP).
   It states that alerts could not be read on this firmware.

Hand-offs, none executed: a cable test on SW-Rack port 18 with
`startCableTest` via omada-safe-change (`devices-switch:rw`; it can
briefly interrupt the link), and an ISP check for WAN1.
