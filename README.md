<p align="center">
  <img src="icons/banner.png" alt="YouTube Comment Search" width="640">
</p>

<p align="center">
  <a href="https://github.com/nistrocraft/youtube-comment-search/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/nistrocraft/youtube-comment-search"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
  <img alt="Manifest V3" src="https://img.shields.io/badge/manifest-v3-brightgreen">
</p>

Search every comment on a YouTube video — including replies — without
scrolling. A Manifest V3 extension for Chrome and Edge.

## Why not Ctrl+F?

YouTube only loads comments as you scroll, so browser find-in-page misses most
of them. This extension fetches the **entire** comment thread through YouTube's
own internal API and lets you search all of it instantly.

## Features

- Searches **all comments** on the video — replies included, no scrolling
- Works on **regular videos and Shorts** — magnifier sits in the comments
  header of each
- **Instant** — comments are preloaded in the background when the video opens
- **No API key** — uses YouTube's internal API with your existing session
- **Accent-insensitive** — `pokemon` finds `Pokémon`, on both comment text
  and author names
- **Match highlighting** in results that look like YouTube's native comments
- **Light/dark theme** follows your YouTube setting automatically

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

then load the cloned folder the same way.

## Usage

Open any YouTube video or Short, scroll to the comments (or open the
comments panel on a Short), and click the magnifier icon next to the
comment count. Type to filter — matches are highlighted. Close the search
to restore the normal comment list.

## How it works

- **`src/fetcher.js`** runs in the page's MAIN world and calls the internal
  `youtubei/v1/next` endpoint. The comments-section continuation token is
  generated deterministically from the video ID (the same technique yt-dlp
  uses), so no lazy-scroll is required. Both comment formats are supported:
  legacy `commentRenderer` and the newer `commentViewModel`/entity payloads.
- **`src/content.js`** injects the widget, receives the comment list via
  `postMessage`, filters it and renders the results.

## Limitations

- Videos with comments disabled have nothing to search
- Videos with hundreds of thousands of comments take a while to preload
- Live chat messages and community posts are not covered
- It relies on YouTube's *internal, undocumented* API — if YouTube changes the
  response format, fetching may break until `src/fetcher.js` is updated

## FAQ

**Does it work on Firefox?**
Not currently — the manifest targets Chromium (Manifest V3). Porting would
need small adjustments.

**Does it search Shorts or live streams?**
Shorts: yes — open the comments panel on a Short and the magnifier sits in
the panel header. Live streams: only the post-stream comments, not live
chat.

**Is my data safe?**
Yes — nothing leaves your browser. All requests go to `youtube.com` itself
using the session already on the page. No analytics, no tracking.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

## Disclaimer

Not affiliated with YouTube or Google. YouTube is a trademark of Google LLC.
