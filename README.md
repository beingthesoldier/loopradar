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
studio/js/export/          video recording
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
