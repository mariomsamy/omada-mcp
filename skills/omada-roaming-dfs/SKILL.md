---
name: omada-roaming-dfs
description: |
  TRIGGER for Wi-Fi roaming and DFS problems on an Omada site: clients
  sticking to a far AP, ping-pong between APs, calls dropping while
  walking, "fast roaming is on but does nothing", 5 GHz channels that
  keep changing by themselves, radar/DFS evictions, choosing channels
  and widths for several APs.
  Uses safe-omada-mcp read tools to compare configured and on-air radio
  state, then hands any change to omada-safe-change.
  SKIP for a general "Wi-Fi is slow" complaint (start with
  omada-wifi-troubleshoot), for scored audits (omada-network-audit) and
  for non-Wi-Fi problems.
---

# Roaming and DFS

## Goal

Find out why clients roam badly or why 5 GHz channels move, using
evidence, and recommend changes in the order they usually matter. Every
change goes through [omada-safe-change](../omada-safe-change/SKILL.md).

## Capability profile needed

| Step | Tools | Grant | Profile |
| --- | --- | --- | --- |
| Diagnose | `getRoamingSetting`, `getBandSteeringSetting`, `getSsidList`, `getSsidDetail`, `listDevices`, `getApRadios`, `getRadiosConfig`, `getSitesApsAvailableChannel`, `getSitesApsChannelLimit`, `getChannels`, `getInterference`, `diagnoseClient`, `getGridClientHistory`, `listClientsPastConnections` | `all:r` | `safe-read` with `OMADA_TOOL_CATEGORIES=all:r` |
| Change a channel, width, power | `setApRadio` | `devices-ap:rw` | `admin` or explicit grant |
| Restrict usable channels per AP | `setApChannelLimit` | `devices-ap:rw` | `admin` or explicit grant |
| Site roaming / band steering | `updateRoaming`, `updateBandSteering` | `wireless-radio:rw` | `admin` or explicit grant |
| SSID rate control (drop legacy rates) | `updateSsidRateControl` | `wireless-ssid:rw` | `admin` or explicit grant |

Tool names are as registered by safe-omada-mcp; your client may prefix
them. In compact catalog mode use `callOperation`.

## Workflow

1. **Baseline the site.** `getRoamingSetting`, `getBandSteeringSetting`,
   and for each SSID `getSsidDetail` (security mode, encryption, PMF,
   bands). `listDevices` for the AP list.
2. **Configured vs on air, per AP.** `getRadiosConfig` (configured) and
   `getApRadios` (runtime). Compare channel (trust `freq`), width and
   power. `getSitesApsAvailableChannel` shows which channels the AP
   advertises; `getSitesApsChannelLimit` shows any channel limit.
3. **DFS check.** If an AP is configured on a DFS channel (5 GHz 52-144)
   and its runtime channel differs, the AP has most likely left the
   channel after a radar event and fallen back, often onto a
   neighbour's channel. This recurs. Recommend pinning a non-DFS channel
   (36-48, or 149-165 where allowed) rather than re-setting the DFS one.
4. **Overlap check.** Using runtime channels and widths, list AP pairs
   whose 5 GHz channels overlap. 160 MHz on one AP can cover the whole
   lower band another AP needs. 2.4 GHz should use only 1, 6 or 11 at
   20 MHz.
5. **Client evidence.** For the complaining client: `diagnoseClient`,
   then `getGridClientHistory` for roams (AP pairs, timing) and signal
   at each roam. Use the healthy/problem table in `RESOURCES.md`.
6. **Recommend in this order** (stop when the evidence says the cause
   is found):
   1. AES-only encryption on SSIDs that use 802.11r (fast transition is
      defined only over AES/CCMP; "auto" with TKIP can stop it being
      offered while the UI still shows fast roaming on).
   2. Non-overlapping channels, checked on air.
   3. A sane width (40 or 80 MHz on 5 GHz with three or more APs).
   4. Fast roaming / AI roaming via `updateRoaming`.
   5. A minimum-RSSI threshold per AP (see the note below).
   6. Transmit power, only after the above.
7. **Hand over.** Each recommendation becomes its own
   omada-safe-change loop: before read, dry run, approval, apply,
   read-back, then repeat step 5 to check roaming improved.

## Minimum RSSI threshold

The per-AP minimum-RSSI (client kick) threshold is what really moves a
sticky client. The Omada Open API does not document it for standalone
access points, and this server only uses the Open API, so it cannot be
set here. Set it in the controller UI (per AP, per band) and use this
skill to measure before and after. Guidance:

- Around -75 dBm on 5 GHz is a reasonable start.
- Never threshold a radio that IoT devices live on (for example 2.4 GHz
  cameras at -70 dBm); they get kicked with nowhere to go.
- Set it per AP, based on whether a better AP exists for that AP's
  clients. A central AP that is the only coverage for some rooms should
  be relaxed; edge APs can push clients back towards it.

## Measuring

There is no roam-watch tool. Measure with what the server has:

- Poll `diagnoseClient` (or `getGridClientHistory`) every 30-60 s while
  the user walks a fixed route, recording AP, band and signal.
- Run a fast ping from the client to the gateway (for example
  `ping -i 0.2 <gateway>`) and count lost packets per roam.
- Dwell at least 60 s at each test spot (90 s where a roam decision is
  being tested). A bad association can take 30 s to correct itself.

## Traps

- Never set a threshold from a signal reading taken while walking; it
  can be 15 dB worse than the stationary value at the same spot.
- Check which client is sticky before tuning the network. macOS holds
  associations much longer than iOS or Android. If only one laptop is
  stuck, do not lower AP power for it.
- When analysing ping logs, replies can arrive out of order during RTT
  spikes. Look for missing sequence numbers instead of gaps between
  consecutive lines.
- Radio and SSID changes take 30-60 s to reach the air. Re-read before
  concluding a change failed.

## Snapshots and rollback

Before a roaming or channel change, keep the outputs of
`getRoamingSetting`, `getBandSteeringSetting`, `getSsidDetail`,
`getRadiosConfig` (each AP) as the rollback snapshot. For a full
restorable backup, use `backupSites` (`maintenance:rw`, `ops-write`)
through omada-safe-change, or the controller UI export.

## Examples and reference

- [examples/dfs-fallback.md](examples/dfs-fallback.md): two APs that
  keep landing on the same channel after radar events.
- `RESOURCES.md`: field encodings, the healthy/problem roaming table and
  sources.
- `checklists/roaming-checklist.md`: the ordered checklist.

Adapted from the `omada-network` skill in kaviththiranga/omada-mcp-server
(MIT, (c) 2026 Kavith Lokuhewage), rewritten for safe-omada-mcp tools.
