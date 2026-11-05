# Portal preflight checklist

## Interview complete

- [ ] Site, SSID name, bands.
- [ ] Portal authentication type and its prerequisites.
- [ ] Session length, per-client rate limits, opening hours.
- [ ] Guest VLAN and subnet, or "isolation only".
- [ ] Landing page text owner; privacy notice and consent owner.
- [ ] Retention period and data location agreed.

## Current state read

- [ ] Existing SSIDs and WLAN groups (`getWlanGroupList`, `getSsidList`).
- [ ] Existing portals (`getPortalProfile`, `getPortalPort`).
- [ ] VLAN ID and subnet free (`getLanNetworkListV2`).
- [ ] RADIUS profile exists, if RADIUS (`listRadiusProfiles`).

## Changes (each via omada-safe-change)

- [ ] Guest LAN created and read back (`createLanNetwork`), if used.
- [ ] Guest SSID created or updated with guest network on
      (`createSsid` / `updateSsid`), read back with `getSsidDetail`.
- [ ] Rate limit and schedule applied and read back.
- [ ] Portal created in the controller UI and confirmed with
      `getPortalProfile`.
- [ ] Isolation tested from a guest device.
- [ ] Grant reduced back to read-only.
