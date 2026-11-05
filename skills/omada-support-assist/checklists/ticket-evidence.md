# Ticket evidence checklist

- [ ] Server exposes `listSiteAuditLogs` and `listSiteAlerts` (needs
      `logs:r`).
- [ ] Site and window explicit; ISO echoed back in site time zone.
- [ ] Site context from `getNetworkHealthSummary`.
- [ ] Alerts and events read with both time bounds; empty results
      checked with `diagnoseLogs`.
- [ ] Audit log read for the window plus 30 minutes before it.
- [ ] Each alert cluster paired with its closest preceding change, or
      marked "no preceding change".
- [ ] Device or client snapshot only if one was named.
- [ ] No causal claim; wording is "closest preceding change".
- [ ] Personal data minimised.
- [ ] Next steps name the write tool and grant; nothing executed.
