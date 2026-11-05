# Change record and pre-flight checklist

Copy this block into the conversation (or the operator's ticket) for
every applied change. Leave secrets out.

## Pre-flight

- [ ] Server exposes the write tool (`getServerCapabilities`), with the
      narrowest category grant that works.
- [ ] Target resolved by read tools: site ID, device MAC / SSID ID /
      port IDs / client MAC echoed back to the operator.
- [ ] Before state captured with the paired read tool (see
      `RESOURCES.md`).
- [ ] Change limited to the requested fields; payload built from the
      before object.
- [ ] Impact stated: who disconnects, what reboots, expected duration.
- [ ] High-risk change: `backupSites` done (dry run, then applied) and
      out-of-band access confirmed.
- [ ] Dry run returned `planned`; preview shown verbatim.
- [ ] Operator approved this exact preview.

## Record

```
Change:        <one line>
Site / target: <siteId> / <MAC, SSID ID, port IDs>
Tool:          <write tool>
Profile/grant: <OMADA_CAPABILITY_PROFILE> / <OMADA_TOOL_CATEGORIES>
Approved by:   <operator> at <ISO time>
Before:        <fields that change, before values>
Requested:     <fields, new values>
Apply status:  <planned -> submitted | verified | mismatch | unknown | partial>
Read-back:     <read tool, time, observed values>
Outcome:       verified | not applied | unknown
Health check:  <tool and result after the change>
Rollback:      <same tool, before values> (not needed / done at <time>)
```

## After

- [ ] Read-back done (repeated after 30-60 s for radio and SSID changes).
- [ ] Health evidence re-checked.
- [ ] Category grant reduced back to read-only if it was widened for
      this change.
