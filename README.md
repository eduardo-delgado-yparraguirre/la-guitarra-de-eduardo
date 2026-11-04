# La Guitarra de Eduardo

Eduardo's guitar songbook: lyrics and rhythm chords, built to read and play from a phone.

- Instant search, filters (Español / English / Botellazos / Favoritas), random song
- Chords stay on their syllable at any screen width; tap a chord to see its fingering
- Transpose, auto-scroll, text size, dark and high-contrast "stage" themes
- Screen stays on while a song is open; works offline once visited (installable on the phone)

It is a plain static site (HTML, CSS, JS) — no server code — so it can be hosted anywhere, including Bluehost.

## Songs

Each song is a text file in `songs/` in [ChordPro](https://www.chordpro.org/) format:

```
{title: Rayando el Sol}
{artist: Mana}
{language: es}
{key: G}
{capo: 2}
{strum: D DU UDU}
{youtube: https://www.youtube.com/watch?v=...}

{comment: Verse}
Rayando [G]el [C]sol
```

`{key}`, `{capo}`, `{tempo}`, `{strum}`, `{youtube}` and `{tags: botellazos}` are optional and show up on the song page.

After adding or editing songs, rebuild the list:

```
npm run index
```

## Preview locally

```
npm run serve     # http://localhost:8080
```

## Publish to Bluehost

Upload these to the site's folder (cPanel File Manager or FTP): `index.html`, `manifest.webmanifest`, `sw.js`, `assets/`, `songs/`.
When the app files change, bump `VERSION` in `sw.js` so phones pick up the new version.

## Re-importing from the old Google Site

`npm run import` downloads every song from sites.google.com/view/eduardodelgado and rewrites `songs/*.cho`
(needs Chrome installed; it measures where each chord was drawn to place it on the right syllable).
Don't run it after hand-editing songs — it overwrites them.
