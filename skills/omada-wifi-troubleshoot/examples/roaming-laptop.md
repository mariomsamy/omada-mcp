# Example: laptop keeps dropping between two APs

Operator: "My work laptop drops calls in the hallway." Gives hostname
`work-laptop`.

Server: `safe-read` profile, `OMADA_TOOL_CATEGORIES=all:r`.

1. `getWifiHealthSummary { windowMinutes: 60 }`: site retry 6 %,
   utilisation fine; 2 of 30 clients have weak signal.
2. Client zoom: `diagnoseClient { identifier: "work-laptop" }` resolves
   one online client on AP-Hall 5 GHz at -74 dBm.
3. `getGridClientHistory` for that MAC: 7 roams in 4 minutes, all
   between AP-Hall and AP-Office; disconnect reasons empty.
4. AP zoom: `getApRadios` for both APs shows 5 GHz on channels 36 and
   40 at 80 MHz, so their channels overlap. `getRadiosConfig` matches.
5. `getRoamingSetting`: fast roaming off.

Verdict:

- **Symptom:** ping-pong roaming (7 roams in 4 minutes) between AP-Hall
  and AP-Office.
- **Likely cause:** overlapping 80 MHz channels on neighbouring APs and
  no fast roaming, so each roam is a full reauthentication.
- **Evidence:** `getGridClientHistory`, `getApRadios`,
  `getRoamingSetting`.
- **Next step:** follow omada-roaming-dfs: check SSID encryption is
  AES-only, separate the channels (`setApRadio`), then consider
  `updateRoaming`. Each change goes through omada-safe-change. Nothing
  has been changed.
