# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-26

### Added

- Magnifier icon injected into the YouTube comments header that expands into
  an inline search field
- Background preloading of all comments (including replies) via YouTube's
  internal `youtubei/v1/next` API with a generated comments-section
  continuation token
- Support for both legacy (`commentRenderer`) and new (`commentViewModel` +
  entities) comment formats
- Instant, accent-insensitive filtering over comment text and author names
- Match highlighting in rendered results; native-looking comment cards with
  avatar, author, timestamp, reply badge and like count
- Original comment list hidden while a search is active
- Light/dark theme support via YouTube's `html[dark]` attribute
- Click-outside collapse that keeps the search applied; `Esc`/`×` clears it
- Extension icons (16/48/128)
