# Resources: bulk site onboarding

## Glossary

| Term | Meaning |
| --- | --- |
| `omadacId` | Controller ID. Configured once on the server (`OMADA_OMADAC_ID`); one server instance talks to one controller. |
| `siteId` | One site (store, branch, home). Most tools accept `siteId`; without it the server uses `OMADA_SITE_ID` or the only site. |
| Site template | A reusable bundle of site settings on the controller. Readable here (`getSiteTemplateList`, `getSiteTemplateDetail`, `getSiteTemplateConfig`); binding is done in the controller UI. |
| Reference site | A site already configured correctly, used as the comparison source when no template exists. |
| Wave | A group of sites changed together after a backup, verified before the next wave starts. |

Several controllers (for example per customer) need one server instance
each, with its own credentials. Do not mix controllers in one wave.

## Comparison keys

Compare by stable, human-meaningful keys, never by IDs:

| Object | Compare by | Fields worth comparing |
| --- | --- | --- |
| LAN network | name | VLAN ID, subnet, gateway IP, DHCP range, purpose |
| LAN profile | name | native network, tagged networks, PoE, 802.1X |
| WLAN group / SSID | SSID name | band, security mode, encryption, guest isolation, VLAN, rate limits, broadcast |
| DHCP reservation | MAC | IP, network |
| Schedules | name | days, times, target devices/ports |

## Preflight result codes

| Result | Meaning | Action |
| --- | --- | --- |
| PASS | Matches reference or no conflict | none |
| DIFF | Differs from reference, safe to change | add to the per-site plan |
| CONFLICT | Would collide (overlapping subnet, VLAN ID used for another network) | operator decision required |
| MANUAL | Needs a step this server cannot do | list for the controller UI |
| UNKNOWN | Evidence missing | do not change; investigate |

## Useful error codes during onboarding

See omada-safe-change/RESOURCES.md for the full table. Most common here:

| Code | Meaning | Action |
| --- | --- | --- |
| `-1001` | Invalid or missing parameters in the payload | Re-check the schema (`describeOperation`) and the reference object |
| `-1007` | The Open API app's role cannot write | Use an app with an admin role for this wave |
| `-1600` | Operation not supported on this firmware | Mark MANUAL for that site |
| `-33411` | Gateway not connected | Fix the gateway before LAN changes |

## Operational guardrails

- Pilot one site first, then waves of increasing size.
- Back up every site in a wave before changing it; confirm the backup
  with `getSiteBackupResult` / `getSiteBackupFileList`.
- Re-inventory after each wave and show the operator the delta.
- Keep the grant narrow and time-boxed to the wave.
- Device adoption can trigger provisioning and reboots; adopt outside
  business hours.

## Related skills

- [omada-safe-change](../omada-safe-change/SKILL.md): the per-change loop.
- [omada-guest-portal-wizard](../omada-guest-portal-wizard/SKILL.md): guest Wi-Fi per site.
- [omada-network-audit](../omada-network-audit/SKILL.md): audit each site after onboarding.
