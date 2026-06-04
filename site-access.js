/**
 * Client-side site access gate (session only). Not a substitute for server auth.
 *
 * Set the password here, or before this script loads:
 *   window.KONSULT_SITE_PASSWORD = "your-password";
 */
(function () {
  const STORAGE_KEY = "konsultSiteAccess";
  const DEFAULT_PASSWORD = "Konsult26!";

  function expectedPassword() {
    const custom = typeof window !== "undefined" && window.KONSULT_SITE_PASSWORD;
    return typeof custom === "string" && custom.length > 0 ? custom : DEFAULT_PASSWORD;
  }

  function isUnlocked() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function grantAccess() {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function showAccessModal() {
    if (document.getElementById("siteAccessOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "siteAccessOverlay";
    overlay.className = "site-access-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "siteAccessTitle");

    overlay.innerHTML = `
      <form class="site-access-panel" id="siteAccessForm" autocomplete="off">
        <h2 class="site-access-title" id="siteAccessTitle">Site access</h2>
        <p class="site-access-hint">Enter the password to continue.</p>
        <label class="site-access-label" for="siteAccessPassword">Password</label>
        <input
          type="password"
          id="siteAccessPassword"
          class="site-access-input"
          required
          autocomplete="current-password"
        />
        <p class="site-access-error" id="siteAccessError" hidden role="alert">Incorrect password. Try again.</p>
        <button type="submit" class="site-access-submit">Continue</button>
      </form>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add("site-access-locked");

    const form = overlay.querySelector("#siteAccessForm");
    const input = overlay.querySelector("#siteAccessPassword");
    const err = overlay.querySelector("#siteAccessError");

    function dismissGate() {
      overlay.remove();
      document.body.classList.remove("site-access-locked");
    }

    function tryUnlock() {
      if (input.value === expectedPassword()) {
        grantAccess();
        dismissGate();
        return;
      }
      err.hidden = false;
      input.focus();
      input.select();
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      tryUnlock();
    });

    input.addEventListener("input", () => {
      err.hidden = true;
    });

    input.focus();
  }

  if (isUnlocked()) return;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showAccessModal);
  } else {
    showAccessModal();
  }
})();
