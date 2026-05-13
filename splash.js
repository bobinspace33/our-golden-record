(function () {
  const REVEAL_MS = 9000;
  const ACCENT_COLORS = ["#80CED7", "#E8F80B", "#7E6B8F", "#FF4CB2"];

  const letters = () => Array.from(document.querySelectorAll(".splash-letter"));
  let flashTimer = null;

  function flashDurationMs() {
    return 200 + Math.random() * 700;
  }

  function scheduleLetterFlash() {
    const els = letters();
    if (!els.length) return;
    const i = Math.floor(Math.random() * els.length);
    const color = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
    const el = els[i];
    el.style.color = color;
    flashTimer = window.setTimeout(() => {
      el.style.color = "";
      scheduleLetterFlash();
    }, flashDurationMs());
  }

  function startInteractivePhase() {
    document.body.classList.add("splash-interactive");
    scheduleLetterFlash();
  }

  window.setTimeout(startInteractivePhase, REVEAL_MS);

  window.addEventListener("pagehide", () => {
    if (flashTimer != null) window.clearTimeout(flashTimer);
  });
})();
