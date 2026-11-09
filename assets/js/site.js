// small touches shared by every page
// the copy button beside the email address
document.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(b.dataset.copy); } catch { return; }
  const was = b.textContent; b.textContent = "Copied"; b.classList.add("done");
  setTimeout(() => { b.textContent = was; b.classList.remove("done"); }, 1600);
}));
