# Example: new sites from a template, verified here

Operator: "We created six new branch sites from the template
'branch-v3' in the controller. Check them and finish the setup."

Server: `safe-read`, `OMADA_TOOL_CATEGORIES=all:r` for the checks.

1. `getSiteTemplateList` -> `branch-v3`. `getSiteTemplateDetail` and
   `getSiteTemplateConfig` give the expected LANs and SSIDs.
2. `listSites`: five of the six branches exist; "Branch-Riyadh-2" is
   missing. Reported as MANUAL: create it in the controller UI from the
   template, then re-run this check.
3. For the five sites, `getSiteDetail` shows two with the wrong time
   zone (MANUAL: site settings are not writable on this server), and
   `getLanNetworkListV2` / `getSsidList` match the template except one
   branch where the Guest SSID rate limit is missing (DIFF).
4. `listPendingDevices`: 14 devices waiting across the five sites.

Apply (grant `all:r,maintenance:rw,devices-general:rw,wireless-ssid:rw`):

5. Per site: `backupSites` first, then `adoptDevice` for each pending
   device (one preview and approval per device), then
   `updateSsidRateLimit` for the branch with the missing limit (payload
   built from `getSsidDetail` of a conforming branch, values checked by
   the operator).
6. Read-back: `listDevices` shows the adopted devices connected;
   `getSsidDetail` shows the rate limit.

Report: five branches conformant; time zone fixes and the missing site
listed as manual controller-UI tasks; grant reduced to `all:r`.
