# How to Ship a Real Web App in One HTML File

## Old-timer tricks for zero-backend apps that a web newbie can learn in an afternoon

> *Alternative titles if you're picking for Medium: "The Lost Art of
> the Single-File Web App" / "Ten Web Tricks Framework Tutorials Don't
> Teach You" / "Your First Real App Doesn't Need a Backend."*

---

You want to build a web app. You open a terminal, run
`npm create vite@latest`, pick a framework, set up a database, deploy
to Vercel, add authentication, configure a CDN, write a GitHub
Action, set up environment variables…

Sometimes you need all that. But sometimes you don't — and it's a lost
art to tell the difference.

I just built [**RADIO.GS**](https://radio.gs), a synthwave-flavored
internet radio that lets anyone assemble a station of SoundCloud sets,
share it as a link or a QR code, and install it as an offline-capable
app. The whole thing is **one HTML file**. No backend. No build step.
No framework. No account. Around 1 500 lines of code — you can read
the whole thing in an hour.

This post is a tour of the old-school web tricks that make that
possible. If you're new to web development, these patterns won't show
up in your React tutorial, but they'll save you years of complexity
once they're in your back pocket.

---

## Trick 1: The URL fragment is free data storage

Every URL has a part most people forget exists. You know these:

```
https://example.com/path?query=value
```

But URLs have a fourth piece:

```
https://example.com/path?query=value#fragment
```

The `#fragment` has a superpower: **it never gets sent to the server.**

Type a URL with `#foo` in your address bar. The server receives a
request for `/`, not for `/#foo`. The fragment lives entirely in the
browser — JavaScript can read it, react to it, and modify it, but the
server never sees it.

That makes it a free side-channel for client-side state:

```js
// "Route" to a new screen without a page reload and without a server:
window.location.hash = 'midnight-synthwave';

// React to the user changing it:
window.addEventListener('hashchange', () => {
  const slug = window.location.hash.slice(1);
  loadStation(slug);
});
```

RADIO.GS uses the fragment for three things:

- `#midnight-synthwave` — switch to a station.
- `#import:v1:...` — install a shared station (see Trick 2).
- `#` (empty) — go back to the landing screen.

Zero server. Zero router library.

---

## Trick 2: Stash an entire "share link" inside the URL

Here's the share-a-station problem. Alice makes a custom radio station
of her favorite sets. She wants to send it to Bob. The naive plan:

> "I'll stand up a server. And a database. And an auth flow. And a
> sharing endpoint. And a route to claim a shared station…"

Six months later you've built half of Spotify.

The not-naive plan: **put the entire station inside the URL.**

```
https://radio.gs/#import:v1:NoIgXgpgbmwCgYgAQHYDMBOADATjJMsGAtgJYB2Ahg...
```

That blob at the end *is* the station. Label, track URLs, everything.
When Bob opens the link, the app reads the hash, decodes the blob, and
saves the station into Bob's browser.

No account. No database. No server code. The "share link" is a
self-contained file disguised as a URL.

### But isn't a URL too short for that?

URL length limits are a thing you learn about from outdated blog posts
and forget about. Modern reality:

- **Browsers** happily handle tens of thousands of characters.
- URLs in the **fragment** don't reach any server, so nginx/CDN limits
  don't apply.
- **QR codes** become hard to scan past ~1 800 characters.
- **Chat apps** (Slack, WhatsApp, iMessage) sometimes truncate around
  2–4 KB.

So the realistic budget for a shareable link is ~1 500 characters. How
much can we cram into that?

---

## Trick 3: Old-school compression for URL payloads

Plain JSON wastes space. Look at this:

```json
{"l":"Midnight Synthwave","u":[
  "https://soundcloud.com/user1/sets/ambient-works",
  "https://soundcloud.com/user2/sets/late-night"
]}
```

Count the waste. In a 20-URL station:

- `https://soundcloud.com/` appears 20 times — a **460-character tax**.
- JSON structural chars (`{}`, `[]`, `""`, `:`) — ~85 more.
- Then base64 encoding adds **33% overhead** on top.

Old-timer moves, in order of return on investment:

### A. Don't encode what you can reconstruct

If every URL starts with `https://soundcloud.com/`, don't store the
prefix. Store a one-character **tag** and let the decoder prepend the
right domain:

```
s user1/sets/ambient-works
s user2/sets/late-night
```

The `s` means "SoundCloud." If you later support Mixcloud, it becomes
`m`. YouTube: `y`. Bandcamp: `b`. The tag costs one byte; the prefix
it replaces costs 23. Always win.

### B. Ditch JSON for a flat text format

JSON is great for APIs. But for a tight format you control end-to-end,
newline-delimited text is denser *and* easier to debug:

```
Midnight Synthwave
s user1/sets/ambient-works
s user2/sets/late-night
```

First line is the label. Every line after is a provider-tagged path.
Parsing it is `split('\n')`.

### C. Compress with LZ-string

[lz-string](https://github.com/pieroxy/lz-string) is a tiny (~5 KB)
JavaScript library designed specifically to squeeze strings into URLs
and `localStorage`. It has a purpose-built method that outputs
URL-safe characters directly:

```js
const body = [label, ...urls.map(shortenUrl)].join('\n');
const encoded = LZString.compressToEncodedURIComponent(body);
// → URL-safe string, typically 50–70% smaller than the input
```

On a typical 20-URL RADIO.GS station, this squeezes a 1 400-character
JSON down to about 500 characters. QR-friendly.

### D. Add a version marker you don't need yet

```
#import:v1:<payload>
```

That `v1:` costs three bytes. In exchange, the day you want to evolve
the format — new compression, new structure, new provider — you can.
Old `v1` links still decode. New `v2` links work. The decoder just
dispatches on the version tag:

```js
function decode(body) {
  const [version, rest] = body.split(':', 2);
  if (version === 'v1') return decodeV1(rest);
  if (version === 'v2') return decodeV2(rest);
  throw new Error(`Unknown format version: ${version}`);
}
```

This pattern — **schema evolution** — is how you future-proof any
format you publish. Three bytes now, zero migrations later.

---

## Trick 4: localStorage is a zero-setup database

Every browser ships with a built-in key-value store:

```js
localStorage.setItem('my_key', 'my value');
const x = localStorage.getItem('my_key'); // 'my value'
```

- Persists forever (until the user clears their browser data).
- ~5–10 MB per origin — huge for structured text.
- Synchronous, microsecond-fast.
- Zero setup, zero dependencies, no migrations.

RADIO.GS stores the user's entire station collection as a single JSON
string under one key:

```js
const DEFAULT_STATIONS = { /* built-in stations */ };

this.stations = JSON.parse(localStorage.getItem('radio_gs_data'))
             || DEFAULT_STATIONS;

// …after any change:
localStorage.setItem('radio_gs_data', JSON.stringify(this.stations));
```

That's the whole database. Read on startup, mutate in memory, write
back. Indexes? Not needed — it's a small object. Schema migrations?
Just read the old shape, translate, write the new shape.

**When NOT to use localStorage**: anything that needs to sync across
devices, anything sensitive (it's plaintext and readable by any script
on your origin), anything huge. For everything else — preferences,
drafts, scores, customization, small document data — it's exactly the
right tool.

---

## Trick 5: Let someone else build your audio engine

Writing a cross-browser audio player with waveforms, metadata,
streaming, and copyright-cleared access to millions of songs is… a
lot.

SoundCloud already did it. And they ship an **embeddable widget**
plus a JavaScript API that lets your code drive that widget from the
outside:

```html
<iframe id="sc-widget"
  src="https://w.soundcloud.com/player/?url=SOME_TRACK"
  allow="autoplay"></iframe>
```

```js
const widget = SC.Widget(document.getElementById('sc-widget'));

widget.bind(SC.Widget.Events.READY, () => {
  widget.bind(SC.Widget.Events.FINISH,        () => playNextRandom());
  widget.bind(SC.Widget.Events.PLAY_PROGRESS, e  => updateProgress(e));
  widget.play();
});

widget.load('https://soundcloud.com/other-track');
```

Under the hood this uses **`postMessage`**, the browser's API for
cross-frame communication. Your code speaks to the SoundCloud iframe
like it would speak to a web service.

**The pattern**: whenever you think "I need to build a [complex
thing]," first check whether a public service has an embeddable
widget that does 90% of it. YouTube, Vimeo, Mixcloud, Twitch,
Google Maps, Figma — they all expose widget APIs that let you drive
them from JavaScript. Your app becomes a thin controller instead of a
heavy reimplementation.

---

## Trick 6: Extract a dominant color from an image with a 1×1 canvas

When a track starts playing, RADIO.GS pulls the dominant color from
the album art and uses it as the UI accent. Here's the whole trick:

```js
function extractColor(imageUrl) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;                     // 1×1 canvas
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 1, 1);             // browser does the averaging
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    document.documentElement.style
      .setProperty('--accent', `rgb(${r},${g},${b})`);
  };
  img.src = imageUrl;
}
```

**The trick**: draw the entire image into a **one-pixel canvas**. The
browser averages every pixel down to that single output pixel for
free. Read it back with `getImageData`. That's your dominant color.

### The gotcha: CORS

Try this with an image on another domain and `getImageData` will
throw. The browser refuses to let JavaScript read pixels from
cross-origin images unless the image server sent the right headers
(`Access-Control-Allow-Origin: *`).

Real code needs a graceful fallback:

```js
try {
  // …extract color…
} catch (e) {
  // The image server blocked pixel reads. Fall back to a default.
  document.documentElement.style.setProperty('--accent', '#D4FF00');
}
```

For RADIO.GS, this failure is the expected path about half the time —
SoundCloud's CDN doesn't always send the headers. The `catch` block
isn't an error handler; it's half the feature.

---

## Trick 7: Outsource what you can't easily do in the browser

Generating a QR code from a string is possible in pure JavaScript (a
bunch of libraries do it), but that's ~20 KB of code to "turn a string
into an image."

Instead:

```js
const qrUrl = `https://api.qrserver.com/v1/create-qr-code/`
  + `?size=200x200&data=${encodeURIComponent(shareUrl)}`;
document.getElementById('qrcode-img').src = qrUrl;
```

A free public API renders the QR code server-side and returns it as an
image. My app ships zero QR-code logic.

**The principle**: not everything has to run on your machine. If a
free service does something well, embedding its output costs you
almost nothing, and the "dependency" is a URL instead of an npm
package. The day `qrserver.com` goes down, I swap the URL — no
rebuild.

Works for QR codes, Open Graph image generation, avatars, maps,
screenshots, geolocation, and a hundred other things.

---

## Trick 8: Make it installable and offline-capable in 30 lines

A Progressive Web App (PWA) is a fancy name for "a website that can be
installed and runs offline." It sounds complicated. It's not.

You need three things:

1. A **manifest** (`manifest.webmanifest`) describing the app.
2. A **service worker** (`sw.js`) that caches files.
3. A small snippet in your HTML to register the service worker.

The service worker is the interesting one:

```js
// sw.js
const CACHE = 'radio-gs-v1';
const SHELL = ['/', '/index.html', '/favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
```

Thirty lines of JavaScript and your app launches from a home-screen
icon, even in airplane mode. The user sees a splash screen. The
browser treats it as a first-class app.

No App Store review. No 30% cut. Just a `.webmanifest` and a `fetch`
handler.

---

## Trick 9: Keep every screen in the DOM; transition with CSS

Modern frameworks love to unmount and remount components on
navigation. For a small app, that's overkill. A simpler pattern:

**Leave all your screens in the DOM at once. Transition between them
with CSS.**

```html
<div id="landing"> … landing screen … </div>
<div id="player-ui"> … player screen … </div>
```

```css
#landing     { transform: translateY(0);       transition: transform .6s; }
#landing.hidden { transform: translateY(-100%); }

#player-ui           { opacity: 0; pointer-events: none; transition: opacity .4s; }
#player-ui.visible   { opacity: 1; pointer-events: auto; }
```

To "navigate":

```js
document.getElementById('landing').classList.add('hidden');
document.getElementById('player-ui').classList.add('visible');
```

Why this is great for small apps:

- **Instant** transitions — no mount/unmount cost.
- Animations are free because the DOM never changes, only its
  transforms and opacities.
- No route table, no router library, no lazy loading boilerplate.
- State is preserved across "navigations" automatically — the other
  screen is still there, just translated offscreen.

**When it stops scaling**: dozens of screens, deep nesting, or content
heavy enough that keeping it all mounted hurts performance. For two
or three screens? Dramatically simpler than any SPA router.

---

## Trick 10: One file. No build.

Here is the file tree of the RADIO.GS source:

```
public/
  index.html            ← the entire app
  sw.js                 ← service worker
  manifest.webmanifest
  favicon.png
  + a handful of icons
```

That's it. `public/index.html` contains:

- All HTML markup.
- All CSS, in a `<style>` block.
- All JavaScript, in a `<script>` block.
- The default station data, as a JSON literal in the code.

No `package.json`. No `node_modules`. No `vite.config.js`. No CI
pipeline. `git clone` and `python3 -m http.server --directory public
8000` and it runs.

**When this is the right choice**: small projects where the
complexity budget should go into the product, not the tooling.
Landing pages. Tools. Toys. Art pieces. Anything that "fits in your
head."

**When it isn't**: multi-page apps, team projects with lots of
concurrent contributors, anything with heavy TypeScript or a complex
asset pipeline.

The old-timer heuristic: **default to no build; upgrade only when you
feel actual pain.** Most of the web apps I've shipped never needed the
pain.

---

## Putting it together

| Need                   | Trick                                | Dependencies      |
|------------------------|--------------------------------------|-------------------|
| Route between screens  | URL fragment + CSS transforms        | none              |
| Persist user data      | `localStorage` + `JSON.stringify`    | none              |
| Share stations         | Fragment + LZ-string payload         | lz-string (5 KB)  |
| Play audio             | SoundCloud widget + `postMessage`    | none on your side |
| Accent color from art  | 1×1 canvas pixel read                | none              |
| Generate QR codes      | Public rendering API                 | none              |
| Offline / installable  | Service worker + manifest            | none              |
| Ship the whole thing   | One HTML file in `public/`           | none              |

Total third-party code pulled in at runtime: a ~5 KB compression
library, a ~150 KB 3D library for the visual polish, and SoundCloud's
own widget API.

Total backend: **none**.

---

## Why bother?

Because it's fast. Because it's fun. Because you can ship it in a
weekend, read the whole codebase in an hour, and debug any issue by
opening DevTools.

Because **not every idea deserves a Kubernetes cluster.**

Every one of these patterns was available in 2010. They're older than
React, older than `npm init`, older than most of the tools on a
"modern" web stack. And most of them will still work identically in
2040, because they're built on the platform itself — URLs, iframes,
`localStorage`, `fetch`, `postMessage`. The platform outlives every
framework.

Learning the platform is the highest-leverage thing a web newbie can
do. Pick one trick above, build a toy with it, and you'll have
something to show off — and quietly, you'll have joined the tradition
of the people who built the web.

---

*Source code: RADIO.GS on GitHub (MIT). Try the app at
[radio.gs](https://radio.gs).*
