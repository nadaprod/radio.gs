# RADIO.GS

Shareable SoundCloud-enhanced radio. Zero backend, one HTML file.

Pick a station, hit play, and the app scans through a curated pool of SoundCloud sets — shuffling tracks, auto-advancing, and recoloring the UI from the current artwork. Build your own station, share it as a link or QR code, and the recipient gets it without any server or account.

## Run it

No build step. Serve the `public/` directory with any static server:

```bash
python3 -m http.server --directory public 8000
# then open http://localhost:8000/
```

That's it. The app is a single file at `public/index.html` and talks directly to the SoundCloud Widget API from the browser.

## How it works

- **Stations** are just `{ label, urls: [...] }` — a name and a list of SoundCloud set URLs. They live in `localStorage` under `radio_gs_data`. The defaults baked into the HTML are only used on first load.
- **Playback** drives a hidden SoundCloud iframe. On each scan the app picks a random set, then a random track inside it. When a track finishes, it scans again.
- **Sharing** is URL-based and server-free:
  - `radio.gs/#<slug>` — open a specific station.
  - `radio.gs/#import:<base64>` — a share link. The receiver's browser decodes it, adds the station to their local collection, and switches to it. Generate one from the ⚙ menu → **Share**.
- **Editing** a station: ⚙ → **Edit** shows one URL per line. Save to update. Save an empty list to delete the station (as long as at least one other remains).

## Install it (PWA)

`public/manifest.webmanifest` + `public/sw.js` turn RADIO.GS into an installable app:

- **Desktop Chrome / Edge:** the address bar shows an install icon; click it.
- **iOS Safari:** Share → *Add to Home Screen*. The synthwave splash shows on cold-launch.
- **Android Chrome:** menu → *Install app*.

The service worker precaches the app shell and falls back to a cached `index.html` when the network drops — so the UI loads offline even if SoundCloud playback obviously can't. When a new version deploys, a small `UPDATE_AVAILABLE // TAP_TO_RELOAD` pill appears at the bottom.

## Stack

- Vanilla HTML / CSS / JS — no framework, no bundler.
- [SoundCloud Widget API](https://developers.soundcloud.com/docs/api/html5-widget) for audio.
- [three.js](https://threejs.org/) for the bokeh background.
- `api.qrserver.com` for share-link QR codes.

## Contributing & license

- PRs welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md). **One file, no build.**
- Licensed under [MIT](LICENSE).

## Status

v0.7 — will be open-sourced on v1.
