// the opening of the home page: a gold dot earth that turns to Lagos, then crosses the Atlantic to Georgia Tech
(() => {
  "use strict";
  const GOLD = "#b3a369", TEXT = "#f2f0ea", GROUND = "#0b0b0b", rad = Math.PI / 180;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scene = document.getElementById("scene"), canvas = document.getElementById("earth"), ctx = canvas.getContext("2d", { alpha: false });
  const title = document.getElementById("title"), cue = document.getElementById("cue"), bar = document.getElementById("bar");
  const lifts = [title, cue, ...["masthead", "scrim", "scrim-top"].map(id => document.getElementById(id))];
  const caps = [0, 1, 2, 3].map(i => document.getElementById("c" + i));
  // the land, precomputed from Natural Earth into assets/data/geo.js; unpacking it takes a few milliseconds,
  // where rasterizing the world at startup took most of a second
  const unb64 = str => { const bin = atob(str), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const unrle = (str, size) => { const runs = new Uint16Array(unb64(str).buffer), m = new Uint8Array(size); let at = 0, on = 0; for (let i = 0; i < runs.length; i++) { if (on) m.fill(1, at, at + runs[i]); at += runs[i]; on ^= 1; } return m; };
  const MW = GEO.world.w, MH = GEO.world.h, mask = unrle(GEO.world.rle, MW * MH);
  const isLand = (lon, lat) => { let x = Math.floor(((lon + 180) / 360) * MW) % MW; if (x < 0) x += MW; return mask[Math.min(MH - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MH))) * MW + x]; };
  const dq = new Int16Array(unb64(GEO.dots).buffer), dots = new Float32Array(dq.length);
  for (let i = 0; i < dq.length; i++) dots[i] = dq[i] / 100 * rad;
  // each dot's trig is worked out once here, so a frame is only multiply-adds
  const N = dots.length / 2, SPHI = new Float32Array(N), CSL = new Float32Array(N), CCL = new Float32Array(N);
  for (let k = 0; k < N; k++) { const lam = dots[2 * k], phi = dots[2 * k + 1]; SPHI[k] = Math.sin(phi); CSL[k] = Math.cos(phi) * Math.sin(lam); CCL[k] = Math.cos(phi) * Math.cos(lam); }
  // one reusable buffer per brightness step: nothing is allocated while the globe turns, so there are no garbage-collection pauses
  const BUF = Array.from({ length: 8 }, () => new Float32Array(N * 3)), CNT = new Int32Array(8);

  // sharper land around the two places, so the zoom between globe and city keeps a clean shoreline
  const regions = GEO.regions.map(r => ({ w: r.w, s: r.s, e: r.e, n: r.n, cw: r.cw, chh: r.chh, m: unrle(r.rle, r.cw * r.chh) }));
  // coastline runs near the two places only, as plain lon/lat pairs so each frame projects them directly
  const COAST = [];
  {
    const lens = new Uint32Array(unb64(GEO.coast.lens).buffer), pts = new Int32Array(unb64(GEO.coast.pts).buffer);
    let o = 0;
    for (const len of lens) { const run = new Float64Array(len * 2); for (let k = 0; k < len * 2; k++) run[k] = pts[o + k] / 1e4 * rad; COAST.push(run); o += len * 2; }
  }
  const landAt = (lon, lat) => {
    for (const r of regions) if (lon >= r.w && lon < r.e && lat >= r.s && lat < r.n)
      return r.m[Math.floor((r.n - lat) / (r.n - r.s) * r.chh) * r.cw + Math.floor((lon - r.w) / (r.e - r.w) * r.cw)];
    return isLand(lon, lat);
  };

  // standard screens get half-size maps: a quarter of the memory and of the GPU upload, and half the download
  const hiDPI = (window.devicePixelRatio || 1) > 1.4;
  // the three city maps, each pinned to its real place on the globe [south, west, north, east]
  const maps = [
    { name: "lagos", full: 6400, bbox: [6.40, 3.30, 6.56, 3.56], fadeIn: [0.3, 0.95], maxMag: 99 },
    { name: "atlanta", full: 4800, bbox: [33.60, -84.62, 33.95, -84.18], fadeIn: [0.3, 0.95], maxMag: 2.4 },
    { name: "campus", full: 4800, bbox: [33.7685, -84.4075, 33.7840, -84.3860], fadeIn: [0.1, 0.45], maxMag: 99 },
  ].map(m => Object.assign(m, { img: null, next: null, ready: false }));
  // a small preview of every map (about 100 KB each) arrives first, so each city is on screen within moments;
  // the sharp maps follow one at a time, in the order you reach them, and replace the previews when ready
  const fetchImg = (url, priority) => {
    const im = Object.assign(new Image(), { decoding: "async", fetchPriority: priority, src: url });
    return im.decode().then(() => im, () => (im.complete && im.naturalWidth ? im : null));
  };
  Promise.all(maps.map(m => fetchImg(`assets/img/journey/${m.name}-preview.webp`, "high").then(im => { if (im && !m.next) m.next = im; })))
    .then(async () => { for (const m of maps) { const im = await fetchImg(`assets/img/journey/${m.name}${hiDPI ? "" : "@1x"}.webp`, "low"); if (im) m.next = im; } });
  // draw each new image once off screen so the first real frame does not stall on the upload
  const warm = Object.assign(document.createElement("canvas"), { width: 8, height: 8 }).getContext("2d");
  const whenIdle = window.requestIdleCallback || (f => setTimeout(f, 200));
  // each sharp map is uploaded while the camera rests at the stage before it, when a brief pause cannot be seen
  maps[0].warmAt = 0; maps[1].warmAt = 0.3; maps[2].warmAt = 0.5;
  const warmNext = p => {
    if (target !== null || gest) return; // never during a glide or a swipe
    const m = maps.find(m => m.next && !m.warming && (p >= m.warmAt || !m.ready));
    if (m) { m.warming = true; whenIdle(() => { const im = m.next; m.next = null; m.warming = false; if (!im) return; warm.drawImage(im, 0, 0, 8, 8); m.img = im; m.ready = true; lastKey = ""; }); }
  };

  // the camera's path down the page: where it looks, and how far in (zoom 1 shows the whole earth)
  const LAGOS = { lon: 3.405, lat: 6.462 }, TOWER = { lon: -84.3947, lat: 33.7728 };
  const KEYS = [
    { p: 0.06, lon: null, lat: 14, zoom: 1 },
    { p: 0.30, ...LAGOS, zoom: 1100 },
    { p: 0.42, ...LAGOS, zoom: 1500 },
    { p: 0.53, lon: -38, lat: 22, zoom: 1.5 },
    { p: 0.70, lon: -84.39, lat: 33.765, zoom: 650 },
    { p: 0.86, ...TOWER, zoom: 17000 },
    { p: 1.00, ...TOWER, zoom: 19000 },
  ];
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let spin = -20;

  function camera(p) {
    if (p <= KEYS[0].p) return { lon: spin, lat: 14, zoom: 1 };
    KEYS[0].lon = KEYS[0].lon ?? spin; // the globe leaves its spin where the scroll found it
    for (let i = 1; i < KEYS.length; i++) {
      const a = KEYS[i - 1], b = KEYS[i];
      if (p > b.p && i < KEYS.length - 1) continue;
      const u = clamp((p - a.p) / (b.p - a.p), 0, 1), t = ease(u);
      // diving in, the camera reaches the place before the zoom does; pulling out, the zoom leads and the camera follows
      const tp = b.zoom >= a.zoom ? ease(Math.min(1, u * 1.7)) : ease(Math.max(0, (u - 0.4) / 0.6));
      const dl = ((b.lon - a.lon + 540) % 360) - 180;
      return { lon: a.lon + dl * tp, lat: lerp(a.lat, b.lat, tp), zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), t)) };
    }
  }

  let W = 0, H = 0, DPR = 1, grid = null;
  function makeGrid(cols, rows, g) {
    const mask = Object.assign(document.createElement("canvas"), { width: cols, height: rows }), mx = mask.getContext("2d");
    const img = mx.createImageData(cols, rows);
    const layer = Object.assign(document.createElement("canvas"), { width: cols * g, height: rows * g }), lx = layer.getContext("2d");
    const tile = Object.assign(document.createElement("canvas"), { width: g, height: g }), tx = tile.getContext("2d");
    tx.fillStyle = GOLD; tx.fillRect(g / 2 - 1, g / 2 - 1, 2, 2);
    return { cols, rows, g, mask, mx, img, data32: new Uint32Array(img.data.buffer), layer, lx, pattern: lx.createPattern(tile, "repeat") };
  }
  let sceneTop = 0, sceneH = 1, lastKey = "";
  function resize() { DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR); sceneTop = scene.offsetTop; sceneH = scene.offsetHeight; lastKey = ""; }
  addEventListener("resize", resize); resize();
  const L = (() => { const v = [-0.55, 0.5, 0.67], n = Math.hypot(...v); return v.map(c => c / n); })();

  let visible = true, last = performance.now(), lastFade = -1;
  new IntersectionObserver(e => { visible = e[0].isIntersecting; }).observe(scene);

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (visible) {
      const top = sceneTop - scrollY, bottom = top + sceneH;
      const p = reduce ? 0 : clamp(-top / (sceneH - H), 0, 1);
      const spinning = p < 0.02 && !reduce;
      if (spinning) { spin += dt * 6; KEYS[0].lon = null; }
      warmNext(p);
      // nothing moved since the last frame: keep the picture that is already there
      const key = spinning ? "" : p.toFixed(5) + "," + W + "," + H;
      if (key && key === lastKey) { requestAnimationFrame(frame); return; }
      lastKey = key;
      const cam = camera(p), wide = W > 860;
      const base = wide ? Math.min(W * 0.36, H * 0.44) : Math.min(W * 0.46, H * 0.3);
      const inT = smooth(1, 4, cam.zoom);
      // the opening globe sits whole in the window, to the right of the name; on a phone the cities zoom closer to fill the tall screen
      const R = base * cam.zoom * lerp(wide ? 0.92 : 1.3, wide ? 1 : 1.8, inT);
      const cx = lerp(wide ? W * 0.7 : W * 0.5, wide ? W * 0.6 : W * 0.5, inT), cy = lerp(wide ? H * 0.54 : H * 0.9, H * 0.46, inT);
      const l0 = cam.lon * rad, p0 = cam.lat * rad, sp = Math.sin(p0), cp = Math.cos(p0);

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = GROUND; ctx.fillRect(0, 0, W, H);

      // the dot globe, fading as the dots grow too large to read as dots
      const dotA = 1 - smooth(2.2, 5, cam.zoom);
      if (dotA > 0) {
        const size = Math.max(1.2, Math.min(3.2, base * 0.0062)) * Math.min(cam.zoom, 1.8);
        ctx.fillStyle = GOLD;
        ctx.globalAlpha = 0.16 * dotA; ctx.lineWidth = 1; ctx.strokeStyle = GOLD; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
        // cos(lam - l0) and sin(lam - l0) by the angle-difference rule, from the per-dot terms
        const sl0 = Math.sin(l0), cl0 = Math.cos(l0), lx = L[0], ly = L[1], lz = L[2];
        CNT.fill(0);
        for (let k = 0; k < N; k++) {
          const ccl = CCL[k] * cl0 + CSL[k] * sl0, sphi = SPHI[k];
          const z = sp * sphi + cp * ccl; if (z <= 0) continue;
          const x = CSL[k] * cl0 - CCL[k] * sl0, y = cp * sphi - sp * ccl;
          const X = cx + x * R, Y = cy - y * R; if (X < -10 || Y < -10 || X > W + 10 || Y > H + 10) continue;
          let b = ((x * lx + y * ly + z * lz) * 8) | 0; b = b < 0 ? 0 : b > 7 ? 7 : b;
          const buf = BUF[b], i = CNT[b]; buf[i] = X; buf[i + 1] = Y; buf[i + 2] = size * (0.55 + 0.45 * z); CNT[b] = i + 3;
        }
        // one path and one fill per brightness step, instead of a separate draw call for every dot
        for (let b = 0; b < 8; b++) {
          const d = BUF[b], n = CNT[b]; if (!n) continue;
          ctx.globalAlpha = (0.25 + 0.75 * (b + 0.5) / 8) * dotA; ctx.beginPath();
          for (let k = 0; k < n; k += 3) { const q = d[k + 2]; ctx.rect(d[k] - q / 2, d[k + 1] - q / 2, q, q); }
          ctx.fill();
        }
      }

      // between the globe and the city, land is a fine dot grid fixed to the screen, like the city maps
      const gridA = smooth(2.2, 5, cam.zoom);
      if (gridA > 0) {
        // one test per grid cell into a tiny mask, enlarged without smoothing, then a dot pattern stamped through it
        const g = wide ? 9 : 8, cols = Math.ceil(W / g), rows = Math.ceil(H / g);
        if (!grid || grid.cols !== cols || grid.rows !== rows || grid.g !== g) grid = makeGrid(cols, rows, g);
        const px32 = grid.data32;
        for (let j = 0; j < rows; j++) {
          const ny = (cy - (j + 0.5) * g) / R;
          for (let i = 0; i < cols; i++) {
            const nx = ((i + 0.5) * g - cx) / R, r2 = nx * nx + ny * ny;
            let on = 0;
            if (r2 <= 1) {
              const nz = Math.sqrt(1 - r2);
              const lat = Math.asin(clamp(nz * sp + ny * cp, -1, 1)) / rad, lon = (l0 + Math.atan2(nx, nz * cp - ny * sp)) / rad;
              on = landAt(((lon + 540) % 360) - 180, lat);
            }
            px32[j * cols + i] = on ? 0xffffffff : 0;
          }
        }
        grid.mx.putImageData(grid.img, 0, 0);
        const lx = grid.lx;
        lx.globalCompositeOperation = "copy"; lx.imageSmoothingEnabled = false;
        lx.drawImage(grid.mask, 0, 0, cols * g, rows * g);
        lx.globalCompositeOperation = "source-in"; lx.fillStyle = grid.pattern; lx.fillRect(0, 0, cols * g, rows * g);
        ctx.globalAlpha = 0.6 * gridA; ctx.drawImage(grid.layer, 0, 0, W, H);
      }

      // the coastline carries the zoom too
      const lineA = smooth(2.2, 6, cam.zoom) * (1 - smooth(500, 1200, cam.zoom));
      if (lineA > 0.01) {
        ctx.globalAlpha = lineA; ctx.strokeStyle = GOLD; ctx.lineWidth = 1.4; ctx.beginPath();
        for (const run of COAST) {
          let pen = false;
          for (let k = 0; k < run.length; k += 2) {
            const lam = run[k] - l0, phi = run[k + 1], cphi = Math.cos(phi), clam = Math.cos(lam);
            if (sp * Math.sin(phi) + cp * cphi * clam <= 0) { pen = false; continue; }
            const X = cx + cphi * Math.sin(lam) * R, Y = cy - (cp * Math.sin(phi) - sp * cphi * clam) * R;
            if (pen) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); pen = true; }
          }
        }
        ctx.stroke();
      }

      // the city maps, placed by projecting their corners; each fades in as it grows to fill the screen
      for (const m of maps) {
        if (!m.ready) continue;
        const [S, Wl, N, E] = m.bbox;
        const pt = (lat, lon) => { const lam = lon * rad - l0, phi = lat * rad; return [cx + Math.cos(phi) * Math.sin(lam) * R, cy - (cp * Math.sin(phi) - sp * Math.cos(phi) * Math.cos(lam)) * R]; };
        const [x0, y0] = pt(N, Wl), [x1, y1] = pt(S, E), w = x1 - x0, h = y1 - y0;
        if (w < 40 || x1 < 0 || y1 < 0 || x0 > W || y0 > H) continue;
        // in as it grows to fill the screen, out again once it is stretched past its own resolution
        const mag = w * DPR / m.full; // against the full-size map, so both sizes fade at the same point
        const a = smooth(m.fadeIn[0], m.fadeIn[1], Math.max(w / W, h / H)) * (1 - smooth(m.maxMag * 0.6, m.maxMag, mag));
        if (a <= 0) continue;
        ctx.globalAlpha = a; ctx.drawImage(m.img, x0, y0, w, h);
      }
      ctx.globalAlpha = 1;

      const fade = Math.round((1 - clamp(p / 0.05, 0, 1)) * 100) / 100;
      if (fade !== lastFade) { lastFade = fade; for (const el of lifts) { el.style.opacity = fade; el.style.visibility = fade < 0.02 ? "hidden" : "visible"; } }
      bar.classList.toggle("on", p > 0.04); bar.classList.toggle("filled", bottom < H * 0.5);
      caps[0].classList.toggle("on", p >= 0.3 && p < 0.44);
      caps[1].classList.toggle("on", p >= 0.49 && p < 0.58);
      caps[2].classList.toggle("on", p >= 0.66 && p < 0.76);
      caps[3].classList.toggle("on", p >= 0.86);
    }
    requestAnimationFrame(frame);
  }
  // stages: the scroll follows your fingers, but only as far as the next stage; when the gesture ends the camera
  // glides on to that stage, or back to where it was if the gesture was only a nudge
  const STAGES = [0, 0.36, 0.53, 0.72, 1], LAST = STAGES.length - 1;
  const yFor = i => scene.offsetTop + STAGES[clamp(i, 0, LAST)] * (scene.offsetHeight - innerHeight);
  const nearest = () => { const p = (scrollY - scene.offsetTop) / (scene.offsetHeight - innerHeight); return STAGES.reduce((b, v, i) => Math.abs(v - p) < Math.abs(STAGES[b] - p) ? i : b, 0); };
  let stage = 0, target = null, cur = 0, vel = 0, gest = null, idle = 0, settle = 0, tail = null, nativeT = -1e9, tPrev = performance.now();
  const ensure = () => { if (target === null) { cur = target = scrollY; vel = 0; stage = nearest(); } };
  const snapTo = i => { ensure(); stage = clamp(i, 0, LAST); target = yFor(stage); };
  const begin = () => { ensure(); gest = { origin: stage }; };
  const move = d => { target = clamp(target + d, yFor(gest.origin - 1), yFor(gest.origin + 1)); };
  const end = threshold => {
    if (!gest) return;
    const disp = target - yFor(gest.origin), o = gest.origin; gest = null;
    snapTo(Math.abs(disp) > threshold ? o + Math.sign(disp) : o);
  };
  // a damped spring: soft start, soft landing, and it can be redirected mid-flight without a jolt
  (function drive(now) {
    const dt = Math.min(3, (now - tPrev) / 16.7); tPrev = now;
    if (target !== null) {
      if (reduce && !(gest && !gest.committed)) { cur = target; vel = 0; }
      const following = gest && !gest.committed, w = following ? 0.3 : 0.1;
      for (let i = 0; i < Math.ceil(dt); i++) { const h = dt / Math.ceil(dt); vel += (target - cur) * w * w * h; vel *= Math.pow(1 - 2 * w, h); cur += vel * h; }
      if (!following && Math.abs(target - cur) < 0.5 && Math.abs(vel) < 0.2) { cur = target; target = null; }
      scrollTo(0, cur);
    }
    requestAnimationFrame(drive);
  })(tPrev);
  // true when this gesture belongs to the journey rather than the page below it
  const captures = dir => !!gest || (scrollY <= yFor(LAST) + 1 && !(dir > 0 && (target === null ? nearest() : stage) === LAST && scrollY >= yFor(LAST) - innerHeight * 0.6));
  // handing the scroll back to the page stops any glide that is still running
  const release = dir => { if (dir > 0) { target = null; vel = 0; } };

  // wheel and trackpad. A swipe follows the fingers until it clearly means to move (70px), then the stage is decided
  // at once and the camera glides there, the same as a mouse click. A trackpad keeps sending a fading tail of
  // momentum events after the fingers lift; that tail is swallowed, and a new swipe is recognised when the
  // deltas rise again after fading, or reverse.
  addEventListener("wheel", e => {
    if (e.ctrlKey) return; // pinch zoom
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    if (!dy) return;
    const dir = Math.sign(dy), mag = Math.abs(dy), now = performance.now(), endY = yFor(LAST);
    // below the journey the page scrolls normally
    if (!gest && scrollY > endY + 1) { nativeT = now; tail = null; return; }
    // events can stall for a moment mid-tail; a smaller delta in the same direction is still the same fading tail
    if (!gest && tail && now - tail.t < 600 && dir === tail.g.dir && tail.g.n > 3 && tail.g.last < tail.g.peak && mag <= tail.g.last * 1.4 + 2) gest = tail.g;
    tail = null;
    if (gest) e.preventDefault();
    if (gest && gest.committed) {
      if (dir !== gest.dir) { if (mag > 4) gest = null; }
      else {
        gest.peak = Math.max(gest.peak, mag);
        if (!gest.decayed && mag < gest.peak * 0.6) { gest.decayed = true; gest.trough = mag; }
        if (gest.decayed) {
          gest.recent.push(mag); if (gest.recent.length > 2) gest.recent.shift();
          const rise = Math.min(...gest.recent);
          if (gest.recent.length === 2 && rise > gest.trough * 1.8 + 3) gest = null; // a new swipe
          else gest.trough = Math.min(gest.trough, mag);
        }
      }
    }
    if (!gest) {
      const at = target !== null ? stage : nearest();
      // leaving: a new downward swipe at Tech Tower hands the scroll back to the page, so it runs on into the work
      if (dir > 0 && at === LAST && scrollY >= endY - innerHeight * 0.6) { target = null; vel = 0; stage = LAST; nativeT = now; return; }
      // arriving: the same scroll that came up from the work stops at Tech Tower instead of carrying on to Atlanta
      if (dir < 0 && now - nativeT < 300) {
        e.preventDefault(); ensure(); stage = LAST; target = endY;
        gest = { origin: LAST, committed: true, dir: -1, recent: [], peak: mag, last: mag, n: 4 };
        clearTimeout(idle); idle = setTimeout(() => { tail = { g: gest, t: performance.now() }; gest = null; }, 160);
        return;
      }
      begin(); gest.recent = []; gest.peak = mag;
    }
    e.preventDefault();
    gest.last = mag; gest.n = (gest.n || 0) + 1;
    if (!gest.committed) {
      move(dy);
      const disp = target - yFor(gest.origin);
      if (Math.abs(disp) > 70) { const o = gest.origin; snapTo(o + Math.sign(disp)); gest.committed = true; gest.dir = Math.sign(disp); gest.peak = Math.max(mag, gest.peak); }
    }
    clearTimeout(idle); idle = setTimeout(() => { if (gest && gest.committed) { tail = { g: gest, t: performance.now() }; gest = null; } else end(30); }, 160);
  }, { passive: false });

  let touchY = null;
  addEventListener("touchstart", e => { touchY = e.touches[0].clientY; }, { passive: true });
  addEventListener("touchmove", e => {
    if (touchY === null) return;
    const y = e.touches[0].clientY, d = touchY - y; touchY = y;
    if (!gest && !captures(Math.sign(d))) { release(Math.sign(d)); return; }
    e.preventDefault();
    if (!gest) begin();
    move(d * 1.3);
  }, { passive: false });
  addEventListener("touchend", () => { touchY = null; end(40); });
  addEventListener("touchcancel", () => { touchY = null; end(1e9); });
  addEventListener("keydown", e => {
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    const dir = ["ArrowDown", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey) ? 1 : ["ArrowUp", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey) ? -1 : 0;
    if (!dir || gest) return;
    if (!captures(dir)) { release(dir); return; }
    e.preventDefault(); ensure(); snapTo(stage + dir);
  });
  // a scrollbar drag or a jump link can leave the camera between stages; once scrolling stops it settles on the nearest one
  addEventListener("scroll", () => {
    // the scrollbar or a jump moved the page away from the glide: stop gliding and let the settle below take over
    if (target !== null && !gest && Math.abs(scrollY - cur) > 60) { target = null; vel = 0; }
    if (target !== null || gest) return;
    clearTimeout(settle);
    settle = setTimeout(() => {
      if (target !== null || gest || scrollY >= yFor(LAST) - 1) return;
      const i = nearest();
      if (Math.abs(scrollY - yFor(i)) > 2) snapTo(i); else stage = i;
    }, 180);
  }, { passive: true });

  requestAnimationFrame(frame);
})();
