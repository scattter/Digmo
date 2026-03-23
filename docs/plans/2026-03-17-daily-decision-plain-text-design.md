# Daily Decision Plain Text Design

**Date:** 2026-03-17

**Problem**

`daily-decision:generate` currently requires the model to return strict structured JSON with `overallRiskLevel`, `actions`, and `citations`. In practice this makes third-party model compatibility fragile. The request fails either by timing out on reasoning-heavy models or by returning non-JSON text on faster models.

**Decision**

Convert daily decision generation to a pure-text workflow:

- The model returns plain text only.
- The backend stores the generated suggestion as a whole text blob.
- Structured `actions` are no longer part of the feature contract.
- The frontend renders the suggestion as plain text for latest and history views.
- Suggestion-binding flows that depend on `actions` are removed.

**Backend Shape**

- Keep the existing decision-doc upload and persistence flow.
- Change the decision provider to generate plain text instead of structured JSON.
- Persist only summary text and generation metadata for daily decisions.
- Stop validating or storing `actions`, `citations`, and `overallRiskLevel`.
- Keep database compatibility by continuing to read historical rows, but new runs will save no actions.

**Frontend Shape**

- Latest decision panel displays the stored suggestion text only.
- Decision history dialog displays one plain-text entry per run.
- Any UI that depends on per-action suggestions is removed or disabled.

**Compatibility**

- Existing historical rows with structured actions remain readable.
- Frontend no longer renders those actions; it only shows `summary`.
- API consumers continue to receive a `decision` object, but its contract becomes text-oriented.

**Success Criteria**

- `POST /v1/portfolios/:portfolioId/daily-decision:generate` succeeds with plain-text model output.
- Latest suggestion and history render correctly in the web app.
- No frontend flow references `decision.actions`.
- Decision generation becomes tolerant of non-JSON model output.
