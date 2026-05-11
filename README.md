# Bone Report Generator

Static bone scan report generator for WEBNM GUI report workflows.

## Integration

This app follows the same browser-window contract as `mpi-report-generator`:

1. `gui-report-extension` opens the deployed generator URL.
2. The user generates the report in this app.
3. The user clicks `Send report data`.
4. The app sends a structured payload to `window.opener.postMessage`.

Canonical payload:

```js
{
  type: "GUI_REPORT_RESULT",
  areas: {
    Procedure: { value: "...Tc-99m MDP..." },
    Findings: { value: "..." },
    Impression: { value: "..." },
    Keyword: { value: "left ilium → N: follow-up S: 5 I: 48 X: 120 Y: 220\n# → N: general note" }
  },
  generatorState: {}
}
```

Legacy top-level fields are still included temporarily:

```js
{
  Procedure: "...Tc-99m MDP...",
  Findings: "...",
  Impression: "...",
  Keyword: "left ilium → N: follow-up S: 5 I: 48 X: 120 Y: 220\n# → N: general note"
}
```

WEBNM mapping for MCIID `9310401`:

```json
{
  "ClinicalHistory": "area_128",
  "Procedure": "area_129",
  "Findings": "area_130",
  "Impression": "area_131",
  "Keyword": "keyword"
}
```

WEBNM mapping for MCIID `9310409` (`Bone scan with SPECT`):

```json
{
  "ClinicalHistory": "area_163",
  "Procedure": "area_164",
  "Findings": "area_165",
  "Impression": "area_166",
  "Keyword": "keyword"
}
```

Clinical History is read-only context for both MCIIDs and is intentionally not overwritten. `Keyword` maps to `keyword` for both MCIIDs.

MCIID `9310409` writes the SPECT-specific Procedure text:

```text
1. A bone scan consisting of whole body and/or spot views is obtained by gamma camera with low energy high resolution collimator 3 hours after the intravenous injection of 20 mCi of Tc-99m MDP.
2. SPECT technique is also performed for further evaluation.
```

When opened by `gui-report-extension`, draft state is scoped by `referno` and cached for 5 days through extension-owned `chrome.storage.local`. Standalone localStorage fallback is also scoped instead of using a shared `tableData` key.

Column visibility, column widths, and table/report pane ratio preferences are stored as user-level local settings, not per patient. `Previous Impression` is a local reference column for parsed prior-report context and is not included in the returned `Keyword` payload.

Table draft data is short-lived and versioned. The app only loads the latest `TABLE_DATA_SCHEMA_VERSION`; older, future, missing, or malformed table data is intentionally rejected instead of migrated. User preferences such as column visibility, column widths, and pane ratio remain separate and reset leniently when invalid.

## Local Use

Open `index.html` directly, or serve the folder with any static file server.

Sensitive local reference data such as `for_reference_only/reports.csv` is intentionally ignored by git.
