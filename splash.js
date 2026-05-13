(function () {
  const REVEAL_MS = 9000;
  const EXIT_FADE_MS = 5000;
  const ACCENT_COLORS = ["#80CED7", "#E8F80B", "#7E6B8F", "#FF4CB2"];

  const letters = () => Array.from(document.querySelectorAll(".splash-letter"));

  let flashTimer = null;
  let revealTimer = null;
  let exitNavigateTimer = null;
  let exitBurstTimer = null;

  function flashDurationMs() {
    return 200 + Math.random() * 700;
  }

  function stopLetterFlashLoop() {
    if (flashTimer != null) {
      window.clearTimeout(flashTimer);
      flashTimer = null;
    }
  }

  function stopRevealTimer() {
    if (revealTimer != null) {
      window.clearTimeout(revealTimer);
      revealTimer = null;
    }
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

  /** Quick “all letters” color bursts while background fades. */
  function runExitLetterBursts() {
    const els = letters();
    if (!els.length) return;

    const burstCount = 6;
    const stepMs = 75;
    let step = 0;

    exitBurstTimer = window.setInterval(() => {
      if (step >= burstCount) {
        window.clearInterval(exitBurstTimer);
        exitBurstTimer = null;
        els.forEach((el) => {
          el.style.color = "";
        });
        return;
      }

      if (step % 2 === 0) {
        els.forEach((el) => {
          el.style.color = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
        });
      } else {
        els.forEach((el) => {
          el.style.color = "";
        });
      }
      step += 1;
    }, stepMs);
  }

  function startExitTransition(targetHref) {
    stopLetterFlashLoop();
    stopRevealTimer();

    document.body.classList.add("splash-exiting");
    document.body.setAttribute("aria-busy", "true");

    runExitLetterBursts();

    if (exitNavigateTimer != null) window.clearTimeout(exitNavigateTimer);
    exitNavigateTimer = window.setTimeout(() => {
      exitNavigateTimer = null;
      window.location.href = targetHref;
    }, EXIT_FADE_MS);
  }

  const enter = document.querySelector(".splash-enter");
  if (enter) {
    enter.addEventListener("click", (e) => {
      if (document.body.classList.contains("splash-exiting")) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const href = enter.getAttribute("href") || "/home.html";
      startExitTransition(href);
    });
  }

  revealTimer = window.setTimeout(() => {
    revealTimer = null;
    startInteractivePhase();
  }, REVEAL_MS);

  window.addEventListener("pagehide", () => {
    stopLetterFlashLoop();
    stopRevealTimer();
    if (exitNavigateTimer != null) window.clearTimeout(exitNavigateTimer);
    if (exitBurstTimer != null) window.clearInterval(exitBurstTimer);
  });
})();
