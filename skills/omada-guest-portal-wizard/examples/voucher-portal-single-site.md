# Example: voucher portal for a hotel lounge

Operator: "Guests in the lounge should get Wi-Fi with a voucher, 4 hours
per voucher, 10 Mbps down."

1. Interview: SSID "Lounge-Guest", 2.4 + 5 GHz, voucher auth, 240 min,
   10/3 Mbps per client, 24 h, guest VLAN 50 10.50.0.0/24, privacy
   notice owned by the hotel's data-protection officer, retention 30
   days.
2. Review (`all:r`): `getSsidList` has no guest SSID;
   `getLanNetworkListV2` shows VLAN 50 free; `getPortalProfile` shows no
   portal; `getDataRetention` keeps client data 30 days (matches).
3. Plan shown: create LAN "Guest" (VLAN 50), create SSID
   "Lounge-Guest" (open, guest network on, VLAN 50), set rate limit,
   then create the voucher portal in the UI.
4. Grant `all:r,network-lan:rw,wireless-ssid:rw`. Safe-change loops:
   - `createLanNetwork` (payload from the existing "Staff" LAN, name,
     VLAN, subnet, DHCP range changed) -> planned -> approved -> applied
     -> `getLanNetworkListV2` shows Guest.
   - `createSsid` (payload from an existing SSID in the same WLAN group,
     guest network on, VLAN 50, open security) -> applied ->
     `getSsidList` shows Lounge-Guest.
   - `updateSsidRateLimit` -> applied -> `getSsidDetail` shows 10/3 Mbps.
5. Manual: operator creates the voucher portal in the controller UI,
   bound to Lounge-Guest, 240-minute vouchers, privacy notice text from
   the DPO.
6. Verify: `getPortalProfile` lists the portal bound to Lounge-Guest.
   Operator tests from a phone: portal shows, internet works, the
   reception PC and the controller are unreachable.
7. Grant back to `all:r`.
