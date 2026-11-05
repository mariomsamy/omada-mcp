# Resources: roaming and DFS

## Field encodings

Omada stores many settings as numeric codes. These values come from
community projects that tested real controllers (sources below) and from
this server's own `setApRadio` implementation. Firmware releases can
differ: when a value looks odd, compare with the controller UI.

### SSID (`getSsidDetail`)

| Field | Values |
| --- | --- |
| `security` | 0 none (open), 2 WPA-Enterprise, 3 WPA-Personal, 4 and 5 PPSK variants |
| `versionPsk` | 1 WPA-PSK, 2 WPA2-PSK, 3 WPA/WPA2 mixed, 4 WPA3-SAE |
| `encryptionPsk` | 1 auto (TKIP + AES), 3 AES only. 802.11r needs AES only |
| `pmfMode` | 1 mandatory, 2 capable, 3 disabled |
| `band` | bitmask: 1 = 2.4 GHz, 2 = 5 GHz, 4 = 6 GHz (3 = 2.4 + 5) |

### AP radio (`getRadiosConfig`, `setApRadio`)

| Field | Values |
| --- | --- |
| Radio keys | `radioSetting2g`, `radioSetting5g` (or `radioSetting5g1` / `radioSetting5g2` on tri-band), `radioSetting6g` |
| `channelWidth` code | 2 = 20 MHz, 3 = 40, 5 = 80, 7 = 160, 9 = 240, 10 = 320 (as used by `setApRadio`). A shortcut formula seen in some notes, (MHz / 20) + 1, only holds for 20-80 MHz |
| `txPowerLevel` | 0 low, 1 medium, 2 high, 3 custom (dBm in `txPower`), 4 auto. `setApRadio` accepts 0, 1, 2 and 4 |
| `channel` | Stored as an index into the AP's channel list, not the channel number. `freq` is authoritative. `setApRadio` takes the real channel number |
| Runtime channel text | Can arrive as one string such as `"11 / 2462MHz"`; parse both parts |

`setApRadio` bands: `2.4GHz`, `5GHz`, `5GHz-1`, `5GHz-2`, `6GHz`. The
channel and width must be advertised by that AP
(`getSitesApsAvailableChannel`); it refuses otherwise.

## 5 GHz channel groups

| Channels | Notes |
| --- | --- |
| 36-48 | Non-DFS (UNII-1). Safe default for pinning |
| 52-64 | DFS (UNII-2). Radar can force a move |
| 100-144 | DFS (UNII-2e). Radar can force a move; long wait before returning |
| 149-165 | Non-DFS (UNII-3) where the regulatory domain allows it |

Regulatory domains differ by country. Check what the AP advertises
rather than this table.

## Roaming: healthy vs problem

| Signal | Healthy | Problem |
| --- | --- | --- |
| Signal at the moment of roaming | -65 to -75 dBm | weaker than -80 dBm: client clings too long |
| Ping loss per roam | 0-2 packets | more than 10: full reauthentication, fast roaming not working |
| Roams while the client is stationary | none | repeated flips: overlapping cells or thresholds too aggressive |
| Roams per minute while walking normally | 1-2 | ping-pong: 3 or more within 60 s between the same two APs |

## Configured vs on air: reading the pair

| `getRadiosConfig` (configured) | `getApRadios` (runtime) | Reading |
| --- | --- | --- |
| Channel 100, 80 MHz | Channel 36, 80 MHz | DFS fallback after radar |
| Channel auto | Channel 44 | Fine: auto picked 44. Check neighbours for overlap |
| Width 160 MHz | Width 80 MHz | AP or client capability limited it, or DFS narrowed it |
| Power high | Power lower | Power adjusted by RF optimisation or local limits |

## Sources

- kaviththiranga/omada-mcp-server (MIT): enum decoder, configured vs
  on-air method, roaming checklist and measurement method (adapted).
- ricardo-david-francisco/WhiteOmadaMcp-public (MIT): channel index,
  width code, PMF and band encodings (summarised).
- thalisantunes/mcp-omada (Apache-2.0): channel/`freq` parsing and the
  whole-object radio write behaviour (summarised).

All rewritten in our own words for safe-omada-mcp. See `NOTICE.md`.
