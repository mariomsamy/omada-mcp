# Resources: guest portal wizard

## Authentication types (portal, set in the controller UI)

| Type | Good for | Prerequisites | Notes |
| --- | --- | --- | --- |
| No authentication (click-through) | Cafes, waiting rooms | Terms text | Weakest consent record; still show a privacy notice |
| Simple password | Small venues | Shared password | Rotate regularly; anyone with it is in |
| Voucher | Hotels, events | Voucher groups with duration and limits | Codes are credentials: hand out, never paste into chat logs |
| Local user | Staff-guest, members | Local user accounts on the controller | Per-user accounting |
| RADIUS | Enterprises | RADIUS profile (`listRadiusProfiles`, `getRadiusServer`) | Shared secret configured in the UI, never via chat |
| External portal / SMS / social | Marketing-led venues | External service account | Data leaves the controller: check where it is stored |

Exact names and options vary by controller version; follow what the UI
offers.

## Controller UI steps (portal)

Menu names differ slightly between controller versions.

1. Site view -> Hotspot (or Settings -> Authentication) -> Portal -> Create.
2. Name the portal; select the guest SSID prepared earlier.
3. Pick the authentication type and its options (voucher group, RADIUS
   profile, session length).
4. Landing page: terms of use and privacy notice text supplied by the
   operator; optional redirect URL after login.
5. Save, then confirm with `getPortalProfile`.

## SSID fields that matter for guests

Read them with `getSsidDetail` after each change.

| Setting | Recommended | Tool |
| --- | --- | --- |
| Guest network (isolation from LAN) | on | `updateSsid` (`guestNetEnable`) |
| Security | open with portal, or WPA2/WPA3 personal plus portal | `createSsid` (set at creation) |
| VLAN | dedicated guest VLAN if the site uses VLANs | `createSsid` payload, `createLanNetwork` |
| Per-client rate limit | set (for example 10/5 Mbps) | `updateSsidRateLimit` |
| Schedule | opening hours if required | `updateSsidWlanSchedule` |
| Multicast / broadcast control | limit multicast on busy guest networks | `updateSsidMultiCastConfig` |
| Broadcast SSID name | on | `updateSsid` (`broadcast`) |

## Isolation test (operator, from a guest device)

- Portal page appears on first connect.
- Internet works after login.
- Gateway and controller management pages are unreachable.
- Internal servers, printers and cameras are unreachable.
- Other guest devices are unreachable (client isolation).

If internal addresses are reachable, propose a gateway ACL that blocks
the guest subnet from internal subnets (`createGatewayAcl`, via
omada-safe-change, `firewall-acl:rw`).

## Privacy checklist for portals

- Privacy notice and consent text on the landing page, owned by the
  operator's data-protection contact.
- Collect only what is needed (a voucher needs no email address).
- Retention period agreed and consistent with `getDataRetention`.
- Data location known (local controller, cloud controller region,
  external portal provider), especially where local data-residency
  rules apply.
- Access to guest data limited to named staff.

## Related skills

- [omada-safe-change](../omada-safe-change/SKILL.md): every write.
- [omada-bulk-site-onboard](../omada-bulk-site-onboard/SKILL.md): rolling the same guest setup to many sites.
- [omada-network-audit](../omada-network-audit/SKILL.md): checks S14/S15 cover guest encryption and isolation.
