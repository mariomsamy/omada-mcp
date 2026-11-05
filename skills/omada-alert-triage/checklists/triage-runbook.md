# Triage runbook

- [ ] Server exposes `listSiteAlerts` (needs `logs:r`) and `listSites`.
- [ ] Site and window confirmed; ISO start/end echoed in the site time
      zone; window converted to milliseconds.
- [ ] Live state checked with `getNetworkHealthSummary`.
- [ ] Alerts paged until the window is covered or 500 read; truncation
      stated.
- [ ] Empty result cross-checked with `diagnoseLogs`.
- [ ] Groups built (type, normalised severity, target), ranked, unknown
      bucket read.
- [ ] Top 3-5 device groups zoomed with the type-specific detail tool;
      APs checked for a shared uplink.
- [ ] Events read around the biggest spike.
- [ ] Report written; hand-offs named, none executed.
