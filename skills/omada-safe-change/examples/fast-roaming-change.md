# Example: enable fast roaming on one site

Operator: "Turn on fast roaming for the office site."

Server: `OMADA_CAPABILITY_PROFILE=safe-read`,
`OMADA_TOOL_CATEGORIES=all:r,wireless-radio:rw` (restarted for this change).

1. `getServerCapabilities` shows `updateRoaming` is enabled.
2. `listSites` -> office site `66a1...` (echoed back to the operator).
3. Before state: `getRoamingSetting { siteId }` returns the roaming object
   with fast roaming off. Saved as rollback data.
4. Prerequisite check (see omada-roaming-dfs): `getSsidList` and
   `getSsidDetail` for the staff SSID show WPA2-PSK with AES only, so
   802.11r is usable.
5. Build the payload from the before object, changing only the fast
   roaming flag. Field names come from the before object, not memory.
6. Dry run: `updateRoaming { siteId, payload: { roaming: {...} } }`
   (no `dryRun`) -> `status: planned`, with `before` and `plannedConfig`.
   Assistant: "This changes only fast roaming. Clients may reassociate
   once; older devices that do not support 802.11r keep working on
   normal roaming. Apply?"
7. Operator: "Yes, apply."
8. Apply: same call with `dryRun: false` -> `status: applied`. This tool
   has no built-in verification.
9. Read back after 60 s: `getRoamingSetting` shows fast roaming on.
   Outcome: verified.
10. Health: `getWifiHealthSummary { windowMinutes: 30 }` 15 minutes later
    shows no rise in retry or drop rate.
11. Change record filled in; operator restarts the server with
    `OMADA_TOOL_CATEGORIES=all:r`.

If step 9 had shown fast roaming still off, the outcome would be
"not applied": re-read once more, then check the SSID encryption and the
controller UI, and do not repeat the write blindly.
