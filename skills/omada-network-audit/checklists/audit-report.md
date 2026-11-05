# Audit report template and run checklist

## Run checklist

- [ ] Server started with `safe-read` and `OMADA_TOOL_CATEGORIES=all:r`.
- [ ] Site confirmed; audit time and controller version recorded.
- [ ] Every rubric dimension and security check marked with a value or
      UNKNOWN (with the reason: tool missing, empty data, `-1600`).
- [ ] No write tool called.
- [ ] Personal data reduced to counts in the report and absent from
      the baseline file.
- [ ] Baseline written only if the operator asked, at the path they
      chose.

## Report template

```
# Network audit: <site> (<siteId>)
Audited: <ISO time>   Controller: <version>   Profile: safe-read, all:r

## Scores
Wi-Fi: <total>/100 (<band>)   Unknown: <dimensions>
Security: <n> PASS, <n> WARN, <n> FAIL, <n> UNKNOWN
Change since baseline <date>: <per-dimension deltas, or "first audit">

## Findings (most severe first)
1. [FAIL, high] <check or dimension>: <what was observed>
   Evidence: <tool, time window, values>
   Suggested fix: <write tool> via omada-safe-change, needs <grant>
   (or "controller UI": no tool on this server)
2. ...

## Wi-Fi rubric
| Dimension | Score | Evidence |
| Airtime | 7 | busiest radio 52 % (AP-Hall 5 GHz) |
| ... |

## Security checklist
| # | Result | Note |
| S1 | PASS | IPS enabled, blocking |
| ... |

## Inventory
APs <n>, switches <n>, gateways <n>, pending <n>, offline <n>
Critical firmware upgrades pending: <n>
Latest site backup: <date or none>

## Unknowns and limits
- <section>: <why it could not be assessed>
```
