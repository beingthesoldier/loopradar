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
index.html              gallery: categories, grid, preview + "Try it"
assets/css/site.css     gallery styles
assets/js/catalog.js    categories and visuals (each visual = preset + look)
assets/js/site.js       gallery logic and routing (#/category/visual)
assets/posters/         one still per visual, used in the grid
studio/index.html       the generator (analysis, presets RADAR / VEIL / BLOOM, export)
studio/demo.mp3         demo beat the studio and previews use
tools/make-posters.mjs  re-renders the posters from the studio
```

The studio still lives in one file; splitting it into modules (analysis, each preset, export, UI) is the next step.

## Add a visual

1. In the studio, set a look and save it under **My looks**.
2. Add an entry to `VISUALS` in `assets/js/catalog.js` with an `id`, `title`, `category`, `preset` and the `look` settings.
3. Make its poster: `npm install && npm run posters -- <id>`.

Studio links: `studio/?visual=<id>` opens the studio with that look; `&embed=1` turns it into the silent looping preview the gallery shows.
