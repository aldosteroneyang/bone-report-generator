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
  "Procedure": "area_129",
  "Findings": "area_130",
  "Impression": "area_131",
  "Keyword": "keyword"
}
```

`area_128` Clinical History is read-only context and is intentionally not overwritten.

When opened by `gui-report-extension`, draft state is scoped by `referno` and cached for 5 days through extension-owned `chrome.storage.local`. Standalone localStorage fallback is also scoped instead of using a shared `tableData` key.

## Local Use

Open `index.html` directly, or serve the folder with any static file server.

Sensitive local reference data such as `for_reference_only/reports.csv` is intentionally ignored by git.
