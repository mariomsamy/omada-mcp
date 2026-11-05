# Example: ten stores aligned with a reference store

Operator: "Stores 01-10 should all look like Store-00: Staff VLAN 20,
POS VLAN 30, a guest SSID, and the nightly AP reboot."

Inventory and preflight (`safe-read`, `OMADA_TOOL_CATEGORIES=all:r`):

1. `listSites`: Store-00 to Store-10 all exist.
2. Reference Store-00: `getLanNetworkListV2` (Staff 20 10.0.20.0/24,
   POS 30 10.0.30.0/24), `getSsidList` / `getSsidDetail` (Staff,
   Guest with isolation), `getRebootScheduleList` (03:00 daily).
3. Each store read the same way. Findings:
   - Stores 01-06: conform except no reboot schedule (DIFF).
   - Stores 07-09: POS network missing (DIFF), Guest SSID without
     isolation (DIFF).
   - Store-10: VLAN 30 already used by "Cameras" (CONFLICT).
   - Store-04: 2 pending APs (`listPendingDevices`).
   - Stores use one shared VPN, so each store gets its own subnet
     (10.<store>.20.0/24): no overlaps (PASS).
4. Report to the operator; Store-10 waits for a decision on VLAN 30.

Waves (grant widened to `all:r,maintenance:rw,network-lan:rw,wireless-ssid:rw,schedules:rw,devices-general:rw`):

5. Pilot Store-07: `backupSites` (dry run, approve, apply,
   `getSiteBackupResult`). Then three safe-change loops:
   `createLanNetwork` (POS, built from the Store-00 object with the
   Store-07 subnet), `updateSsid` (`guestNetEnable: true` on Guest),
   `createRebootSchedule`. Each previewed, approved and read back.
6. Re-read Store-07: conformant. Wave 2: stores 08-09. Wave 3: 01-06
   (reboot schedule only) and the two adoptions at Store-04 after hours.
7. Final report: 9 stores conformant, Store-10 blocked on CONFLICT,
   grant reduced to `all:r`.
