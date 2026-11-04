# La Guitarra de Eduardo

Eduardo's guitar songbook: lyrics and rhythm chords, built to read and play from a phone.

- Song table (title, artist, language, genre) sortable by any column; search, language and genre filters, favorites, random song
- Chords stay on their syllable at any screen width; tap a chord to see its fingering
- Transpose, auto-scroll, text size, dark and high-contrast "stage" themes
- Screen stays on while a song is open; works offline once visited (installable on the phone)

It is a plain static site (HTML, CSS, JS) — no server code — so it can be hosted anywhere, including Bluehost.

## Songs

Each song is a text file in `songs/` in [ChordPro](https://www.chordpro.org/) format:

```
{title: Rayando el Sol}
{artist: Maná}
{genre: Rock en español}
{language: es}
{key: G}
{capo: 2}
{strum: D DU UDU}
{youtube: https://www.youtube.com/watch?v=...}

{comment: Verse}
Rayando [G]el [C]sol
```

`{key}`, `{capo}`, `{tempo}`, `{strum}` and `{youtube}` are optional and show up on the song page.

After editing songs, rebuild the list:

```
npm run index
```

### Adding a new song

Copy the song from any chord website (chords on the line above the lyrics) into a text file, then:

```
node tools/add-song.mjs cancion.txt --title "Persiana Americana" --artist "Soda Stereo" --lang es --genre "Rock en español"
```

It writes `songs/<artist>-<title>.cho` and updates the list.

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
