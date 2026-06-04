const STORAGE_KEY = "aiCouncilSavedProjects";
const DRAFT_STORAGE_KEY = "aiCouncilTemplateDrafts";

/** Card backgrounds (exclude composite used for splash entrance). */
const HOME_CARD_BACKGROUNDS = [
  "backgrounds/deep-wKKm7mbVn74-unsplash.jpg",
  "backgrounds/deep-26QAI-R8-3k-unsplash.jpg",
  "backgrounds/deep-47_wA-2WAF4-unsplash.jpg",
  "backgrounds/deep-PGoUHDVRBcA-unsplash.jpg",
  "backgrounds/deep-Ts9_sclEn5k-unsplash.jpg",
  "backgrounds/deep-h7Pjlkw-cm4-unsplash.jpg",
  "backgrounds/deep-ObF3BoYi3Oc-unsplash.jpg",
  "backgrounds/deep-3YErd7Gwol0-unsplash.jpg",
  "backgrounds/deep-isf0PELGzBE-unsplash.jpg",
  "backgrounds/deep-CW-b-vBKa5U-unsplash.jpg",
  "backgrounds/deep-pd5BHCzh2Q4-unsplash.jpg",
  "backgrounds/deep-Sx9psSuvK4M-unsplash.jpg",
  "backgrounds/deep-j-oNlEbFrpU-unsplash.jpg",
  "backgrounds/deep-bQs3iP_7JtA-unsplash.jpg",
  "backgrounds/deep-0KMGN2FYW78-unsplash.jpg",
  "backgrounds/deep-K92pByP9tPQ-unsplash.jpg",
  "backgrounds/sliver1.png",
  "backgrounds/sliver2.png",
  "backgrounds/sliver3.png",
  "backgrounds/sliver4.png",
  "backgrounds/sliver5.png",
  "backgrounds/sliver6.png",
];

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickCardBackgroundUrls(count) {
  const pool = shuffleArray(HOME_CARD_BACKGROUNDS);
  const urls = [];
  for (let i = 0; i < count; i++) urls.push(pool[i % pool.length]);
  return urls;
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function deleteSavedCouncilById(id) {
  if (!id) return;
  const saved = loadSaved().filter((x) => x && x.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.slice(0, 20)));
  } catch {
    /* ignore */
  }
}

const ICON_TRASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;

const ICON_SHARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

function councilShareUrl(savedId) {
  const path = `/council.html?saved=${encodeURIComponent(savedId)}`;
  return new URL(path, window.location.origin).href;
}

function draftEditShareUrl(draftId) {
  const path = `/create.html?draft=${encodeURIComponent(draftId)}`;
  return new URL(path, window.location.origin).href;
}

async function copyTextToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function copyCouncilShareLink(savedId) {
  return copyTextToClipboard(councilShareUrl(savedId));
}

function attachShareIconButton(actions, { labelTitle, getUrl }) {
  const share = document.createElement("button");
  share.type = "button";
  share.className = "project-list-icon-btn project-list-icon-share";
  share.setAttribute("aria-label", `Copy link to ${labelTitle}`);
  share.title = "Copy link to this council";
  share.innerHTML = ICON_SHARE_SVG;
  share.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const url = getUrl();
    const ok = await copyTextToClipboard(url);
    if (ok) {
      share.title = "Link copied!";
      share.setAttribute("aria-label", "Link copied to clipboard");
      setTimeout(() => {
        share.title = "Copy link to this council";
        share.setAttribute("aria-label", `Copy link to ${labelTitle}`);
      }, 2000);
    } else {
      share.title = "Could not copy — try opening the council and copy the URL from the address bar.";
      setTimeout(() => {
        share.title = "Copy link to this council";
      }, 3500);
    }
  });
  actions.appendChild(share);
  return share;
}

function loadDrafts() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadBuiltin() {
  try {
    const res = await fetch("/api/projects");
    const data = await res.json();
    return data.projects || [];
  } catch {
    return [
      {
        id: "golden-record",
        title: "Our Golden Record AI Council",
        description: "Interdisciplinary PBL — community record for the ages.",
        essentialQuestion:
          "How can our community tell its story to the world in a way that includes every voice?",
        gradeLevel: "6-8",
        href: "/golden-record.html",
        builtin: true,
      },
    ];
  }
}

function formatDraftDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

function formatGradeLabel(gradeLevel) {
  const g = String(gradeLevel || "").trim();
  const map = { "6-8": "Grades 6–8", HS: "High school", "Uni+": "Uni+" };
  return map[g] || g;
}

function projectCardSubtitle(row) {
  if (row.isDraft) {
    const when = formatDraftDate(row.updatedAt);
    const phase = row.subtitle;
    if (phase && when) return `${phase} · Saved ${when}`;
    if (phase) return phase;
    if (when) return `Saved ${when}`;
    return "Continue editing";
  }
  return row.subtitle || "";
}

function buildProjectCardInnerHtml(row) {
  const displayTitle = row.isDraft
    ? `${row.title || "Untitled draft"} (DRAFT)`
    : row.title || (row.isDraft ? "Untitled draft" : "Untitled council");
  const grade = formatGradeLabel(row.gradeLevel);
  const subtitle = projectCardSubtitle(row);
  const eq = String(row.essentialQuestion || "").trim();
  const parts = [
    `<div class="project-list-card-top">`,
    `<span class="project-list-title">${escapeHtml(displayTitle)}</span>`,
    grade ? `<span class="project-list-grade">${escapeHtml(grade)}</span>` : "",
    `</div>`,
  ];
  if (subtitle) parts.push(`<span class="project-list-desc">${escapeHtml(subtitle)}</span>`);
  if (eq) parts.push(`<span class="project-list-essential">${escapeHtml(eq)}</span>`);
  if (row.badge) parts.push(`<span class="project-list-badge">${escapeHtml(row.badge)}</span>`);
  return parts.join("");
}

function appendProjectListRow(list, row, cardBgUrl) {
  const li = document.createElement("li");
  li.className = "project-list-item";
  const rowWrap = document.createElement("div");
  rowWrap.className = "project-list-row";
  const a = document.createElement("a");
  a.className = "project-list-link" + (row.isDraft ? " project-list-link--draft" : "");
  a.href = row.href;
  if (cardBgUrl) {
    a.style.setProperty("--card-bg-image", `url("${cardBgUrl}")`);
  }
  a.innerHTML = buildProjectCardInnerHtml(row);
  const labelTitle = row.title || (row.isDraft ? "Untitled draft" : "Untitled council");
  const actions = document.createElement("div");
  actions.className = "project-list-card-actions";

  if (row.isDraft) {
    actions.appendChild(createTeacherMenuRowButton({ kind: "draft", id: row.id }));
  } else if (row.builtin) {
    attachShareIconButton(actions, {
      labelTitle,
      getUrl: () => new URL(row.href || "/golden-record.html", window.location.origin).href,
    });
  } else {
    actions.appendChild(createTeacherMenuRowButton({ kind: "saved", id: row.id }));
    attachShareIconButton(actions, {
      labelTitle,
      getUrl: () => councilShareUrl(row.id),
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "project-list-icon-btn project-list-icon-delete";
    del.setAttribute("aria-label", `Delete ${labelTitle}`);
    del.innerHTML = ICON_TRASH_SVG;
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(`Delete "${labelTitle}" from your saved councils? This cannot be undone.`)) return;
      deleteSavedCouncilById(row.id);
      render();
    });
    actions.appendChild(del);
  }

  rowWrap.appendChild(a);
  rowWrap.appendChild(actions);
  li.appendChild(rowWrap);
  list.appendChild(li);
}

function renderDraftList() {
  /* Drafts are listed in render() under Your councils. */
}

function render() {
  const list = document.getElementById("projectList");
  const empty = document.getElementById("homeEmpty");
  if (!list) return;

  const saved = loadSaved();
  const drafts = loadDrafts().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  loadBuiltin().then((projects) => {
    const builtins = (projects || []).map((p) => ({
      id: p.id,
      title: p.title,
      subtitle: p.description || "",
      essentialQuestion: p.essentialQuestion || "",
      gradeLevel: p.gradeLevel || "6-8",
      href: p.href || "/golden-record.html",
      builtin: true,
      badge: "Built-in",
      updatedAt: "9999-12-31",
      isDraft: false,
    }));

    const draftRows = drafts.map((d) => {
      const snap = d.snapshot || {};
      const phases = Array.isArray(snap.phases) ? snap.phases : [];
      const firstPhase = phases.find((p) => (p?.title || "").trim()) || phases[0];
      return {
        id: d.id,
        title: d.title || "Untitled draft",
        subtitle: (firstPhase?.title || "").trim(),
        essentialQuestion: snap.essentialQuestion || "",
        gradeLevel: snap.gradeLevel || "",
        href: `/create.html?draft=${encodeURIComponent(d.id)}`,
        updatedAt: d.updatedAt,
        isDraft: true,
        builtin: false,
        badge: "",
      };
    });

    const savedRows = saved.map((s) => ({
      id: s.id,
      title: s.title || "Untitled council",
      subtitle: s.description || s.config?.phases?.[0]?.title || "",
      essentialQuestion: s.config?.essentialQuestion || "",
      gradeLevel: s.config?.gradeLevel || "",
      href: `/council.html?saved=${encodeURIComponent(s.id)}`,
      updatedAt: s.updatedAt || "",
      isDraft: false,
      builtin: false,
      badge: "",
    }));

    const merged = [...draftRows, ...savedRows].sort(
      (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
    );
    const rows = [...builtins, ...merged];

    list.innerHTML = "";
    if (rows.length === 0) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    const cardBgs = pickCardBackgroundUrls(rows.length);
    rows.forEach((row, i) => appendProjectListRow(list, row, cardBgs[i]));
  });
}

function escapeHtml(s) {
  if (s == null) return "";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/** @typedef {{ kind: "draft"|"saved", id: string }} HomeTeacherTarget */

/** @type {HomeTeacherTarget | null} */
let homeTeacherMenuTarget = null;

function createTeacherMenuRowButton(target) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "project-list-icon-btn project-list-icon-teacher";
  btn.setAttribute("aria-label", "Teacher menu");
  btn.title = "Teacher menu";
  btn.innerHTML =
    '<span class="teacher-menu-bars-sm" aria-hidden="true"><span></span><span></span><span></span></span>';
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    homeTeacherMenuTarget = target;
    const modal = document.getElementById("teacherMenuModal");
    if (modal) modal.hidden = false;
  });
  return btn;
}

function closeHomeTeacherMenu() {
  const m = document.getElementById("teacherMenuModal");
  if (m) m.hidden = true;
}

function closeHomePreLaunchModal() {
  const m = document.getElementById("preLaunchModal");
  if (m) m.hidden = true;
}

function getPreLaunchReflectionForHomeTarget(target) {
  if (!target?.kind || !target.id) return null;
  if (target.kind === "draft") {
    const d = loadDrafts().find((x) => x.id === target.id);
    return d?.snapshot?.preLaunchReflection || null;
  }
  if (target.kind === "saved") {
    const s = loadSaved().find((x) => x.id === target.id);
    return s?.config?.preLaunchReflection || null;
  }
  return null;
}

function fillHomePreLaunchModal(doc) {
  const meta = document.getElementById("preLaunchMeta");
  const body = document.getElementById("preLaunchBody");
  const launchBtn = document.getElementById("preLaunchLaunchCouncilBtn");
  const hint = document.getElementById("preLaunchLaunchHint");
  if (launchBtn) launchBtn.hidden = true;
  if (hint) hint.hidden = true;
  if (!doc?.sections?.length) {
    const kind = homeTeacherMenuTarget?.kind === "draft" ? "draft" : "council";
    if (meta) meta.textContent = "";
    if (body) {
      body.innerHTML = `<p class="prelaunch-empty">No Teacher Pre-Launch Reflection is stored yet for this ${kind}. Open it in the editor, enable <strong>Teacher Pre-Launch Reflection</strong> in project settings, then save or launch to generate prompts.</p>`;
    }
    return;
  }
  if (meta) {
    const srcLabel =
      doc.source === "extracted"
        ? "Prompts pulled from your planning uploads where matching sections were found."
        : "Prompts adapted for your project (PBLWorks-style reflection pillars).";
    meta.textContent = `${doc.projectTitleSnapshot || "Project"} · ${srcLabel}`;
  }
  if (body && Array.isArray(doc.sections)) {
    body.innerHTML = doc.sections
      .map((sec) => {
        const qs = (sec.questions || [])
          .map((q) => `<li>${escapeHtml(q)}</li>`)
          .join("");
        return `<section class="prelaunch-section"><h3 class="prelaunch-heading">${escapeHtml(sec.heading)}</h3><ol class="prelaunch-questions">${qs}</ol></section>`;
      })
      .join("");
  }
}

function openHomeTeacherPreLaunch() {
  closeHomeTeacherMenu();
  const doc = homeTeacherMenuTarget ? getPreLaunchReflectionForHomeTarget(homeTeacherMenuTarget) : null;
  fillHomePreLaunchModal(doc);
  const pl = document.getElementById("preLaunchModal");
  if (pl) pl.hidden = false;
}

function downloadHomePreLaunchPdf() {
  const docPayload = homeTeacherMenuTarget ? getPreLaunchReflectionForHomeTarget(homeTeacherMenuTarget) : null;
  if (!docPayload?.sections?.length) return;
  const JsPdfCtor = window.jspdf?.jsPDF;
  if (typeof JsPdfCtor !== "function") {
    window.alert("PDF export library did not load. Check your connection and refresh the page.");
    return;
  }
  const doc = new JsPdfCtor({ unit: "pt", format: "letter" });
  const margin = 52;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  let y = margin;
  const lineStep = 14;
  const titleStr = docPayload.projectTitleSnapshot || "Teacher Pre-Launch Reflection";

  function ensureSpace(h) {
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  doc.setFontSize(18);
  doc.setFont(undefined, "bold");
  ensureSpace(24);
  doc.text("Teacher Pre-Launch Reflection", margin, y);
  y += 28;

  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  const metaLines = doc.splitTextToSize(titleStr, maxW);
  metaLines.forEach((ln) => {
    ensureSpace(lineStep);
    doc.text(ln, margin, y);
    y += lineStep;
  });
  y += 12;

  for (const sec of docPayload.sections) {
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    const headLines = doc.splitTextToSize(sec.heading || "", maxW);
    headLines.forEach((ln) => {
      ensureSpace(lineStep + 2);
      doc.text(ln, margin, y);
      y += lineStep + 2;
    });
    y += 6;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const qs = Array.isArray(sec.questions) ? sec.questions : [];
    qs.forEach((q, qi) => {
      const bullet = `${qi + 1}. ${String(q || "").trim()}`;
      const wrapped = doc.splitTextToSize(bullet, maxW - 14);
      wrapped.forEach((ln, li) => {
        ensureSpace(lineStep);
        doc.text(ln, margin + (li === 0 ? 0 : 12), y);
        y += lineStep;
      });
      y += 4;
    });
    y += 10;
  }

  const safeName = (titleStr || "reflection").replace(/[^\w\-]+/g, "_").slice(0, 80);
  doc.save(`${safeName}_pre_launch_reflection.pdf`);
}

function initHomeTeacherModals() {
  document.getElementById("teacherMenuModal")?.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-tm]")) closeHomeTeacherMenu();
  });
  document.getElementById("teacherMenuShareBtn")?.addEventListener("click", async () => {
    const t = homeTeacherMenuTarget;
    if (!t?.id) return;
    let url = "";
    if (t.kind === "saved") url = councilShareUrl(t.id);
    else if (t.kind === "draft") url = draftEditShareUrl(t.id);
    if (!url) return;
    const ok = await copyTextToClipboard(url);
    closeHomeTeacherMenu();
    if (!ok) {
      window.alert("Could not copy automatically. Open this council and copy the URL from the address bar.");
    }
  });
  document.getElementById("teacherMenuPreLaunchBtn")?.addEventListener("click", () => openHomeTeacherPreLaunch());
  document.getElementById("preLaunchModal")?.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-pl]")) closeHomePreLaunchModal();
  });
  document.getElementById("preLaunchDownloadPdf")?.addEventListener("click", () => downloadHomePreLaunchPdf());
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const pl = document.getElementById("preLaunchModal");
    const tm = document.getElementById("teacherMenuModal");
    if (pl && !pl.hidden) {
      closeHomePreLaunchModal();
      return;
    }
    if (tm && !tm.hidden) closeHomeTeacherMenu();
  });
}

initHomeTeacherModals();

function initHomeSplashEntrance() {
  let fromSplash = false;
  try {
    fromSplash = sessionStorage.getItem("konsultFromSplash") === "1";
    if (fromSplash) sessionStorage.removeItem("konsultFromSplash");
  } catch {
    /* ignore */
  }
  if (!fromSplash) return;

  const entrance = document.getElementById("homeEntrance");
  const img = entrance?.querySelector(".home-entrance-composite");
  if (!entrance || !img) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.body.classList.add("home-from-splash");
  entrance.hidden = false;
  entrance.setAttribute("aria-hidden", "false");
  entrance.classList.add("home-entrance--crossfade", "home-entrance--visible");

  const finishEntrance = () => {
    if (entrance.hidden) return;
    entrance.classList.add("home-entrance--cleared");
    entrance.hidden = true;
    entrance.setAttribute("aria-hidden", "true");
    document.body.classList.remove("home-from-splash");
    document.body.classList.add("home-entrance-done");
    window.setTimeout(() => {
      entrance.classList.remove("home-entrance--visible", "home-entrance--exit", "home-entrance--cleared", "home-entrance--crossfade");
    }, 50);
  };

  if (reducedMotion) {
    finishEntrance();
    return;
  }

  const crossfadeMs = 1350;
  const holdMs = 3000;
  const slideMs = 2000;

  img.addEventListener(
    "animationend",
    (e) => {
      if (e.animationName !== "home-entrance-slide-down") return;
      finishEntrance();
    },
    { once: true }
  );

  window.setTimeout(() => {
    entrance.classList.add("home-entrance--exit");
  }, crossfadeMs + holdMs);

  window.setTimeout(finishEntrance, crossfadeMs + holdMs + slideMs + 120);
}

initHomeSplashEntrance();
render();
