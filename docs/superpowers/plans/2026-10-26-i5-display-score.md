# I5 display score implementation plan

> **For agentic workers:** Use verification-before-completion and test-driven-development for this small, fully specified display change.

**Goal:** Replace the dashboard's displayed regional I5 value with the existing model's 0–10 score centered at 5, keeping the exact label `지역 고립 지수`.

**Architecture:** Reuse the official fixed transform from the sibling model. Add display fields to verified survey query responses without rewriting source bundles or raw measurements. Render those fields in the existing dashboard layout, including map colors and accessible labels.

**Spec:** User request in this chat: “이 값으로 지금 지역고립지수를 대신하자 워딩은 똑같은 지역 고립 지수로”.

## Constraints

- Reference version: `i5_sgg_202512_equal_weight_v1`; use the existing model constants and transform verbatim.
- Keep the label `지역 고립 지수`; display the maximum as 10.
- Keep the current dong navigation and layout; keep domain scores, raw I5, source bundles, activity categories and report evidence unchanged.
- Missing display values remain unknown, never fall back to a 0–100 raw score on a 0–10 scale.
- Province map summaries use adult-population-weighted z values before clipping to 0–10.
- No dependency installs or unrelated changes. The user subsequently authorized committing and pushing this change.

## Tasks

- [x] Add regression tests for ordinary/province/dong survey responses, preserved raw fields, and dashboard values/colors/missing values; observe failures.
- [x] Copy the official transform, enrich final survey responses after province pagination, and update dashboard list/detail/map/legend using display fields.
- [x] Run relevant backend and frontend suites plus build; review the diff; restart the existing API and verify actual dashboard values in the browser.

## Decisions

- Apply this request to the current dashboard. Saved reports retain the evidence values with which they were generated.
- Work in the existing clean `codex/repair-report-flow` checkout because the running local service serves it and this is a narrow display change.
- Map intervals are `<3`, `3–4`, `4–6`, `6–7`, `≥7`: centered on 5 using one and two standard deviations.

## Verification result

- Backend final model suite: 37 passed, 1 skipped (frozen V3 export not present in the integrated checkout).
- Frontend: 395 passed across 21 files; production build passed.
- Independent code review: no actionable implementation issues.
- Live restarted API/dashboard: December 2025 역삼1동 shows 지역 고립 지수 2.61 /10 in detail, list and map label.
- Existing raw bundles and source evidence were not rewritten.

## Publication check

2026-10-26: user requested Git push. Fresh checks: backend 37 passed / 1 skipped, frontend 395 passed, production build passed. Final upload review found only the ten task files and no secrets or runtime outputs. The screenshot was re-encoded as PNG without changing its pixels to match the existing delivered filename.
