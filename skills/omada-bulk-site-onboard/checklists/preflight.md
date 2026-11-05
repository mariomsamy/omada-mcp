# Preflight checklist (per wave)

Run with read-only categories. Every line ends PASS, DIFF, CONFLICT,
MANUAL or UNKNOWN per site.

## Scope

- [ ] Every target site exists (`listSites`); missing sites listed as
      MANUAL (create in the controller UI).
- [ ] Reference chosen and read (template or reference site).

## Network

- [ ] LAN networks compared by name: VLAN ID, subnet, gateway, DHCP
      range (`getLanNetworkListV2`).
- [ ] No subnet overlaps between sites that share a VPN or will be
      interconnected.
- [ ] VLAN IDs not already used for a different network on the site.
- [ ] DHCP ranges do not include reserved addresses
      (`getDhcpReservationGrid`).
- [ ] LAN profiles compared (`getLanProfileList`).

## Wireless

- [ ] SSIDs compared by name: band, security mode, encryption, guest
      isolation, VLAN (`getSsidList`, `getSsidDetail`).
- [ ] No SSID with the same name but different security on one site.
- [ ] Passphrase handling agreed (operator enters it at apply time or in
      the UI).

## Devices and site

- [ ] Pending devices listed (`listPendingDevices`) and approved for
      adoption.
- [ ] Device count within site capacity (`getSiteCapacity`).
- [ ] Critical firmware noted (`getUpgradeOverviewCritical`); upgrades
      are a separate, later change.
- [ ] Time zone and NTP sane (`getSiteDetail`, `getSiteNtpStatus`).

## Before applying

- [ ] Backup of every site in the wave applied and confirmed.
- [ ] Grant widened only for the categories this wave needs.
- [ ] Rollback values (before objects) saved per site.
