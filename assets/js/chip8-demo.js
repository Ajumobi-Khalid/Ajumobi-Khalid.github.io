// The CHIP-8 card on the home page: the real interpreter (chip8.c compiled to WebAssembly) running
// Octojam 1 Title, a watch-only demo by John Earnest from the Chip8 Community Archive (CC0).
// It starts when the card comes near the screen and pauses whenever the card is out of view.
(() => {
  "use strict";
  const fig = document.getElementById("home-c8");
  if (!fig || !window.Chip8Wasm) return;
  const canvas = fig.querySelector("canvas"), btn = fig.querySelector("button"), stateEl = fig.querySelector(".state"), pcEl = fig.querySelector(".pc");
  const ROM = Uint8Array.from(atob("awiiYtmo+x55CElAeghJQGkAOiASBMz/bQBuAKNy3NjJ/2oAo2LZp6Nq2ah6ASJQ3NhvCv8V/wc/ABI2OhkSKG8G754STqOKYANhB9AQEiBOARJao3puAQDuo4J8/24AAO4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAwMHBwd+///nw4MDBwAAgICAgICAAAAAAAAAYGAAAAAAAAAAAAAA4HBwYODAAAAAAAAAAAAAAAAAAAAAAAcHBwMBACAwBw+f/vz4AAA9fWBgeTkAAPf3zMzPhwBggMHdwcODAADx+5ub+/EAAOKz9wfm7gAAwOAgAAAAIDAsI6BoFEsgECJUpKUmZcgAAEGiMq5RiYTAQEFGSeoaiQABwEBHKhIJeJZJJCQiIkQAB7hAQyQoGVCUFqVP8pUkAQMFCTLGOAABAgYMO/T+OAAAADZ/a1UAACju2AN7fQAAFHdBQWNBAAAAAAAAAAAACMAP4AHgF5gd0AjAGOAIwAEAAAAAAAAA"), c => c.charCodeAt(0));
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let c8 = null, starting = false, visible = false, userPaused = still;

  const apply = () => {
    if (!c8) return;
    const run = visible && !userPaused && !document.hidden;
    c8.pause(!run);
    btn.textContent = userPaused ? "Play" : "Pause";
    btn.setAttribute("aria-pressed", String(userPaused));
    stateEl.textContent = userPaused ? "paused" : "running";
  };
  function start() {
    if (starting) return; starting = true;
    window.Chip8Wasm.start(canvas, fig.dataset.wasm).then(m => {
      c8 = m; c8.volume(0); c8.load(ROM); apply();
      setInterval(() => { if (visible && !userPaused) pcEl.textContent = c8.registers()[17].toString(16).toUpperCase().padStart(3, "0"); }, 150);
    }, () => { stateEl.textContent = "not available"; btn.hidden = true; });
  }
  new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) start(); apply(); }, { rootMargin: "300px 0px" }).observe(fig);
  document.addEventListener("visibilitychange", apply);
  btn.addEventListener("click", () => { userPaused = !userPaused; apply(); });
  btn.textContent = still ? "Play" : "Pause";
})();
