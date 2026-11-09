// Starts the real interpreter: chip8.c compiled to WebAssembly with Emscripten (see wasm/build.sh).
// SDL draws into the given canvas and plays the beep; this file only passes ROMs, keys and settings in.
(() => {
  "use strict";
  const MAX_ROM = 4096 - 0x200;

  // load assets/wasm/chip8.js once, then start one instance of the C program on the canvas
  function boot(canvas, base) {
    return new Promise((resolve, reject) => {
      const go = () => window.createChip8({
        canvas,
        locateFile: f => base + f,
        print: () => {}, printErr: m => console.warn("[chip8]", m),
      }).then(resolve, reject);
      if (window.createChip8) return go();
      const s = document.createElement("script");
      s.src = base + "chip8.js"; s.async = true;
      s.onload = go; s.onerror = () => reject(new Error("Could not load the interpreter"));
      document.head.appendChild(s);
    });
  }

  window.Chip8Wasm = {
    MAX_ROM,
    // keyboard key -> CHIP-8 key, the same layout as handle_input in chip8.c
    KEYMAP: { "1": 0x1, "2": 0x2, "3": 0x3, "4": 0xC, q: 0x4, w: 0x5, e: 0x6, r: 0xD, a: 0x7, s: 0x8, d: 0x9, f: 0xE, z: 0xA, x: 0x0, c: 0xB, v: 0xF },
    async start(canvas, base) {
      const M = await boot(canvas, base);
      let n = 0;
      // browsers start audio suspended until the visitor interacts with the page
      const wake = () => { const ctx = M.SDL2 && M.SDL2.audioContext; if (ctx && ctx.state === "suspended") ctx.resume(); };
      return {
        // write the bytes into Emscripten's file system and hand the path to init_chip8, which fopen()s it
        load(bytes) {
          if (bytes.length > MAX_ROM) return false;
          const path = `/rom${++n}.ch8`;
          M.FS.writeFile(path, bytes);
          wake();
          return !!M.ccall("web_load", "number", ["string"], [path]);
        },
        reset() { return !!M.ccall("web_load", "number", ["string"], [`/rom${n}.ch8`]); },
        key(k, down) { M._web_key(k, down ? 1 : 0); wake(); },
        pause(p) { M._web_pause(p ? 1 : 0); },
        clock(hz) { M._web_set_clock(hz); },
        volume(v) { M._web_set_volume(v); },
        wake,
        // V0-VF, I, PC, DT, ST
        registers() { const p = M._web_registers() >> 1; return M.HEAPU16.subarray(p, p + 20); },
      };
    },
  };
})();
