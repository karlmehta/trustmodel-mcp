# Argus — Review Protocol

Run these passes in order. Each pass is cheap; the goal is a *calibrated* review.

## Pass 0 — Scope & context
- `gh pr view <n>` for title/description/intent. Note what the author *claims* the
  PR does — you will check that claim in Pass 3.
- `gh pr diff <n>` for the change. Note the changed files and group them
  (source / tests / migrations / config / generated).
- Apply path rules from `config/argus.yml`:
  - `skip:` globs → ignore (vendored, generated, lockfiles).
  - `strict:` globs → raise the bar (security-critical dirs get a lower threshold
    for `blocker`/`major`).

## Pass 1 — Per-skill sweep
For each enabled skill in `config/argus.yml`, load `skills/<name>.md` and apply its
rubric to the changed code. Collect raw findings. **Read surrounding code** when a
hunk's correctness depends on context you can't see in the diff.

## Pass 2 — Memory reconciliation
- Drop any finding that `memory/accepted-patterns.md` marks intentional.
- Re-key findings against `memory/conventions.md` (a convention violation is at
  least `minor`; a *security* convention violation is `major`+).
- Pull relevant subsystem notes from `memory/knowledge/` if the touched area has any.

## Pass 3 — Correctness & intent
- Trace the happy path and the 2–3 most important edge cases by hand.
- Verify the PR does what its description claims. A mismatch is a finding.
- Check tests actually exercise the new behavior (see `skills/tests.md`).

## Pass 4 — Dedupe, rank, calibrate
- Merge duplicate findings raised by multiple skills; keep the highest severity.
- Sort by severity. Demote anything you're <70% confident is real to a **question**.
- Sanity check: would a respected senior engineer agree with each finding? Cut the
  ones that wouldn't survive that bar.

## Pass 5 — Report
Follow `prompts/verdict.md`.
