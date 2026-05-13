(function () {
  /** Must stay in sync with `.splash-bg-blackout`/`--splash-blackout-duration` in splash.css */
  const BLACKOUT_REVEAL_MS = 9000;
  /** If buffering is slow, don’t extend black screen indefinitely; fade + play() anyway. */
  const SPLASH_AUDIO_READY_MAX_WAIT_MS = 2800;
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
  let splashRevealStarted = false;
  let splashRevealMaxWaitTimer = null;
  /** Started via muted autoplay; next non-title gesture unmutes audibly without restarting. */
  let splashAwaitingGestureUnmute = false;
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
    startSplashPlaybackForReveal(showCreditWhenPlaying);
  }

  /** Unmuted autoplay where allowed; otherwise muted autoplay until a tap outside the title unmutes. */
  function startSplashPlaybackForReveal(showCredit) {
    if (!splashMusic) return;
    splashMusic.volume = 1;
    splashAwaitingGestureUnmute = false;
    splashMusic.muted = false;
    const p = splashMusic.play();
    const onPlayed = () => {
      if (showCredit) scheduleMusicCredit();
    };
    if (p && typeof p.then === "function") {
      void p.then(onPlayed).catch(() => {
        splashMusic.muted = true;
        const p2 = splashMusic.play();
        const onMutedPlaying = () => {
          splashAwaitingGestureUnmute = true;
          if (showCredit) scheduleMusicCredit();
        };
        if (p2 && typeof p2.then === "function") {
          void p2.then(onMutedPlaying).catch(() => {});
        } else {
          onMutedPlaying();
        }
      });
    } else {
      onPlayed();
    }
  }

  /**
   * Unmute-after-muted-autoplay applies to any gesture (including the title).
   * Restart via kickSplashMusicCycle is skipped for `.splash-enter` — exit handles that click.
   */
  function bindSplashMusicUserPlayback() {
    if (!splashMusic) return;

    function gestureTargetOutsideTitle(ev) {
      const t = ev.target;
      if (t && typeof t.closest === "function" && t.closest(".splash-enter")) return false;
      return true;
    }

    function tryPlaybackFromGesture(ev) {
      if (document.body.classList.contains("splash-exiting")) return;

      /* Must run before title exclusion — muted autoplay otherwise stays silent until user taps outside the wordmark. */
      if (splashAwaitingGestureUnmute) {
        splashMusic.muted = false;
        splashMusic.volume = 1;
        splashAwaitingGestureUnmute = false;
        return;
      }

      if (!gestureTargetOutsideTitle(ev)) return;

      if (!splashMusic.paused) return;
      void kickSplashMusicCycle(true).catch(() => {});
    }

    document.addEventListener("pointerdown", tryPlaybackFromGesture, true);
    document.addEventListener("keydown", tryPlaybackFromGesture, true);

    splashMusic.addEventListener("error", () => {
      console.warn("Splash music failed to load. Check audio path:", splashMusic.src || splashMusic.currentSrc);
    });
  }

  /** Start fade + timeline + music together once the track can buffer enough to play (`canplay`) or deadline hits. */
  function beginSplashRevealAndMusic(blackoutEl) {
    if (splashRevealStarted) return;
    splashRevealStarted = true;
    if (splashRevealMaxWaitTimer != null) {
      window.clearTimeout(splashRevealMaxWaitTimer);
      splashRevealMaxWaitTimer = null;
    }
    if (blackoutEl) {
      blackoutEl.classList.add("splash-bg-blackout--reveal");
    }

    stopRevealTimer();
    revealTimer = window.setTimeout(() => {
      revealTimer = null;
      startInteractivePhase();
    }, BLACKOUT_REVEAL_MS);

    beginSplashMusicAttempt(true);
  }

  function armSplashRevealWhenAudioReady() {
    const blackoutEl = document.querySelector(".splash-bg-blackout");

    if (!splashMusic) {
      beginSplashRevealAndMusic(blackoutEl);
      return;
    }

    if (splashMusic.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      beginSplashRevealAndMusic(blackoutEl);
      return;
    }

    splashRevealMaxWaitTimer = window.setTimeout(() => {
      splashRevealMaxWaitTimer = null;
      beginSplashRevealAndMusic(blackoutEl);
    }, SPLASH_AUDIO_READY_MAX_WAIT_MS);

    splashMusic.addEventListener(
      "canplay",
      () => {
        beginSplashRevealAndMusic(blackoutEl);
      },
      { once: true }
    );
  }

  function fadeSplashMusicOut(durationMs) {
    if (!splashMusic || splashMusicFadeRaf != null) return;
    splashMusic.muted = false;
    splashAwaitingGestureUnmute = false;
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
    splashAwaitingGestureUnmute = false;
    splashMusic.muted = false;
    splashMusic.volume = splashMusic.volume > 0 ? splashMusic.volume : 1;
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

    if (splashMusic && splashAwaitingGestureUnmute) {
      splashMusic.muted = false;
      splashMusic.volume = 1;
      splashAwaitingGestureUnmute = false;
    }

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


  if (splashMusic) {
    bindSplashMusicUserPlayback();
    splashMusic.addEventListener("ended", () => {
      splashMusic.currentTime = 0;
      void kickSplashMusicCycle(true).catch(() => {});
    });
    splashMusic.volume = 1;
  }

  armSplashRevealWhenAudioReady();

  window.addEventListener("pagehide", () => {
    stopLetterFlashLoop();
    stopRevealTimer();
    if (splashRevealMaxWaitTimer != null) {
      window.clearTimeout(splashRevealMaxWaitTimer);
      splashRevealMaxWaitTimer = null;
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
