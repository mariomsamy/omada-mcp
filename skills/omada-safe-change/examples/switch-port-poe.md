# Example: power-cycle PoE on one switch port

Operator: "The camera on switch SW-Garage port 7 is frozen. Power-cycle it."

Server: `OMADA_TOOL_CATEGORIES=all:r,devices-switch:rw`.

1. `listDevices` -> SW-Garage MAC `AA-BB-CC-00-11-22`.
2. Before state: `getSwitchDetail { switchMac }` shows port 7 with PoE on
   and a profile override not yet enabled.
3. The server requires a confirmed profile override before a PoE change.
   That is a separate change, so it gets its own loop:
   - Dry run `setSwitchPorts { switchMac, ports: [7], change: { operation: "profile-override", profileOverrideEnable: true } }`
     -> `planned`.
   - Operator approves, apply with `dryRun: false` -> `verified`.
4. PoE off: dry run `setSwitchPorts { switchMac, ports: [7], change: { operation: "poe-mode", poeMode: 0 } }`
   -> `planned`. Impact stated: "The camera on port 7 loses power. Nothing
   else on the switch is touched." Operator approves, apply -> `verified`.
5. PoE on: same loop with `poeMode: 1` -> `verified`.
6. Read back: `getSwitchDetail` shows PoE on for port 7. After two
   minutes `diagnoseCameraConnectivity` (or `diagnoseClient` with the
   camera's MAC) shows the camera online again.

Notes:

- Port IDs are explicit (1-32 per call). Never "all ports".
- If `setSwitchPorts` reports a LAG member, it refuses unless
  `allowDisruption` is set; ask the operator before setting it.
- `change` takes one operation per call: `name`, `status`, `poe-mode`,
  `profile` or `profile-override`. Confirm with
  `describeOperation setSwitchPorts` if the schema may have changed.
