# Contributing

Thanks for your interest in contributing!

## Reporting bugs

Open an issue and include:

- Browser and version (e.g. Chrome 131)
- What you expected vs. what happened
- A video URL where the problem occurs, if possible
- The status text shown in the results area, if any
- Console errors (F12 → Console), filtered by `ycs` if possible

## Requesting features

Open an issue describing the use case — screenshots/mockups help a lot.

## Pull requests

- Keep the code dependency-free: this extension intentionally has no build
  step and no external libraries
- Follow the existing style (vanilla JS, comments in English)
- Test on a real YouTube video before submitting — the comments section must
  be scrolled into view to verify the widget mounts
- Remember YouTube has **two comment formats** (`commentRenderer` and
  `commentViewModel`/entities) — changes to fetching/parsing should handle both

## Project layout

```
manifest.json      # MV3 manifest
src/
  fetcher.js       # MAIN world: Innertube API calls, comment parsing
  content.js       # Isolated world: widget UI, filtering, result rendering
  panel.css        # Fallback styles for light-DOM highlights
icons/             # Extension icons + README banner
```

The two scripts communicate over `window.postMessage` with a
`ycs-req`/`ycs-res` protocol.
