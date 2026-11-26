<p align="center">
  <img src="icons/banner.png" alt="YouTube Comment Search" width="640">
</p>

<p align="center">
  <a href="https://github.com/nistrocraft/youtube-comment-search/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/nistrocraft/youtube-comment-search"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
  <img alt="Manifest V3" src="https://img.shields.io/badge/manifest-v3-brightgreen">
</p>

A browser extension (Manifest V3) that adds instant comment search to YouTube
watch pages — it searches **every comment** on the video, including replies,
and filters with the speed of a native feature.

## Features

- **Compact magnifier** injected into the comments header ("N comments /
  Sort by") that expands into an inline search field
- **Background preloading** — all comments are fetched when the video page
  opens, so the first search is already instant
- **Full coverage** — top-level comments *and* replies, powered by YouTube's
  own internal API (no API key needed)
- **Accent-insensitive matching** — `historia` finds `história`, `ç`, `ã`, etc.,
  on both comment text and author names
- **Match highlighting** in the results
- **Native look & feel** — result cards mimic YouTube's comment layout,
  follows light/dark theme automatically
- **Hides the original list** while searching — no duplicated comment sections
- Collapses on click-out (search stays applied); `Esc` or `×` clears everything
- Match counter shows real totals even before comments finish rendering

## Install

**From a release (easiest):**

1. Download the latest `youtube-comment-search-*.zip` from
   [Releases](https://github.com/nistrocraft/youtube-comment-search/releases/latest)
   and extract it
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge)
3. Enable **Developer mode**
4. Click **Load unpacked** and select the extracted folder

**From source:**

```sh
git clone https://github.com/nistrocraft/youtube-comment-search.git
```

then load the cloned folder the same way as above.

## Usage

1. Open any YouTube video and scroll to the comments section
2. Click the magnifier icon next to the comment count / sort menu
3. Type to filter — matching text is highlighted in yellow
4. Click the magnifier again or click elsewhere to collapse (search stays on)
5. `Esc` or `×` clears the filter and restores the normal comment list

## How it works

- **`src/fetcher.js`** runs in the page's MAIN world and calls the internal
  `youtubei/v1/next` endpoint with the user's own session. The comments-section
  continuation token is generated deterministically from the video ID (the same
  technique yt-dlp uses), so no lazy-scroll is required. Both comment formats
  are supported: the legacy `commentRenderer` and the newer
  `commentViewModel`/entity payloads.
- **`src/content.js`** runs in the isolated world: it injects the widget,
  receives the comment list via `postMessage`, filters it, and renders the
  results. Theme colors come from YouTube's `html[dark]` attribute so they
  work inside shadow roots too.

## Privacy

Nothing leaves your browser. All requests go to `youtube.com` itself using the
session already present on the page. No analytics, no tracking, no remote
servers.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

Note: the extension relies on YouTube's *internal, undocumented* API. If
YouTube changes its response format, `src/fetcher.js` may need updating —
please open an issue if comment fetching breaks.

## License

[MIT](LICENSE)

## Disclaimer

Not affiliated with YouTube or Google. YouTube is a trademark of Google LLC.
