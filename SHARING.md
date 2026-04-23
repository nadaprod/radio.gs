# Sharing — building `radio.gs/#import:` links

This is a practical guide for anyone who wants to generate a shareable
RADIO.GS import link **without opening the app**. The link format is
self-contained: no server, no API key, no account. Anyone who opens the
URL gets the station installed into their browser's `localStorage`.

> Format rationale (why LZ-string, why a provider tag, how far we can
> push the URL) lives in `THINKING.md`. This doc is the how-to.

---

## 1. The link format

A share link looks like this:

```
https://radio.gs/#import:v1:<LZ_ENCODED_PAYLOAD>
```

Three parts separated by colons:

1. `#import:` — the app's import hook.
2. `v1` — the format version. Lets the app support future formats
   side-by-side without breaking existing links.
3. `<LZ_ENCODED_PAYLOAD>` — an **LZ-string** compression of a small
   plain-text payload, using `compressToEncodedURIComponent` so the
   output is already URL-safe (no base64 step needed).

### The payload, before compression

A line-delimited text block:

```
<station label>
<provider-tag> <path>
<provider-tag> <path>
...
```

- **Line 0** is the station name exactly as it should appear in the UI.
- **Every following line** is one track / set / mix, prefixed with a
  one-character provider tag and a single space.

Example — a two-URL SoundCloud station called *Midnight Synthwave*:

```
Midnight Synthwave
s artist/some-track
s user/sets/some-playlist
```

### Provider tags

| Tag | Provider    | Path example                        | Full URL the app reconstructs                |
|-----|-------------|-------------------------------------|----------------------------------------------|
| `s` | SoundCloud  | `user/sets/foo`                     | `https://soundcloud.com/user/sets/foo`       |

That is the only tag implemented today. `V2.md` sketches the plan for
`m` (Mixcloud), `y` (YouTube), `i` (Internet Archive), and others —
they slot into the same format with no version bump, because the tag
is already mandatory.

If a share link contains a tag the current build doesn't know, import
fails with a clear message rather than silently loading a bogus URL.

---

## 2. What URLs are accepted?

Anything the SoundCloud widget can load, as long as it starts with
`https://soundcloud.com/`:

- A single track: `https://soundcloud.com/<artist>/<track>`
- A playlist / set: `https://soundcloud.com/<artist>/sets/<name>`
- An artist profile page (the widget picks a track from it).

When the station plays, RADIO.GS picks one of the URLs at random, hands
it to the SoundCloud widget, and auto-advances to another random entry
when the current track finishes (`FINISH` → `scan()`). So a station
with 20 playlists effectively becomes an infinite shuffle across all of
them.

URLs that don't start with `https://soundcloud.com/` are rejected at
share time (`collapseUrl` throws) — you'll see an alert explaining
which URL failed.

---

## 3. Recipe A — one URL, one name

The minimal case: you have a single SoundCloud track or playlist and a
label you want to give the station. You need the `lz-string` library
(5 KB, MIT, on every CDN).

```html
<script src="https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js"></script>
<script>
  function buildImportLink(label, url, origin = 'https://radio.gs/') {
    const path = url.replace(/^https:\/\/soundcloud\.com\//, '');
    if (path === url) throw new Error(`Not a SoundCloud URL: ${url}`);
    const body    = `${label}\ns ${path}`;
    const encoded = LZString.compressToEncodedURIComponent(body);
    return `${origin}#import:v1:${encoded}`;
  }

  console.log(buildImportLink(
    'Midnight Synthwave',
    'https://soundcloud.com/artist/some-track'
  ));
  // → https://radio.gs/#import:v1:NoIg...
</script>
```

---

## 4. Recipe B — a list of playlists

Same shape, more lines. The station will shuffle across the whole
list.

```js
function buildImportLink(label, urls, origin = 'https://radio.gs/') {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('urls must be a non-empty array');
  }
  const lines = [label];
  for (const url of urls) {
    const path = url.replace(/^https:\/\/soundcloud\.com\//, '');
    if (path === url) throw new Error(`Not a SoundCloud URL: ${url}`);
    lines.push(`s ${path}`);
  }
  const encoded = LZString.compressToEncodedURIComponent(lines.join('\n'));
  return `${origin}#import:v1:${encoded}`;
}

const link = buildImportLink('Deep Focus', [
  'https://soundcloud.com/user/sets/ambient-works',
  'https://soundcloud.com/user/sets/piano-loops',
  'https://soundcloud.com/other/sets/late-night-jazz',
  'https://soundcloud.com/other/sets/rainy-day',
]);
console.log(link);
```

No deduplication, no ordering guarantees — the app picks randomly from
whatever list you ship.

---

## 5. Complete vanilla-JS sample (copy-paste page)

Drop this into an `.html` file and open it in any browser. The only
external dep is `lz-string` from a CDN.

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>RADIO.GS link builder</title>
  <script src="https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js"></script>
  <style>
    body   { font-family: monospace; max-width: 640px; margin: 2em auto; }
    input, textarea { width: 100%; font: inherit; padding: .5em; }
    textarea { height: 8em; }
    output { display: block; word-break: break-all; background: #111;
             color: #D4FF00; padding: 1em; margin-top: 1em; }
  </style>
</head>
<body>
  <h1>RADIO.GS link builder</h1>

  <label>Station name
    <input id="name" value="Midnight Synthwave">
  </label>

  <label>SoundCloud URLs (one per line)
    <textarea id="urls">https://soundcloud.com/artist/track-one
https://soundcloud.com/artist/sets/playlist-two</textarea>
  </label>

  <button id="go">Build link</button>

  <output id="out"></output>

  <script>
    const SC_PREFIX = 'https://soundcloud.com/';

    function buildImportLink(label, urls, origin = 'https://radio.gs/') {
      const lines = [label];
      for (const url of urls) {
        if (!url.startsWith(SC_PREFIX)) {
          throw new Error(`Not a SoundCloud URL: ${url}`);
        }
        lines.push(`s ${url.slice(SC_PREFIX.length)}`);
      }
      const encoded = LZString.compressToEncodedURIComponent(lines.join('\n'));
      return `${origin}#import:v1:${encoded}`;
    }

    document.getElementById('go').onclick = () => {
      const name = document.getElementById('name').value.trim();
      const urls = document.getElementById('urls').value
        .split('\n').map(s => s.trim()).filter(Boolean);

      if (!name)        return alert('Station name is required.');
      if (!urls.length) return alert('At least one URL is required.');

      try {
        const link = buildImportLink(name, urls);
        document.getElementById('out').textContent = link;
        navigator.clipboard?.writeText(link);
      } catch (e) {
        alert(e.message);
      }
    };
  </script>
</body>
</html>
```

That page mirrors exactly what the app itself does in
`generateShareLink()`.

---

## 6. Node.js one-liner

Useful for scripts, CI jobs, or pasting into a terminal:

```bash
npx -y -p lz-string@1.5.0 node -e '
  const LZ = require("lz-string");
  const label = "Midnight Synthwave";
  const urls  = ["https://soundcloud.com/artist/track"];
  const body  = [label, ...urls.map(u => "s " + u.replace("https://soundcloud.com/", ""))].join("\n");
  console.log("https://radio.gs/#import:v1:" + LZ.compressToEncodedURIComponent(body));
'
```

---

## 7. What happens when the link is opened

For reference, here's what RADIO.GS does when someone visits your link
(see `checkImport()` and `decodeSharePayload()` in
`public/index.html`):

1. Reads the hash. Requires the `#import:v1:` prefix — anything else
   is ignored or rejected with a version-mismatch error.
2. `LZString.decompressFromEncodedURIComponent` the body → plain text.
3. Split on newlines: line 0 = label, following lines = provider-tagged
   paths. Each line is expanded back into a full URL via the
   `PROVIDERS` registry.
4. Runs the label through `slugify()` to produce a station slug
   (`"Midnight Synthwave"` → `midnight-synthwave`).
5. If the slug already exists locally:
   - Identical `urls` → just switches to the station, no prompt.
   - Different `urls` → asks the user **overwrite** vs **keep both**
     (the copy gets suffixed, e.g. `midnight-synthwave-2`).
6. Writes the station into `localStorage` under the key `radio_gs_data`
   and replaces the hash with the plain slug (so the URL is clean after
   import).

Idempotent: opening the same link twice is a no-op on the second
visit.

---

## 8. Gotchas

- **No URL validation beyond the provider prefix.** The app will
  happily try to load any path you put after `s `. If a URL isn't
  loadable by the SoundCloud widget, that entry will silently fail to
  play and the station will advance.
- **LZ-string is not encryption.** The label and URLs are recoverable
  from the link by anyone. Don't put anything sensitive in there.
- **Link length.** With LZ-string compression, a 20-URL station lands
  around 450–600 chars — comfortably QR-scannable. Hundreds of URLs
  still work, but may blow past QR-code limits (≈1 800 chars) and some
  chat apps' link previews (≈2 KB).
- **Label collisions.** Two stations with labels that slugify to the
  same string (e.g. `"Café"` and `"cafe"`) will trigger the
  overwrite-or-copy prompt on import. Pick distinctive names.
- **Unknown provider tags.** If you hand-craft a link with a tag the
  current build doesn't know (e.g. `m user/mix` while only `s` is
  implemented), `checkImport()` throws with a readable message. Not
  data loss — the station just doesn't import.
