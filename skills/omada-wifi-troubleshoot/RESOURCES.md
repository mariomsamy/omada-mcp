# Resources: wifi-troubleshoot

## Signal -> hypothesis

| Signal (from `getWifiHealthSummary` or the named tool) | Heuristic threshold | Hypothesis | Next tool |
| --- | --- | --- | --- |
| Retry rate | above 10 % | Interference or weak links | `getInterference`, then AP zoom (`getApRadios`) |
| Radio utilisation | above 70 % | Channel saturation, too many SSIDs, wide channels | `getChannels`, `getApRadios`, `getRadiosConfig` |
| Drop rate | above 2 % | Client quality, capacity or hardware | client zoom (`diagnoseClient`) |
| Weak-signal clients | any, or above 10 % of clients | Coverage, placement or sticky clients | `diagnoseClient`, `getGridClientHistory` |
| Runtime channel differs from configured on 5 GHz DFS | any AP | Radar events forcing channel changes | omada-roaming-dfs |
| Health dipped earlier, fine now | n/a | Past incident | omada-alert-triage for that window |
| Missing section in the summary | n/a | Not available on this controller or firmware | say "unknown" |

These thresholds are starting points, not universal health scores.

## Client dossier

Fill this for each client you zoom into. Report it without the client
name unless the complaint is about that device.

| Field | Source |
| --- | --- |
| Current AP, band, channel | `diagnoseClient` |
| Signal (dBm) and SNR | `diagnoseClient` / `getClientDetail` |
| Negotiated rate / Wi-Fi standard | `getClientDetail` |
| SSID and VLAN | `getClientDetail` |
| Roams in the window (count, AP pairs) | `getGridClientHistory` |
| Disconnects and reasons | `getGridClientHistory`, `listClientsPastConnections` |
| Rate limit applied? | `getClientDetail` |

Diagnosis patterns for one client:

| Pattern | Reading |
| --- | --- |
| 3+ roams within 60 s between the same two APs | Ping-pong: overlapping cells on the same or adjacent channel, or no minimum-RSSI policy |
| Stays on a far AP at -78 dBm while a nearer AP is idle | Sticky client (common on macOS); the network may be fine |
| Repeated disconnects with an authentication or DHCP reason | Not RF: check SSID security settings, RADIUS or DHCP scope |
| Good signal, low negotiated rate | Old client radio, 2.4 GHz only, or legacy rates forced |
| Only this client affected, others fine | Client-side issue; do not retune the network for one device |

## Runtime vs configured radio

`getApRadios` returns what the AP is doing now; `getRadiosConfig` returns
what it is configured to do. Compare channel, width and transmit power.
The configured `channel` can be an index into the AP's channel list;
trust the `freq` value when they disagree (see
omada-safe-change/RESOURCES.md, "Silent failures and hardware quirks").

## Common scenarios

- **Evening buffering at home:** 5 GHz utilisation above 70 % in the
  evening from neighbouring networks, AP CPU normal. Next step: a less
  crowded non-DFS channel or a narrower width via `setApRadio`.
- **Laptop unstable upstairs:** weak signal plus ping-pong between the
  stairwell and upstairs AP. Next step: see omada-roaming-dfs before
  touching power or thresholds.
- **One phone cannot get online, guests are fine:** disconnect reasons
  point at authentication or DHCP. Next step: omada-support-assist for
  recent configuration changes.

## Related skills

- [omada-roaming-dfs](../omada-roaming-dfs/SKILL.md): roaming and DFS deep dive.
- [omada-alert-triage](../omada-alert-triage/SKILL.md): alerts for a past window.
- [omada-network-audit](../omada-network-audit/SKILL.md): scored review.
- [omada-safe-change](../omada-safe-change/SKILL.md): applying a fix.
