# Example: who changed the SSID, and what broke?

Operator: "Someone changed the guest SSID yesterday. Who, and did it
cause the complaints?"

Server: `safe-read`, `OMADA_TOOL_CATEGORIES=all:r`.

1. Window: yesterday 00:00-24:00 site time, echoed back, converted to
   milliseconds.
2. `listSiteAuditLogs { searchKey: "ssid" }`: one entry, 15:42, user
   admin-1, "Edit SSID Guest".
3. `getSsidList` / `getSsidDetail` for Guest now: guest network
   isolation on, rate limit set.
4. `listSiteAlerts` for 15:00-18:00: 9 "client association failure"
   alerts on the Guest SSID from 15:44 to 16:30, none before.
5. `listClientsPastConnections` (milliseconds, `searchKey: "Guest"`):
   guest connections dropped from about 30/hour to 6/hour after 15:42.

Draft highlights:

- Closest preceding change: "Edit SSID Guest" by admin-1 at 15:42,
  2 minutes before the first association failure.
- Current SSID settings recorded (no passphrase shown).
- Suggested next step: ask admin-1 what was changed; if a setting must
  be reverted, use omada-safe-change with `updateSsid` or the matching
  `updateSsid*` tool (`wireless-ssid:rw`, admin).

The audit entry does not include the old values, so the draft says
"before values unknown" instead of guessing them.
