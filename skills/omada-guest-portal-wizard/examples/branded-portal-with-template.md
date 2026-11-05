# Example: click-through portal on template-based sites

Operator: "Our branches use the site template 'branch-v3'. Add a
click-through guest portal with our terms page."

1. Review: `getSiteTemplateList` -> `branch-v3`;
   `getSiteTemplateConfig` shows the template already defines a "Guest"
   SSID with guest network on. `listSites` -> 4 branches.
   `getPortalProfile` per branch: no portals yet.
2. Ordering matters: because the template carries the Guest SSID,
   confirm with the operator that all branches have the template applied
   (controller UI) before attaching portals, otherwise re-applying the
   template later can reset the SSID's portal link.
3. Per branch: `getSsidDetail` for Guest confirms guest network on and a
   rate limit. One branch lacks the rate limit; fixed with
   `updateSsidRateLimit` through omada-safe-change
   (`wireless-ssid:rw`).
4. Manual per branch: create a click-through portal in the controller UI
   bound to Guest, with the operator's terms and privacy text and a
   redirect to the company page.
5. Verify per branch: `getPortalProfile` shows one portal bound to
   Guest. Note any branch where two portals exist (created twice) for
   the operator to remove in the UI.
