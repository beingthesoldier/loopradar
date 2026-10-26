# Loop Radar

Generative visuals for beats and loops. A gallery of visuals (left: categories, right: the work), a live preview of each one, and a studio where you drop your own beat and export a vertical video.

## Run it on your computer

The site uses JavaScript modules and loads the demo beat with `fetch`, so it has to be served over http — double-clicking `index.html` won't work.

```bash
git clone https://github.com/beingthesoldier/loopradar.git
cd loopradar
python3 -m http.server 8000
```

Open http://localhost:8000. Stop the server with `Ctrl+C`. (macOS has `python3` built in; `npm start` does the same thing.)

## Structure

```
index.html                 gallery: header, categories, grid, preview + "Try it"
assets/css/base.css        shared tokens, type and the header (both pages)
assets/css/site.css        gallery layout
assets/css/studio.css      studio layout
assets/js/header.js        account button in the header
assets/js/catalog.js       categories and visuals (each visual = preset + starting look)
assets/js/site.js          gallery logic and routing (#/category/visual)
assets/posters/            one still per visual, used in the grid
studio/index.html          studio page (markup only)
studio/js/main.js          entry: wires the page, opens ?visual=<id>, runs the frame loop
studio/js/state.js         shared state and section timing
studio/js/util.js          small helpers
studio/js/audio/           analysis (FFT, bands, hits, pitch), hits in the section, playback, loading a beat
studio/js/render/          the frame (canvas.js) and drawing the current preset (engine.js)
studio/js/presets/         one file per preset + index.js (the list)
studio/js/ui/              settings panel built from each preset's controls, saved settings and looks
studio/js/export/          video export: frames.js (frame by frame), audio.js (sound + file check), recorder.js (real-time fallback), result.js, mp4edit.js
studio/js/vendor/          mp4-muxer 5.2.2 (MIT), writes the MP4 file
studio/demo.mp3            demo beat the studio and previews use
tools/make-posters.mjs     re-renders the posters from the studio
docs/presets.md            how to write a preset
```
New presets: see [docs/presets.md](docs/presets.md).

## Add a visual

1. In the studio, set a look and save it under **My looks**.
2. Add an entry to `VISUALS` in `assets/js/catalog.js` with an `id`, `title`, `category`, `preset` and the `look` settings.
3. Make its poster: `npm install && npm run posters -- <id>`.

Studio links: `studio/?visual=<id>` opens the studio for that visual with only its own settings (colours and palettes are settings, not separate visuals); `&embed=1` turns it into the silent looping preview the gallery shows. Each visual's last settings are remembered per browser.

## Video export

The studio exports frame by frame: each frame is drawn at its exact moment of the section and encoded with the browser's own H.264 encoder (WebCodecs), the sound is encoded straight from the decoded beat (AAC), and both are written into one MP4. Nothing runs in real time, so picture and sound line up to the sample, no frame is dropped, and a heavy visual just takes longer to export.

AAC encoders put a few dozen milliseconds of silence ("priming") in front of the sound. The studio measures it with the same encoder and writes an edit list into the MP4 so players skip it; without that the whole soundtrack would play late. After the file is written, the studio reads the sound back out of it the way the browser plays it, compares it with what went in, moves the edit list if it's still off, and says in the result whether the sound is there and in sync.

Safari 26's AAC encoder hands out a broken decoder description ([WebKit bug 302253](https://bugs.webkit.org/show_bug.cgi?id=302253)), and an MP4 built from it is silent. So `export/audio.js` writes the AAC description itself, strips ADTS headers if an encoder adds them, and fills in missing chunk durations.

Browsers that can't encode video (no `VideoEncoder`) fall back to real-time recording of the preview, which needs the tab in front and the audio-offset nudge. Where there's no AAC encoder (Linux Chromium, Firefox) the sound is Opus, which Instagram may refuse.
