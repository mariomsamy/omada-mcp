# Example: slow Wi-Fi at home in the evening

Operator: "Streaming keeps buffering every evening."

Server: `safe-read` profile, `OMADA_TOOL_CATEGORIES=all:r`.

1. `listSites` -> one site, "Home".
2. `getWifiHealthSummary { windowMinutes: 180 }` covering 19:00-22:00:
   - 5 GHz radio utilisation peaks at 81 %;
   - retry rate 7 %, drop rate 0.5 %;
   - interference section lists 9 neighbouring networks on channels
     36-48.
3. Zoom path: utilisation above 70 % -> AP zoom.
4. `listDevices` -> AP-Living. `getApRadios` shows 5 GHz on channel 36,
   80 MHz, 14 clients. `getRadiosConfig` shows the same channel, so no
   DFS fallback. `getApDetail`: CPU 22 %, firmware current.
5. `getChannels` confirms channels 149-161 are unused nearby (where the
   regulatory domain allows them).

Verdict:

- **Symptom:** 5 GHz airtime above 80 % every evening; retry normal.
- **Likely cause:** neighbouring networks crowding channels 36-48.
- **Evidence:** `getWifiHealthSummary` 19:00-22:00, `getInterference`,
  `getApRadios`.
- **Next step:** move AP-Living 5 GHz to a quieter channel (for example
  149) with `setApRadio` via omada-safe-change; needs `devices-ap:rw`.
  Nothing has been changed.
