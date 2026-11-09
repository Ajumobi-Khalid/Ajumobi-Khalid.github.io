// The CHIP-8 player on the project page. The interpreter is chip8.c itself, compiled to WebAssembly
// (chip8-wasm.js starts it); this file is the page around it: the ROM shelf, file loading, the
// on-screen keypad, the live registers and the controls.
(() => {
  "use strict";
  const root = document.getElementById("player");
  if (!root || !window.Chip8Wasm) return;
  const { KEYMAP, MAX_ROM } = window.Chip8Wasm;

  const $ = s => root.querySelector(s);
  const screen = $("#c8-screen");
  const overlay = $("#c8-overlay"), status = $("#c8-status"), clockSel = $("#c8-clock");
  const pauseBtn = $("#c8-pause"), resetBtn = $("#c8-reset"), muteBtn = $("#c8-mute"), fileIn = $("#c8-file");
  const shelf = $("#c8-roms"), keypad = $("#c8-keypad"), regsEl = $("#c8-regs");

  let c8 = null, romName = "", loaded = false, paused = false, muted = false;
  const keys = new Uint8Array(16);
  const say = text => { overlay.textContent = text; overlay.hidden = false; };

  // ---------------- registers, read out of the C machine a few times a second
  const regCells = [];
  for (let i = 0; i < 16; i++) { const s = document.createElement("span"); s.innerHTML = `<i>V${i.toString(16).toUpperCase()}</i><b>00</b>`; if (i === 15) s.className = "flag"; regsEl.appendChild(s); regCells.push(s.lastChild); }
  for (const name of ["I", "PC", "DT", "ST"]) { const s = document.createElement("span"); s.className = "wide"; s.innerHTML = `<i>${name}</i><b>0</b>`; regsEl.appendChild(s); regCells.push(s.lastChild); }
  const hex = (v, n) => v.toString(16).toUpperCase().padStart(n, "0");
  function showRegs() {
    if (!c8) return;
    const r = c8.registers();
    for (let i = 0; i < 16; i++) regCells[i].textContent = hex(r[i], 2);
    regCells[16].textContent = hex(r[16], 3); regCells[17].textContent = hex(r[17], 3);
    regCells[18].textContent = r[18]; regCells[19].textContent = r[19];
  }

  function setStatus() {
    status.textContent = !loaded ? (c8 ? "No ROM loaded" : "Starting the interpreter") : paused ? `${romName} · paused` : `${romName} · running`;
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    pauseBtn.disabled = resetBtn.disabled = !loaded;
  }

  // ---------------- loading
  let pending = null; // a ROM picked before the interpreter finished starting
  function load(bytes, name, clock) {
    if (!c8) { pending = [bytes, name, clock]; say("Starting the interpreter"); return; }
    if (clock) clockSel.value = String(clock);
    c8.clock(+clockSel.value);
    if (!c8.load(bytes)) { say(`${name} could not be loaded.`); return; }
    loaded = true; romName = name; paused = false; overlay.hidden = true;
    showRegs(); setStatus();
    shelf.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === name)));
  }
  const decode = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  for (const rom of window.CHIP8_ROMS || []) {
    const li = document.createElement("li");
    li.innerHTML = `<button type="button" data-id="${rom.title}" aria-pressed="false"><b>${rom.title}</b><small>${rom.author}</small><span>${rom.how}</span></button>`;
    li.firstChild.addEventListener("click", () => {
      load(decode(rom.data), rom.title, rom.clock); screen.focus({ preventScroll: true });
      // on a phone the list sits below the keypad, so bring the screen back into view
      if (matchMedia("(max-width: 960px)").matches) screen.parentElement.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    shelf.appendChild(li);
  }
  async function loadFile(file) {
    if (!file) return;
    if (file.size > MAX_ROM) { say(`${file.name} is ${file.size.toLocaleString()} bytes. A CHIP-8 ROM can be at most ${MAX_ROM.toLocaleString()}.`); return; }
    load(new Uint8Array(await file.arrayBuffer()), file.name, 500);
  }
  fileIn.addEventListener("change", () => loadFile(fileIn.files[0]));
  const drop = $("#c8-drop");
  for (const el of [drop, screen.parentElement]) {
    el.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
    el.addEventListener("dragleave", () => drop.classList.remove("over"));
    el.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); loadFile(e.dataTransfer.files[0]); });
  }

  // ---------------- controls, as in handle_input: space pauses, = resets
  function togglePause() { if (!loaded) return; paused = !paused; c8.pause(paused); setStatus(); }
  function reset() { if (loaded) { c8.reset(); paused = false; showRegs(); setStatus(); } }
  pauseBtn.addEventListener("click", togglePause);
  resetBtn.addEventListener("click", reset);
  clockSel.addEventListener("change", () => { if (c8) c8.clock(+clockSel.value); });
  muteBtn.addEventListener("click", () => {
    muted = !muted; muteBtn.textContent = muted ? "Sound off" : "Sound on"; muteBtn.setAttribute("aria-pressed", String(muted));
    if (c8) c8.volume(muted ? 0 : 1200);
  });

  // ---------------- keys: the keyboard drives the keypad while the player is on screen
  function setKey(k, down) { keys[k] = down ? 1 : 0; if (c8) c8.key(k, down); keyBtns[k].classList.toggle("down", !!down); }
  const releaseAll = () => { for (let k = 0; k < 16; k++) if (keys[k]) setKey(k, false); };
  let inView = false;
  new IntersectionObserver(e => { inView = e[0].intersectionRatio > 0.35; if (!inView) releaseAll(); }, { threshold: [0, 0.35, 0.6] }).observe(root);
  const typing = t => t && t.closest && t.closest("input, select, textarea, [contenteditable]");
  addEventListener("keydown", e => {
    if (!inView || !loaded || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    const k = e.key.toLowerCase();
    if (k in KEYMAP) { e.preventDefault(); setKey(KEYMAP[k], true); }
    else if (k === " ") { e.preventDefault(); if (!e.repeat) togglePause(); }
    else if (k === "=") { e.preventDefault(); reset(); }
  });
  addEventListener("keyup", e => { const k = e.key.toLowerCase(); if (k in KEYMAP) setKey(KEYMAP[k], false); });
  addEventListener("blur", releaseAll);

  // the on-screen keypad, laid out like the original hex keypad, with the keyboard key under each
  const LAYOUT = [[0x1, "1"], [0x2, "2"], [0x3, "3"], [0xC, "4"], [0x4, "Q"], [0x5, "W"], [0x6, "E"], [0xD, "R"], [0x7, "A"], [0x8, "S"], [0x9, "D"], [0xE, "F"], [0xA, "Z"], [0x0, "X"], [0xB, "C"], [0xF, "V"]];
  const keyBtns = [];
  for (const [code, kb] of LAYOUT) {
    const b = document.createElement("button");
    b.type = "button"; b.innerHTML = `<b>${code.toString(16).toUpperCase()}</b><span>${kb}</span>`;
    b.setAttribute("aria-label", `Key ${code.toString(16).toUpperCase()}, keyboard ${kb}`);
    const down = e => { e.preventDefault(); setKey(code, true); b.setPointerCapture && e.pointerId !== undefined && b.setPointerCapture(e.pointerId); };
    const up = () => setKey(code, false);
    b.addEventListener("pointerdown", down); b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("lostpointercapture", up);
    b.addEventListener("keydown", e => { if (e.key === "Enter") setKey(code, true); });
    b.addEventListener("keyup", e => { if (e.key === "Enter") up(); });
    keypad.appendChild(b); keyBtns[code] = b;
  }

  // ---------------- start the C program
  setStatus();
  window.Chip8Wasm.start(screen, root.dataset.wasm).then(m => {
    c8 = m;
    if (pending) load(...pending); else setStatus();
    setInterval(() => { if (loaded && !paused && !document.hidden) showRegs(); }, 100);
  }, err => { console.error(err); say("The interpreter could not start in this browser."); status.textContent = "Not available"; });
})();
