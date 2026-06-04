/**
 * Top-bar KONSULT logo: one random letter at a time uses splash accent colors.
 * Keep ACCENT_COLORS in sync with public/splash.js.
 */
(function () {
  const ACCENT_COLORS = ["#80CED7", "#E8F80B", "#7E6B8F", "#FF4CB2"];

  function nextIntervalMs() {
    return 1500 + Math.random() * 2500;
  }

  function lettersFromLogo(logo) {
    return Array.from(logo.querySelectorAll(".konsult-logo-letter"));
  }

  function ensureLogoLetters(logo) {
    if (logo.querySelector(".konsult-logo-letters")) {
      return () => lettersFromLogo(logo);
    }
    const text = (logo.textContent || "KONSULT").trim().toUpperCase();
    logo.textContent = "";
    logo.classList.add("council-top-logo--letters");
    if (!logo.getAttribute("aria-label")) {
      logo.setAttribute("aria-label", "Konsult — home");
    }
    const wrap = document.createElement("span");
    wrap.className = "konsult-logo-letters";
    wrap.setAttribute("aria-hidden", "true");
    for (const ch of text) {
      const span = document.createElement("span");
      span.className = "konsult-logo-letter";
      span.textContent = ch;
      wrap.appendChild(span);
    }
    logo.appendChild(wrap);
    return () => lettersFromLogo(logo);
  }

  function pickLetterIndex(els, avoidIndex) {
    if (els.length <= 1) return 0;
    let i;
    do {
      i = Math.floor(Math.random() * els.length);
    } while (i === avoidIndex);
    return i;
  }

  function startLogoColorCycle(getLetters) {
    let timer = null;
    let activeEl = null;
    let lastIndex = -1;

    function tick() {
      const els = getLetters();
      if (!els.length) return;
      if (activeEl) activeEl.style.color = "";
      const idx = pickLetterIndex(els, lastIndex);
      lastIndex = idx;
      activeEl = els[idx];
      activeEl.style.color = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
      timer = window.setTimeout(tick, nextIntervalMs());
    }

    tick();
  }

  function init() {
    document.querySelectorAll(".council-top-logo").forEach((logo) => {
      const getLetters = ensureLogoLetters(logo);
      startLogoColorCycle(getLetters);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
