# Diagnose runbook

- [ ] Server exposes `getWifiHealthSummary` (needs `wireless-radio:r`).
- [ ] Site confirmed with `listSites`; complaint time window written
      down in ISO form.
- [ ] `getWifiHealthSummary` called with a window covering the
      complaint; missing sections listed.
- [ ] Retry/drop checked (`getRetryAndDroppedRate`, seconds) if the
      summary lacked it.
- [ ] Zoom path chosen from the signal table and the reason stated.
- [ ] Client zoom: `diagnoseClient` -> `getGridClientHistory`; dossier
      filled; ping-pong and disconnect reasons checked.
- [ ] AP zoom: `getApDetail`, `getApRadios`, `getRadiosConfig`; runtime
      vs configured channel compared (`freq` trusted).
- [ ] Verdict written in four lines with evidence and a next step.
- [ ] No write tool called; any fix named for omada-safe-change with
      its grant.
