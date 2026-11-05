# Roaming and DFS checklist

Work top to bottom. Stop when the evidence explains the problem.

- [ ] Server started with `OMADA_TOOL_CATEGORIES=all:r` for diagnosis.
- [ ] Site roaming and band steering read (`getRoamingSetting`,
      `getBandSteeringSetting`).
- [ ] Every SSID that should roam is AES only (`encryptionPsk` 3) and
      uses WPA2 or WPA3 (`getSsidDetail`).
- [ ] Per AP: configured (`getRadiosConfig`) vs runtime (`getApRadios`)
      compared; `freq` trusted over `channel`.
- [ ] DFS fallbacks listed (configured DFS channel, different runtime
      channel).
- [ ] Overlapping 5 GHz AP pairs listed (runtime channel and width).
- [ ] 2.4 GHz only on 1, 6, 11 at 20 MHz.
- [ ] Width sane for the AP count (40 or 80 MHz with three or more APs).
- [ ] Client evidence: roams, signal at roam, ping loss per roam.
- [ ] Sticky client identified (which OS) before any network change.
- [ ] Minimum-RSSI recommendation written for the controller UI (not
      settable through this server), with IoT radios excluded.
- [ ] Each change handed to omada-safe-change with its grant:
      `setApRadio` / `setApChannelLimit` (`devices-ap:rw`),
      `updateRoaming` / `updateBandSteering` (`wireless-radio:rw`),
      `updateSsidRateControl` (`wireless-ssid:rw`).
- [ ] Measurement repeated after each change (60-90 s dwell per spot).
