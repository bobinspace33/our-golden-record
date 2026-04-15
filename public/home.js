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
    const a = document.createElement("a");
    a.className = "project-list-link";
    a.href = `/create.html?draft=${encodeURIComponent(d.id)}`;
    const when = formatDraftDate(d.updatedAt);
    a.innerHTML = `
      <span class="project-list-title">${escapeHtml(d.title || "Untitled draft")}</span>
      <span class="project-list-desc">${when ? `Saved ${escapeHtml(when)}` : "Continue editing"}</span>
      <span class="project-list-badge">Draft</span>
    `;
    li.appendChild(a);
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

        actions.appendChild(del);
        actions.appendChild(share);
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

render();
