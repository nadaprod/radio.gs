# Contributing to RADIO.GS

Thanks for poking at this. Before you open a PR, please read this — it's short.

## The one-file rule

Everything ships from a single file: `public/index.html`. HTML, CSS, JavaScript, and default station data all live there. This is deliberate:

- **No build step.** Clone → serve `public/` → done.
- **No toolchain drift.** There is nothing to `npm install`, no bundler to version-pin, no transpile target to argue about.
- **One file is auditable.** A reader can load the whole app in their head in an afternoon.

So: **do not** introduce a `package.json`, `node_modules`, a bundler, a framework, a CSS preprocessor, or any compile step. PRs that do will be closed with love.

If something legitimately needs to be separate (e.g. service worker, manifest, static asset), it goes in `public/` as a sibling file — same spirit, no build.

## Running it

```bash
python3 -m http.server --directory public 8000
# open http://localhost:8000/
```

Any static server works. For the service worker to register, you need `http://` or `https://` — `file://` won't do.

## Testing

There are no automated tests. Verify manually:

1. Default stations load on first visit (clear `localStorage` with `localStorage.removeItem('radio_gs_data')`).
2. `#<slug>` selects a station.
3. `#import:<base64>` imports a shared station (generate one from ⚙ → Share).
4. Track auto-advances via SoundCloud's `FINISH` event.
5. The PWA installs (Chrome devtools → Application → Manifest).
6. Offline: disable network, reload — the shell should still render.

## Style

- UI copy mixes English (system-y terms: `SCANNING`, `FREQ`, `BITRATE`) and French (conversational: `alert`/`prompt` messages). Keep that bilingual flavor.
- CSS uses `--accent: #D4FF00` as the brand color. Don't hardcode colors; use the variable so `extractColor()` (if it ever beats CORS) can recolor globally.
- The three classes — `BokehScene`, `ArtworkTilt`, `AudioApp` — are the seams. New features should either extend one of those or justify being a new class.

## Licensing

By contributing, you agree your changes will be released under the MIT license (see `LICENSE`). Don't paste in GPL'd code from elsewhere.
