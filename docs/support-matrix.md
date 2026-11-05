# Support and validation matrix

| Surface | Evidence (0.19.0-rc.1, extended in 1.0.0) | Limit |
| --- | --- | --- |
| stdio / MCP catalog | Local SDK protocol and schema tests | Client host approval policies remain external |
| Request/auth/pagination | Unit and local HTTP contracts | Live controller/firmware behavior varies |
| Software controller 6.2.14.11 | Existing installation confirmed; candidate observations in validation record | Selected reads/previews only, not all operations |
| New radio/SSID/switch apply paths | Official tag specs and mocked contract tests | Disposable controller and adopted hardware tests pending |
| All 89 write tools (1.0.0) | Loopback stub-controller test: dry run sends no mutating request; apply sends the documented method and path | Request shape only; controller acceptance and effect are not proven |
| Other software/hardware controllers | Not newly validated by this candidate | Verify each operation before granting write access |
| HTTP transport | Loopback lab only | Not production supported |
| Private GUI APIs / OC200 fallback | Not implemented | `compatibility` is a deprecated profile alias |

Use official Open API routes only. Availability in the catalog is not proof of controller or firmware support. See [release validation](operations/0.19-validation.md) for observed results and [release readiness](operations/release-readiness-checklist.md) for promotion gates.
