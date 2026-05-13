(function () {
  /** Must stay in sync with `.splash-bg-blackout`/`--splash-blackout-duration` in splash.css */
  const BLACKOUT_REVEAL_MS = 9000;
  const EXIT_FADE_MS = 5000;
  /** Fully visible hold after slide-in completes. */
  const MUSIC_CREDIT_HOLD_MS = 5000;
  /** Match `.splash-music-credit` slide-in transition duration. */
  const MUSIC_CREDIT_SLIDE_IN_MS = 550;
  const ACCENT_COLORS = ["#80CED7", "#E8F80B", "#7E6B8F", "#FF4CB2"];

  const letters = () => Array.from(document.querySelectorAll(".splash-letter"));
  const splashMusic = document.getElementById("splashMusic");
  const musicCredit = document.querySelector(".splash-music-credit");

  let flashTimer = null;
  let revealTimer = null;
  let exitNavigateTimer = null;
  let exitBurstTimer = null;
  let splashMusicFadeRaf = null;
  let splashMusicFadeStartVol = 1;
  let musicCreditHoldTimer = null;
  let musicCreditOutTimer = null;
  let musicCreditEndTimer = null;
  let splashBlackoutKickDone = false;
  let blackoutAlignFallbackTimer = null;
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

  function cancelMusicCreditTimers() {
    if (musicCreditHoldTimer != null) {
      window.clearTimeout(musicCreditHoldTimer);
      musicCreditHoldTimer = null;
    }
    if (musicCreditOutTimer != null) {
      window.clearTimeout(musicCreditOutTimer);
      musicCreditOutTimer = null;
    }
    if (musicCreditEndTimer != null) {
      window.clearTimeout(musicCreditEndTimer);
      musicCreditEndTimer = null;
    }
  }

  function resetMusicCreditVisually() {
    if (!musicCredit) return;
    musicCredit.classList.remove("splash-music-credit--in", "splash-music-credit--out");
  }

  function scheduleMusicCredit() {
    if (!musicCredit) return;
    cancelMusicCreditTimers();
    musicCredit.classList.remove("splash-music-credit--out");
    void musicCredit.offsetWidth;
    musicCredit.classList.add("splash-music-credit--in");

    musicCreditHoldTimer = window.setTimeout(() => {
      musicCreditHoldTimer = null;
      musicCreditOutTimer = window.setTimeout(() => {
        musicCreditOutTimer = null;
        musicCredit.classList.remove("splash-music-credit--in");
        musicCredit.classList.add("splash-music-credit--out");

        musicCreditEndTimer = window.setTimeout(() => {
          musicCreditEndTimer = null;
          musicCredit.classList.remove("splash-music-credit--out");
        }, 700);
      }, MUSIC_CREDIT_HOLD_MS);
    }, MUSIC_CREDIT_SLIDE_IN_MS);
  }

  function beginSplashMusicAttempt(showCreditWhenPlaying) {
    if (!splashMusic) return;
    void kickSplashMusicCycle(showCreditWhenPlaying).catch(() => {});
  }

  /**
   * Most browsers block autoplay without a user gesture. pointerdown/keydown fires before a KONSULT click,
   * so play() succeeds in gesture context.
   */
  function bindSplashMusicUserPlayback() {
    if (!splashMusic) return;

    function tryPlaybackFromGesture() {
      if (document.body.classList.contains("splash-exiting")) return;
      if (!splashMusic.paused) return;
      void kickSplashMusicCycle(true).catch(() => {});
    }

    document.addEventListener("pointerdown", tryPlaybackFromGesture, true);
    document.addEventListener("keydown", tryPlaybackFromGesture, true);

    splashMusic.addEventListener("error", () => {
      console.warn("Splash music failed to load. Check audio path:", splashMusic.src || splashMusic.currentSrc);
    });
  }

  /** Fire when `.splash-bg-blackout` fade begins (`defer` scripts may attach after animationstart — cover that). */
  function alignSplashMusicToBlackoutStart() {
    if (!splashMusic) return;

    function kickOnceBlackoutBegins() {
      if (splashBlackoutKickDone) return;
      splashBlackoutKickDone = true;
      if (blackoutAlignFallbackTimer != null) {
        window.clearTimeout(blackoutAlignFallbackTimer);
        blackoutAlignFallbackTimer = null;
      }
      beginSplashMusicAttempt(true);
    }

    const blackout = document.querySelector(".splash-bg-blackout");
    if (!blackout) {
      kickOnceBlackoutBegins();
      return;
    }

    blackout.addEventListener(
      "animationstart",
      (ev) => {
        if (ev.animationName !== "splash-bg-reveal") return;
        kickOnceBlackoutBegins();
      },
      false
    );

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const cs = window.getComputedStyle(blackout);
        if (
          cs.animationName === "splash-bg-reveal" &&
          (cs.animationPlayState === "running" || cs.animationPlayState === "pending")
        ) {
          kickOnceBlackoutBegins();
        }
      });
    });

    blackoutAlignFallbackTimer = window.setTimeout(() => kickOnceBlackoutBegins(), 120);
  }

  function fadeSplashMusicOut(durationMs) {
    if (!splashMusic || splashMusicFadeRaf != null) return;
    splashMusicFadeStartVol = splashMusic.volume;
    const start = performance.now();

    function frame(now) {
      const t = Math.min(1, (now - start) / durationMs);
      splashMusic.volume = splashMusicFadeStartVol * (1 - t);
      if (t < 1) {
        splashMusicFadeRaf = window.requestAnimationFrame(frame);
      } else {
        splashMusicFadeRaf = null;
        splashMusic.pause();
      }
    }
    splashMusicFadeRaf = window.requestAnimationFrame(frame);
  }

  /**
   * @param {boolean} showCreditWhenPlaying
   * @returns {Promise<void>}
   */
  function kickSplashMusicCycle(showCreditWhenPlaying) {
    if (!splashMusic) return Promise.resolve();
    splashMusic.loop = false;
    const p = splashMusic.play();
    if (p && typeof p.then === "function") {
      return p.then(() => {
        if (showCreditWhenPlaying) scheduleMusicCredit();
      });
    }
    if (showCreditWhenPlaying) scheduleMusicCredit();
    return Promise.resolve();
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

  /** All letters pulse random accent colors for the full exit fade duration. */
  function runExitLetterBursts() {
    const els = letters();
    if (!els.length) return;

    const stepMs = 85;
    let step = 0;

    exitBurstTimer = window.setInterval(() => {
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
    cancelMusicCreditTimers();
    resetMusicCreditVisually();

    fadeSplashMusicOut(EXIT_FADE_MS);

    document.body.classList.add("splash-exiting");
    document.body.setAttribute("aria-busy", "true");

    runExitLetterBursts();

    if (exitNavigateTimer != null) window.clearTimeout(exitNavigateTimer);
    exitNavigateTimer = window.setTimeout(() => {
      exitNavigateTimer = null;
      if (exitBurstTimer != null) {
        window.clearInterval(exitBurstTimer);
        exitBurstTimer = null;
      }
      letters().forEach((el) => {
        el.style.color = "";
      });
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
      const href = enter.getAttribute("href") || "home.html";
      startExitTransition(href);
    });
  }

  revealTimer = window.setTimeout(() => {
    revealTimer = null;
    startInteractivePhase();
  }, BLACKOUT_REVEAL_MS);

  if (splashMusic) {
    bindSplashMusicUserPlayback();
    splashMusic.addEventListener("ended", () => {
      splashMusic.currentTime = 0;
      void kickSplashMusicCycle(true).catch(() => {});
    });
    splashMusic.volume = 1;
    alignSplashMusicToBlackoutStart();
  }

  window.addEventListener("pagehide", () => {
    stopLetterFlashLoop();
    stopRevealTimer();
    if (blackoutAlignFallbackTimer != null) {
      window.clearTimeout(blackoutAlignFallbackTimer);
      blackoutAlignFallbackTimer = null;
    }
    cancelMusicCreditTimers();
    if (splashMusicFadeRaf != null) {
      window.cancelAnimationFrame(splashMusicFadeRaf);
      splashMusicFadeRaf = null;
    }
    if (splashMusic) {
      splashMusic.pause();
    }
    if (exitNavigateTimer != null) window.clearTimeout(exitNavigateTimer);
    if (exitBurstTimer != null) window.clearInterval(exitBurstTimer);
  });
})();
