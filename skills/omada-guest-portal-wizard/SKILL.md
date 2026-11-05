---
name: omada-guest-portal-wizard
description: |
  TRIGGER when an operator wants to set up or review guest Wi-Fi with a
  captive portal on an Omada site: interview for requirements, prepare
  the guest network and SSID (VLAN, isolation, rate limits, schedule),
  review the existing portal configuration, and verify the result.
  TRIGGER for "set up guest Wi-Fi with a splash page", "add a voucher
  portal for the lounge", "is our guest network isolated?".
  SKIP for changing a single setting on an existing SSID
  (omada-safe-change), for audits (omada-network-audit) and for
  portal-not-loading troubleshooting of one client
  (omada-wifi-troubleshoot).
  Note: safe-omada-mcp cannot create or edit captive portals (hotspot
  portal tools are not implemented); the portal itself is created in the
  controller UI and verified here.
---

# Guest portal wizard

## Goal

Stand up guest Wi-Fi that is isolated, rate-limited and backed by a
captive portal, without guessing any setting. The skill interviews the
operator, prepares the network side through
[omada-safe-change](../omada-safe-change/SKILL.md), gives exact
controller-UI steps for the portal itself, and then verifies everything
with read tools.

## What this server can and cannot do

| Part | On this server |
| --- | --- |
| Read existing portal profiles and the portal port | `getPortalProfile`, `getPortalPort` |
| Guest VLAN / LAN network | `createLanNetwork`, `updateLanNetwork` |
| Guest SSID | `createSsid`, `updateSsid` (`guestNetEnable`, broadcast), `updateSsidRateLimit`, `updateSsidWlanSchedule`, `updateSsidMultiCastConfig` |
| Keep guests out of internal networks | `createGatewayAcl` / `updateGatewayAcl` (if guest isolation alone is not enough) |
| Create or edit the captive portal, vouchers, portal branding | **not available**: controller UI (Hotspot / Portal) |

## Capability profile needed

| Phase | Tools | Grant | Profile |
| --- | --- | --- | --- |
| Interview and review | `listSites`, `getWlanGroupList`, `getSsidList`, `getSsidDetail`, `getLanNetworkListV2`, `getPortalProfile`, `getPortalPort`, `getRateLimitProfiles`, `listRadiusProfiles`, `getRadiusServer`, `getDataRetention`, `getGridGatewayRule`, `listOsgAcls` | `all:r` | `safe-read` + `OMADA_TOOL_CATEGORIES=all:r` |
| Guest VLAN | `createLanNetwork` | `network-lan:rw` | `admin` or explicit grant |
| Guest SSID | `createSsid`, `updateSsid`, `updateSsidRateLimit`, `updateSsidWlanSchedule` | `wireless-ssid:rw` | `admin` or explicit grant |
| Extra isolation rule | `createGatewayAcl` | `firewall-acl:rw` | `admin` or explicit grant |

## Workflow

1. **Interview.** Collect, without filling in defaults yourself:
   site; SSID name; bands; authentication type for the portal
   (click-through, voucher, local users, RADIUS, external); session
   length; per-client up/down limits; opening hours (WLAN schedule);
   guest VLAN and subnet (or "no VLAN, isolation only"); landing page
   and terms text owner; data-protection owner and retention period.
2. **Review what exists.** `getWlanGroupList` / `getSsidList` /
   `getSsidDetail` (is there already a guest SSID?),
   `getLanNetworkListV2` (free VLAN ID and subnet?), `getPortalProfile`
   and `getPortalPort` (existing portals), `getRateLimitProfiles`,
   `listRadiusProfiles` (for RADIUS auth), `getDataRetention`.
3. **Plan.** Write the plan as a short list of changes with the tool for
   each and the manual portal steps. Show it before any write.
4. **Guest VLAN (optional).** `createLanNetwork` through the safe-change
   loop. Build the payload from an existing LAN object, change name,
   VLAN, subnet and DHCP range only.
5. **Guest SSID.** `createSsid` (payload from an existing SSID in the
   same WLAN group, with guest network enabled and the guest VLAN), or
   `updateSsid` with `guestNetEnable: true` on an existing one. Then
   `updateSsidRateLimit` and, if needed, `updateSsidWlanSchedule`. The
   passphrase (if any) is entered by the operator; never echo it.
6. **Portal (manual).** Give the operator the controller-UI steps from
   `RESOURCES.md` for the chosen authentication type, bound to the SSID
   created above. Templates or site templates that carry SSID settings
   must be applied before the portal is attached, or they may overwrite
   the SSID's portal link later.
7. **Verify.** `getSsidDetail` (guest network on, VLAN, rate limit,
   schedule), `getPortalProfile` (portal present and bound),
   `getLanNetworkListV2`. Ask the operator to test with a phone: portal
   appears, internet works, internal addresses (gateway UI, printers,
   NAS) are unreachable.

## Rules

- One change per safe-change loop; the operator approves each preview.
- No passphrases, RADIUS secrets or voucher codes in the conversation
  output or notes.
- Guest portals collect personal data (names, emails, phone numbers,
  MACs). Make sure the operator has a privacy notice and consent text on
  the portal, a retention period that matches `getDataRetention`, and
  knows where the data is stored (local controller vs cloud). Flag it if
  any is missing; do not invent legal text.
- A portal created twice in the UI gives two portals; check
  `getPortalProfile` before telling the operator to create one.

## Examples

- [examples/voucher-portal-single-site.md](examples/voucher-portal-single-site.md):
  voucher portal for a hotel lounge.
- [examples/branded-portal-with-template.md](examples/branded-portal-with-template.md):
  click-through portal on sites that use a site template.
