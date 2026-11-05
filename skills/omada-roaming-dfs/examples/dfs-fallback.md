# Example: two APs keep landing on the same channel

Operator: "Every few days the upstairs Wi-Fi gets terrible, then it
fixes itself after a reboot."

Server: `safe-read`, `OMADA_TOOL_CATEGORIES=all:r`.

1. `listDevices` -> AP-Up, AP-Down.
2. `getRadiosConfig { apMac: AP-Up }`: 5 GHz configured on channel 100,
   80 MHz. `getApRadios { apMac: AP-Up }`: runtime channel 36.
3. `getRadiosConfig { apMac: AP-Down }`: 5 GHz configured on 36, 80 MHz.
   `getApRadios`: runtime 36.
4. Reading: AP-Up left DFS channel 100 after a radar event and fell back
   to 36, the same 80 MHz block as AP-Down. Both APs now share airtime
   and clients ping-pong. A reboot moves AP-Up back to 100 until the
   next radar event.
5. `getSitesApsAvailableChannel { apMac: AP-Up }` shows 149-161 are
   advertised (non-DFS in this regulatory domain).

Recommendation (each through omada-safe-change, `devices-ap:rw`):

- Pin AP-Up 5 GHz to channel 149, 80 MHz with `setApRadio`
  (`band: "5GHz"`, `channel: 149`, `channelWidthMHz: 80`). Dry run
  first; the preview shows the preserved 2.4 GHz settings.
- After apply, `setApRadio` reports `verified` when the read-back
  matches. Re-check `getApRadios` after 60 s and again the next day to
  confirm the runtime channel stays on 149.
- Then re-measure roaming between the two APs (see the SKILL.md
  measuring section).
