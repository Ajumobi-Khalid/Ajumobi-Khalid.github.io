# khalid.ajumobi — portfolio

Personal portfolio site. Plain HTML/CSS/JS served by GitHub Pages. The only build step is the CHIP-8 interpreter (see below).
Black ground, Georgia Tech gold, set in Space Grotesk and Space Mono.

## Structure

```
index.html            home: the Lagos to Georgia Tech journey, then work, about, skills, contact
experience.html       work and education
projects.html         the index of projects
work/*.html           one page per project; work/chip8.html runs the interpreter in the browser
about.html            about me
404.html              GitHub Pages not-found page (uses absolute paths)
assets/
  css/site.css        shared styles; colors and fonts are variables at the top
  css/home.css        the journey and the home page sections
  js/journey.js       the dot globe, the city maps and the stage-by-stage scrolling
  wasm/chip8.js       chip8.c compiled to WebAssembly, embedded in one file (built by wasm/build.sh)
  js/chip8-wasm.js    starts the compiled interpreter on a canvas and passes ROMs and keys in
  js/chip8-player.js  the player on work/chip8.html (screen, keypad, registers, sound, file loading)
  js/chip8-roms.js    six public-domain (CC0) games from the Chip8 Community Archive
  js/chip8-demo.js    the home page card: the compiled interpreter running a demo ROM
  js/site.js          the copy-email button
  data/geo.js         the globe's land, precomputed from Natural Earth
  fonts/              Space Grotesk and Space Mono (SIL Open Font License)
  img/journey/        the Lagos, Atlanta and campus maps (OpenStreetMap data, ODbL);
                      name-preview.webp (small, shown first), name.webp for high-density screens,
                      name@1x.webp at half size for the rest
  img/                headshot, Classify screenshots, favicon
  Khalid_Ajumobi.pdf
wasm/chip8.c          the interpreter's C source, with a web build behind #ifdef __EMSCRIPTEN__
wasm/build.sh         compiles it with Emscripten into assets/wasm/
```

## Editing

- **Update the resume:** replace `assets/Khalid_Ajumobi.pdf` (keep the filename).
- **Change the journey captions:** the four `.caption` blocks in `index.html`.
- **Add a project:** copy one `<li>` in the list in `projects.html`, a page in `work/`, and one `<li>` in the Work list in `index.html`.
- **Change colors:** the variables at the top of `assets/css/site.css`.

The map credit in the home page footer ("© OpenStreetMap contributors") is required by the map data licence; keep it.

Preview locally with any static server, e.g. `python -m http.server` and open http://localhost:8000.

## Rebuilding the CHIP-8 interpreter

Only needed when `wasm/chip8.c` changes. Install the Emscripten SDK once
(https://emscripten.org/docs/getting_started/downloads.html), activate it, then run `sh wasm/build.sh`.
It writes `assets/wasm/chip8.js`; commit it.

## Deploy

1. Create a public GitHub repo named **`Ajumobi-Khalid.github.io`**.
2. Push this folder to its `main` branch.
3. In the repo: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.
4. The site goes live at https://ajumobi-khalid.github.io within a minute or two.
