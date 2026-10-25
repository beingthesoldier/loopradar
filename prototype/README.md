# Prototype

Working single-file version of the generator (presets RADAR, VEIL, BLOOM), as it was built before the split into modules.

- `index.html` — the whole app: audio analysis, presets, HUD, MP4 export.
- `demo.mp3` — test beat (134 BPM, G minor) the page loads on start.

Run locally: `python3 -m http.server` in this folder, then open http://localhost:8000 (the demo beat is loaded with `fetch`, so opening the file directly won't load it).
