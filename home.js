const STORAGE_KEY = "aiCouncilSavedProjects";
const DRAFT_STORAGE_KEY = "aiCouncilTemplateDrafts";

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

async function copyCouncilShareLink(savedId) {
  const text = councilShareUrl(savedId);
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

function renderDraftList() {
  const list = document.getElementById("draftList");
  const empty = document.getElementById("draftEmpty");
  if (!list) return;
  const drafts = loadDrafts().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  list.innerHTML = "";
  if (drafts.length === 0) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  drafts.forEach((d) => {
    const li = document.createElement("li");
    li.className = "project-list-item";
    const rowWrap = document.createElement("div");
    rowWrap.className = "project-list-row";
    const a = document.createElement("a");
    a.className = "project-list-link";
    a.href = `/create.html?draft=${encodeURIComponent(d.id)}`;
    const when = formatDraftDate(d.updatedAt);
    a.innerHTML = `
      <span class="project-list-title">${escapeHtml(d.title || "Untitled draft")}</span>
      <span class="project-list-desc">${when ? `Saved ${escapeHtml(when)}` : "Continue editing"}</span>
      <span class="project-list-badge">Draft</span>
    `;
    const actions = document.createElement("div");
    actions.className = "project-list-card-actions";
    actions.appendChild(createTeacherMenuRowButton({ kind: "draft", id: d.id }));
    rowWrap.appendChild(a);
    rowWrap.appendChild(actions);
    li.appendChild(rowWrap);
    list.appendChild(li);
  });
}

function render() {
  const list = document.getElementById("projectList");
  const empty = document.getElementById("homeEmpty");
  if (!list) return;

  renderDraftList();

  const saved = loadSaved();
  const builtins = [];

  loadBuiltin().then((projects) => {
    projects.forEach((p) => {
      builtins.push({
        id: p.id,
        title: p.title,
        description: p.description || "",
        href: p.href || "/golden-record.html",
        builtin: true,
      });
    });

    list.innerHTML = "";
    const rows = [...builtins, ...saved.map((s) => ({ ...s, builtin: false }))];

    if (rows.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    rows.forEach((row) => {
      const li = document.createElement("li");
      li.className = "project-list-item";
      const a = document.createElement("a");
      a.className = "project-list-link";
      a.href = row.builtin ? row.href : `/council.html?saved=${encodeURIComponent(row.id)}`;
      a.innerHTML = `
        <span class="project-list-title">${escapeHtml(row.title || "Untitled council")}</span>
        ${row.description ? `<span class="project-list-desc">${escapeHtml(row.description)}</span>` : ""}
        ${row.builtin ? `<span class="project-list-badge">Built-in</span>` : ""}
      `;
      if (row.builtin) {
        li.appendChild(a);
      } else {
        const rowWrap = document.createElement("div");
        rowWrap.className = "project-list-row";
        const labelTitle = row.title || "Untitled council";
        const actions = document.createElement("div");
        actions.className = "project-list-card-actions";

        actions.appendChild(createTeacherMenuRowButton({ kind: "saved", id: row.id }));

        const share = document.createElement("button");
        share.type = "button";
        share.className = "project-list-icon-btn project-list-icon-share";
        share.setAttribute("aria-label", `Copy link to ${labelTitle}`);
        share.title = "Copy link to this council";
        share.innerHTML = ICON_SHARE_SVG;
        share.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const ok = await copyCouncilShareLink(row.id);
          if (ok) {
            share.title = "Link copied!";
            setTimeout(() => {
              share.title = "Copy link to this council";
            }, 2000);
          } else {
            share.title = "Could not copy — select URL from address bar after opening the council.";
            setTimeout(() => {
              share.title = "Copy link to this council";
            }, 3500);
          }
        });

        const del = document.createElement("button");
        del.type = "button";
        del.className = "project-list-icon-btn project-list-icon-delete";
        del.setAttribute("aria-label", `Delete ${labelTitle}`);
        del.innerHTML = ICON_TRASH_SVG;
        del.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (
            !confirm(
              `Delete "${labelTitle}" from your saved councils? This cannot be undone.`
            )
          ) {
            return;
          }
          deleteSavedCouncilById(row.id);
          render();
        });

        actions.appendChild(share);
        actions.appendChild(del);
        rowWrap.appendChild(a);
        rowWrap.appendChild(actions);
        li.appendChild(rowWrap);
      }
      list.appendChild(li);
    });
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
render();
