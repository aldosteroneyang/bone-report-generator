# Bone Report Generator

Static bone scan report generator for WEBNM GUI report workflows.

## Integration

This app follows the same browser-window contract as `mpi-report-generator`:

1. `gui-report-extension` opens the deployed generator URL.
2. The user generates the report in this app.
3. The user clicks `Send report data`.
4. The app sends a structured payload to `window.opener.postMessage`.

Payload fields:

```js
{
  Procedure: "...Tc-99m MDP...",
  Findings: "...",
  Impression: "...",
  Keyword: "left ilium → S: 5 I: 48"
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

`area_128` Clinical History is intentionally not overwritten.

## Local Use

Open `index.html` directly, or serve the folder with any static file server.

Sensitive local reference data such as `for_reference_only/reports.csv` is intentionally ignored by git.
