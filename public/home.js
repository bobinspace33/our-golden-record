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
      li.appendChild(a);
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
