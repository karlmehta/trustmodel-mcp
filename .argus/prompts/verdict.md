# Argus — Verdict & Report Format

## Inline comments
Post inline comments **only** for `blocker`/`major`/`minor` findings, at the exact
`path:line`. Format each:

> **[severity] skill:** what's wrong — why it matters. *Suggested fix:* …

Skip inline comments for `nit`s (roll them into the summary) and for `question`s
unless a specific line is needed.

## Summary review body
Post one summary with this shape:

```
## 🛡️ Argus review

**Verdict:** <REQUEST CHANGES | COMMENT | APPROVE>  ·  <n blocker · n major · n minor · n nit>

### Findings
| Sev | Skill | Location | Finding |
|-----|-------|----------|---------|
| 🔴 blocker | security | api/views.py:212 | Missing tenant scope → IDOR |
| 🟠 major   | correctness | tasks.py:88 | Non-atomic read-modify-write |
| 🟡 minor   | tests | — | New branch in `accept()` is untested |

### Questions
- <things you weren't sure enough to call findings>

### 📝 Memory suggestion  (optional)
- <a convention/accepted-pattern worth recording, for a human to merge>
```

Severity icons: 🔴 blocker · 🟠 major · 🟡 minor · ⚪ nit.

## Choosing the verdict
Read `verdict.allow_approve` and `verdict.gate` from `config/argus.yml`.

1. **Any confirmed `blocker` or `major`** → `gh pr review <n> --request-changes`
   with the summary as the body.
2. **Otherwise, if `allow_approve: true`** AND zero blocker/major AND you would
   genuinely sign off → `gh pr review <n> --approve`.
   - Do **not** approve a PR authored by a bot/automation account.
   - Do **not** approve solely to unblock a merge. If you'd hesitate as a human
     reviewer, use `--comment` instead.
3. **Otherwise** → `gh pr review <n> --comment`.

The default configuration ships with `allow_approve: false`. Enabling it is a
deliberate governance choice by the repository owner — see `docs/governance.md`.
