const gemsGrid = document.getElementById("gemsGrid");
const selectionHint = document.getElementById("selectionHint");
const promptInput = document.getElementById("promptInput");
const submitBtn = document.getElementById("submitBtn");
const resultsSection = document.getElementById("resultsSection");
const resultsList = document.getElementById("resultsList");
const statusEl = document.getElementById("status");
const recentChatsBtn = document.getElementById("recentChatsBtn");
const recentChatsDropdown = document.getElementById("recentChatsDropdown");
const recentChatsList = document.getElementById("recentChatsList");
const recentChatsEmpty = document.getElementById("recentChatsEmpty");
const sendToOverlay = document.getElementById("sendToOverlay");
const sendToOverlayBackdrop = document.getElementById("sendToOverlayBackdrop");
const sendToList = document.getElementById("sendToList");
const sendToCancel = document.getElementById("sendToCancel");
const sendToConfirm = document.getElementById("sendToConfirm");
const councilLoading = document.getElementById("councilLoading");
const councilLoadingMessage = document.getElementById("councilLoadingMessage");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const phaseMilestoneTitle = document.getElementById("phaseMilestoneTitle");
const phaseMilestoneBannerText = document.getElementById("phaseMilestoneBannerText");
const viewRubricCouncilBtn = document.getElementById("viewRubricCouncilBtn");
const attachmentsList = document.getElementById("attachmentsList");
const responsesOverlay = document.getElementById("responsesOverlay");
const responsesOverlayBackdrop = document.getElementById("responsesOverlayBackdrop");
const responsesOverlayClose = document.getElementById("responsesOverlayClose");
const responsesOverlayGrid = document.getElementById("responsesOverlayGrid");
const returnToResponseBtn = document.getElementById("returnToResponseBtn");
const followUpPromptBox = document.getElementById("followUpPromptBox");
const followUpInput = document.getElementById("followUpInput");
const followUpCancel = document.getElementById("followUpCancel");
const followUpSend = document.getElementById("followUpSend");

let currentFollowUp = null;

const MEMBER_COLORS = {
  1: { border: "#E02465", bg: "rgba(224, 36, 101, 0.95)", fg: "#fff", card: "rgba(20, 8, 12, 0.98)" },
  2: { border: "#24BAE0", bg: "rgba(36, 186, 224, 0.95)", fg: "#0a1216", card: "rgba(8, 18, 24, 0.98)" },
  3: { border: "#E0CF23", bg: "rgba(224, 207, 35, 0.95)", fg: "#1a1808", card: "rgba(22, 20, 8, 0.98)" },
  4: { border: "#9045B0", bg: "rgba(144, 69, 176, 0.95)", fg: "#fff", card: "rgba(18, 8, 22, 0.98)" },
  5: { border: "#E07844", bg: "rgba(224, 120, 68, 0.95)", fg: "#1a0f0a", card: "rgba(24, 12, 8, 0.98)" },
};
const WORDS_PER_MINUTE = 170;
const MS_PER_WORD = (60 * 1000) / WORDS_PER_MINUTE;
const LETTER_DELAY_MS = 20;
const SENTENCE_END_PAUSE_MS = 2000;
const LINE_BREAK_PAUSE_MS = 2000;

const COUNCIL_LOADING_PHRASES = [
  "Council members are thinking…",
  "Consulting the documents…",
  "Organizing their thoughts…",
  "Discussing your question…",
  "Preparing their responses…",
  "Considering different perspectives…",
  "Gathering insights from the Golden Record…",
  "Weighing multiple viewpoints…",
  "Refining their answers…",
  "Almost there…",
];

const COUNCIL_LOADING_STEPS = [
  "Connecting…",
  "Loading context…",
  "Consulting members…",
  "Processing question…",
  "Synthesizing perspectives…",
  "Drafting responses…",
  "Reviewing criteria…",
  "Finalizing…",
];

let councilLoadingInterval = null;
let councilLoadingProgressInterval = null;

function startCouncilLoading() {
  const bar = document.getElementById("councilLoadingBar");
  const stepEl = document.getElementById("councilLoadingStep");
  if (!councilLoading || !councilLoadingMessage) return;
  councilLoading.hidden = false;
  if (bar) {
    bar.style.width = "0%";
    bar.ownerDocument.querySelector(".council-loading-overlay [role=progressbar]")?.setAttribute("aria-valuenow", 0);
  }
  if (stepEl) stepEl.textContent = COUNCIL_LOADING_STEPS[0] || "";
  let i = 0;
  councilLoadingMessage.textContent = COUNCIL_LOADING_PHRASES[0];
  councilLoadingInterval = setInterval(() => {
    i = (i + 1) % COUNCIL_LOADING_PHRASES.length;
    councilLoadingMessage.textContent = COUNCIL_LOADING_PHRASES[i];
  }, 2200);
  let progress = 0;
  let stepIndex = 0;
  const progressRole = councilLoading?.querySelector("[role=progressbar]");
  councilLoadingProgressInterval = setInterval(() => {
    progress = Math.min(progress + 8 + Math.floor(Math.random() * 5), 92);
    stepIndex = Math.min(
      Math.floor((progress / 100) * COUNCIL_LOADING_STEPS.length),
      COUNCIL_LOADING_STEPS.length - 1
    );
    if (bar) bar.style.width = progress + "%";
    if (progressRole) progressRole.setAttribute("aria-valuenow", progress);
    if (stepEl) stepEl.textContent = COUNCIL_LOADING_STEPS[stepIndex] || "";
  }, 900);
}

function stopCouncilLoading() {
  if (councilLoadingInterval) {
    clearInterval(councilLoadingInterval);
    councilLoadingInterval = null;
  }
  if (councilLoadingProgressInterval) {
    clearInterval(councilLoadingProgressInterval);
    councilLoadingProgressInterval = null;
  }
  const bar = document.getElementById("councilLoadingBar");
  const progressRole = councilLoading?.querySelector("[role=progressbar]");
  if (bar) {
    bar.style.width = "100%";
    if (progressRole) progressRole.setAttribute("aria-valuenow", 100);
  }
  const stepEl = document.getElementById("councilLoadingStep");
  if (stepEl) stepEl.textContent = COUNCIL_LOADING_STEPS[COUNCIL_LOADING_STEPS.length - 1] || "Done.";
  setTimeout(() => {
    if (councilLoading) councilLoading.hidden = true;
  }, 280);
}

let gems = [];
let selectedIds = new Set();
let lastPrompt = "";
let lastSelectedGems = [];
let lastResults = [];
let sendToSource = null; // { gemId, name, response } when overlay is open
let sendToSelectedIds = new Set();
let attachments = []; // { name, mimeType, data (base64) }

const APP_KIND = document.body.dataset.app || "golden-record";

/** Set to `true` after QC — enables View/Create Rubric on the council page (must match create-council.js). */
const RUBRIC_CREATION_ENABLED = false;
let customCouncilProject = null;

const HUMAN_ADVISOR_SYSTEM_INSTRUCTION =
  "Human community advisor. This slot is filled by a real-world contact in the educator's region. Encourage students to connect professionally and verify contact details before outreach.";

let replaceHumanGemId = null;
let replaceHumanPendingImage = null;
/** Dedupe keys (`name | org`) for experts shown this modal session; each Search excludes these plus member.excludedLocalExperts. */
let replaceHumanSearchSessionExcluded = [];

function resetReplaceHumanSearchSession() {
  replaceHumanSearchSessionExcluded = [];
}

function normalizeLocalExpertResponse(j) {
  if (!j || typeof j !== "object") {
    return { name: "", organization: "", title: "", contact: "", imageUrl: "", regionHint: "" };
  }
  return {
    name: String(j.name || j.displayName || "").trim(),
    organization: String(j.organization || "").trim(),
    title: String(j.title || j.subtitle || "").trim(),
    contact: String(j.contact || "").trim(),
    imageUrl: String(j.imageUrl || "").trim(),
    regionHint: String(j.regionHint || "").trim(),
  };
}

function localExpertDedupeKey(expert) {
  const n = normalizeLocalExpertResponse(expert);
  const nameT = n.name;
  const orgT = n.organization;
  if (!nameT && !orgT) return "";
  return [nameT, orgT].filter(Boolean).join(" | ");
}

function splitContactIntoFields(contact) {
  const s = String(contact || "").trim();
  let email = "";
  const em = s.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (em) email = em[0];
  const urls = [];
  for (const m of s.matchAll(/https?:\/\/[^\s\],)>'"]+/gi)) {
    const u = m[0].replace(/[.,;:)\]}>'"]+$/, "");
    if (u) urls.push(u);
  }
  const website = urls[0] || "";
  let remainder = s;
  if (email) remainder = remainder.replace(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
  if (website) remainder = remainder.split(website).join("");
  remainder = remainder.replace(/\s+/g, " ").replace(/[|,;]+/g, " ").trim();
  const phoneRe = /(\+?\d[\d\s().\-/]{7,}\d|\(\d{3}\)\s*\d{3}[-.\s]?\d{4})/;
  const pm = remainder.match(phoneRe);
  const phone = pm ? pm[0].trim() : "";
  return { email, website, phone };
}

function pickLocalExpertImageForForm(data, displayName) {
  const raw = String(data.imageUrl || "").trim();
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  return uiAvatarFallbackSrc(displayName);
}

async function runReplaceHumanLocalSearch() {
  const btn = document.getElementById("replaceHumanSearchBtn");
  const gidAtStart = replaceHumanGemId;
  if (APP_KIND !== "custom" || !customCouncilProject || gidAtStart == null) {
    setStatus("Search is only available for your project council.", "error");
    return;
  }
  const mm = getCustomMember(gidAtStart);
  if (!mm) {
    setStatus("Could not find that council seat.", "error");
    return;
  }
  if (btn) btn.disabled = true;
  setStatus("Searching for a contact…", "");
  try {
    const projectTitle = String(customCouncilProject.projectTitle || "").trim();
    const projectSummary = String(customCouncilProject.projectSummary || "").trim();
    const essentialQuestion = String(customCouncilProject.essentialQuestion || "").trim();
    const gem = gems.find((g) => Number(g.id) === Number(gidAtStart));
    const roleTitle = String(gem?.jobTitle || mm.jobTitle || "Advisor").trim() || "Advisor";
    const persisted = Array.isArray(mm.excludedLocalExperts) ? mm.excludedLocalExperts : [];
    const excludeExperts = [
      ...new Set(
        [...persisted, ...replaceHumanSearchSessionExcluded]
          .map((x) => String(x || "").trim())
          .filter(Boolean)
      ),
    ];
    const res = await fetch("/api/creator/local-expert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectTitle,
        projectSummary,
        essentialQuestion,
        roleTitle,
        excludeExperts,
      }),
    });
    const raw = await res.json();
    if (!res.ok) throw new Error(raw.error || "Request failed");
    const data = normalizeLocalExpertResponse(raw);
    if (!data.name) throw new Error("Could not parse expert.");
    if (Number(replaceHumanGemId) !== Number(gidAtStart)) return;
    const key = localExpertDedupeKey(data);
    if (key && !replaceHumanSearchSessionExcluded.includes(key)) {
      replaceHumanSearchSessionExcluded.push(key);
    }
    const displayName = data.name;
    const split = splitContactIntoFields(data.contact);
    const nameEl = document.getElementById("rhName");
    const titleEl = document.getElementById("rhTitle");
    const orgEl = document.getElementById("rhOrganization");
    const emailEl = document.getElementById("rhEmail");
    const phoneEl = document.getElementById("rhPhone");
    const webEl = document.getElementById("rhWebsite");
    const urlEl = document.getElementById("rhProfileUrl");
    if (nameEl) nameEl.value = displayName;
    if (titleEl) titleEl.value = data.title || "";
    if (orgEl) orgEl.value = data.organization || "";
    if (emailEl) emailEl.value = split.email || "";
    if (phoneEl) phoneEl.value = split.phone || "";
    if (webEl) webEl.value = split.website || "";
    replaceHumanPendingImage = null;
    const imgUrl = pickLocalExpertImageForForm(data, displayName);
    if (urlEl) urlEl.value = /^https?:\/\//i.test(imgUrl) ? imgUrl : "";
    updateReplaceHumanProfilePreview(imgUrl);
    setStatus("Form filled from search—verify details before outreach.", "success");
  } catch (e) {
    setStatus(e.message || String(e), "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function gemThumbSrc(image) {
  if (!image) return "";
  const s = String(image).trim();
  if (/^https?:\/\//i.test(s) || s.startsWith("//") || s.startsWith("data:")) return s;
  if (s.startsWith("/")) return s;
  return "/" + s;
}

/** Initials avatar when remote portraits fail (invalid model URLs, Pollinations hiccups, etc.). */
function uiAvatarFallbackSrc(name) {
  const label = encodeURIComponent((name || "?").slice(0, 42));
  return `https://ui-avatars.com/api/?name=${label}&size=256&background=1e3a5f&color=fff`;
}

/**
 * If profile image fails to load, swap to a reliable initials avatar.
 * For custom councils, persist the working URL so reloads stay fixed.
 */
function bindGemAvatarFallback(img, displayName, gemId) {
  if (!img) return;
  img.addEventListener("error", () => {
    if (img.dataset.avatarFallbackApplied === "1") return;
    img.dataset.avatarFallbackApplied = "1";
    const fb = uiAvatarFallbackSrc(displayName);
    img.removeAttribute("srcset");
    img.src = fb;
    if (
      APP_KIND === "custom" &&
      gemId != null &&
      customCouncilProject?.members?.length
    ) {
      const mm = customCouncilProject.members.find((m) => Number(m.id) === Number(gemId));
      if (mm && mm.image !== fb) {
        mm.image = fb;
        persistCustomCouncil();
      }
      const g = gems.find((x) => Number(x.id) === Number(gemId));
      if (g) g.image = fb;
    }
  });
}

function chatPayload(body) {
  if (APP_KIND === "custom" && customCouncilProject) {
    return { ...body, councilProject: customCouncilProject };
  }
  return body;
}

function getCustomMember(gemId) {
  return customCouncilProject?.members?.find((m) => Number(m.id) === Number(gemId));
}

function persistCustomCouncil() {
  if (APP_KIND === "custom" && customCouncilProject) {
    try {
      sessionStorage.setItem("aiCouncilActiveProject", JSON.stringify(customCouncilProject));
    } catch {
      /* ignore */
    }
  }
}

function persistRubricsToSavedProjectInLocalStorage() {
  const params = new URLSearchParams(window.location.search);
  const savedId = params.get("saved");
  if (!savedId || !customCouncilProject) return;
  try {
    const raw = localStorage.getItem("aiCouncilSavedProjects");
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return;
    const i = list.findIndex((x) => x.id === savedId);
    if (i === -1 || !list[i].config) return;
    list[i].config.rubrics = customCouncilProject.rubrics;
    list[i].config.rubricsCacheKey = customCouncilProject.rubricsCacheKey;
    list[i].updatedAt = new Date().toISOString();
    localStorage.setItem("aiCouncilSavedProjects", JSON.stringify(list.slice(0, 20)));
  } catch {
    /* ignore */
  }
}

function persistFullProjectConfigToSaved() {
  const params = new URLSearchParams(window.location.search);
  const savedId = params.get("saved");
  if (!savedId || !customCouncilProject) return;
  try {
    const raw = localStorage.getItem("aiCouncilSavedProjects");
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return;
    const i = list.findIndex((x) => x.id === savedId);
    if (i === -1) return;
    list[i].config = JSON.parse(JSON.stringify(customCouncilProject));
    list[i].updatedAt = new Date().toISOString();
    if (customCouncilProject.projectTitle) {
      list[i].title = customCouncilProject.projectTitle;
    }
    localStorage.setItem("aiCouncilSavedProjects", JSON.stringify(list.slice(0, 20)));
  } catch {
    /* ignore */
  }
}

function getCouncilCurrentPhaseIndex() {
  return Number(getProjectPhase()) - 1;
}

function getCurrentPhaseRubricRow() {
  const idx = getCouncilCurrentPhaseIndex();
  const rows = customCouncilProject?.rubrics;
  if (!Array.isArray(rows)) return null;
  return rows.find((r) => Number(r.phaseIndex) === idx) || null;
}

function hasRubricForCurrentPhase() {
  const row = getCurrentPhaseRubricRow();
  return !!(row && typeof row.studentTextFile === "string" && row.studentTextFile.trim().length >= 40);
}

function updateRubricCouncilButton() {
  if (!viewRubricCouncilBtn || APP_KIND !== "custom") return;
  if (!RUBRIC_CREATION_ENABLED) {
    viewRubricCouncilBtn.disabled = true;
    viewRubricCouncilBtn.setAttribute("aria-disabled", "true");
    viewRubricCouncilBtn.classList.add("phase-view-rubric-btn--disabled");
    viewRubricCouncilBtn.title = "Rubric tools are paused while we complete quality checks.";
    viewRubricCouncilBtn.textContent = "Rubrics";
    return;
  }
  viewRubricCouncilBtn.disabled = false;
  viewRubricCouncilBtn.removeAttribute("aria-disabled");
  viewRubricCouncilBtn.classList.remove("phase-view-rubric-btn--disabled");
  viewRubricCouncilBtn.title = "";
  viewRubricCouncilBtn.textContent = hasRubricForCurrentPhase() ? "View Rubric" : "Create Rubric";
}

let rubricEditSupportingStaging = [];

function renderRubricEditSupportingList() {
  const ul = document.getElementById("rubricEditSupportingList");
  if (!ul) return;
  ul.innerHTML = rubricEditSupportingStaging
    .map(
      (f, i) =>
        `<li><span>${escapeHtml(f.name)}</span><button type="button" class="rubric-edit-file-remove" data-rubric-sup-idx="${i}">Remove</button></li>`
    )
    .join("");
  ul.querySelectorAll("[data-rubric-sup-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      rubricEditSupportingStaging.splice(Number(btn.dataset.rubricSupIdx), 1);
      renderRubricEditSupportingList();
    });
  });
}

function populateRubricEditOverlay() {
  const p = customCouncilProject;
  if (!p) return;
  const eq = document.getElementById("rubricEditEssentialQuestion");
  const ob = document.getElementById("rubricEditObjectives");
  const wrap = document.getElementById("rubricEditPhases");
  if (eq) eq.value = p.essentialQuestion || "";
  const objs = Array.isArray(p.learningObjectives) ? p.learningObjectives : [];
  if (ob) ob.value = objs.join("\n");
  const phases = Array.isArray(p.phases) ? p.phases : [];
  if (wrap) {
    wrap.innerHTML = phases
      .map(
        (ph, i) => `
      <div class="rubric-edit-phase-row">
        <span class="rubric-edit-phase-num">${i + 1}</span>
        <div class="rubric-edit-phase-fields">
          <input type="text" data-rubric-phase-title="${i}" value="${escapeHtml(ph.title || "")}" placeholder="Phase title" />
          <input type="text" data-rubric-phase-desc="${i}" value="${escapeHtml(ph.description || "")}" placeholder="Description / deliverable" />
        </div>
      </div>`
      )
      .join("");
  }
  rubricEditSupportingStaging = JSON.parse(
    JSON.stringify(Array.isArray(p.supportingAttachments) ? p.supportingAttachments : [])
  );
  renderRubricEditSupportingList();
}

function collectRubricEditOverlayToProject() {
  const p = customCouncilProject;
  if (!p) return;
  const eq = document.getElementById("rubricEditEssentialQuestion");
  const ob = document.getElementById("rubricEditObjectives");
  if (eq) p.essentialQuestion = eq.value?.trim() || "";
  if (ob) {
    const lines = (ob.value || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    p.learningObjectives = lines.length ? lines : [];
  }
  const titleEls = document.querySelectorAll("#rubricEditPhases [data-rubric-phase-title]");
  const descEls = document.querySelectorAll("#rubricEditPhases [data-rubric-phase-desc]");
  const nextPhases = [];
  titleEls.forEach((inp, i) => {
    const d = descEls[i];
    nextPhases.push({
      title: inp?.value?.trim() || "",
      description: d?.value?.trim() || "",
    });
  });
  if (nextPhases.length) p.phases = nextPhases;
  p.supportingAttachments = rubricEditSupportingStaging.slice();
}

function normalizeCouncilMemberPhasesAfterPhaseCountChange() {
  const p = customCouncilProject;
  if (!p?.members?.length) return;
  const n = Array.isArray(p.phases) ? p.phases.length : 0;
  p.members.forEach((m) => {
    if (!Array.isArray(m.phasesEnabled)) m.phasesEnabled = [];
    while (m.phasesEnabled.length < n) m.phasesEnabled.push(true);
    if (m.phasesEnabled.length > n) m.phasesEnabled = m.phasesEnabled.slice(0, n);
  });
}

function refreshCouncilPhaseUIAfterProjectEdit() {
  buildPhaseSectionFromProject();
  syncPhaseMilestoneTitle();
  renderGems();
  setSubmitState();
}

function openRubricPreconfirmOverlay() {
  const el = document.getElementById("rubricPreconfirmOverlay");
  if (el) el.hidden = false;
}

function closeRubricPreconfirmOverlay() {
  const el = document.getElementById("rubricPreconfirmOverlay");
  if (el) el.hidden = true;
}

function openRubricEditOverlay() {
  const el = document.getElementById("rubricEditOverlay");
  if (el) el.hidden = false;
}

function closeRubricEditOverlay() {
  const el = document.getElementById("rubricEditOverlay");
  if (el) el.hidden = true;
}

async function openRubricChartInNewTabForRow(row) {
  if (!row?.studentTextFile) {
    throw new Error("No rubric content for this phase.");
  }
  const res = await fetch("/api/creator/rubric-chart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentTextFile: row.studentTextFile,
      projectTitle: customCouncilProject.projectTitle || "Project",
      phaseTitle: row.phaseTitle,
      isFinal: row.isFinal,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not generate rubric chart.");
  const payload = {
    title: `${customCouncilProject.projectTitle || "Project"} — ${row.phaseTitle}${row.isFinal ? " (Final product)" : ""}`,
    mimeType: data.mimeType || "image/png",
    imageBase64: data.imageBase64,
    textFallback: row.studentTextFile,
  };
  sessionStorage.setItem("aiCouncilRubricView", JSON.stringify(payload));
  window.open("/rubric-view.html", "_blank");
}

async function createRubricAndOpenForCurrentPhase() {
  delete customCouncilProject.rubrics;
  delete customCouncilProject.rubricsCacheKey;
  const rubrics = await ensureCouncilRubricsLoaded();
  const idx = getCouncilCurrentPhaseIndex();
  const row = rubrics.find((r) => Number(r.phaseIndex) === idx);
  if (!row) throw new Error("No rubric for this phase.");
  await openRubricChartInNewTabForRow(row);
  persistRubricsToSavedProjectInLocalStorage();
  updateRubricCouncilButton();
}

function councilRubricsCacheKey() {
  const p = customCouncilProject;
  if (!p) return "";
  const title = String(p.projectTitle || "").trim();
  const obj = (Array.isArray(p.learningObjectives) ? p.learningObjectives : [])
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join("|");
  const ph = (Array.isArray(p.phases) ? p.phases : [])
    .map((x) => `${String(x?.title || "").trim()}\t${String(x?.description || "").trim()}`)
    .join(";;");
  return [title, obj, ph].join(":::");
}

async function ensureCouncilRubricsLoaded() {
  const phases = customCouncilProject?.phases;
  if (!Array.isArray(phases) || !phases.length) {
    throw new Error("No phases on this project.");
  }
  const cacheKey = councilRubricsCacheKey();
  if (
    Array.isArray(customCouncilProject.rubrics) &&
    customCouncilProject.rubrics.length === phases.length &&
    customCouncilProject.rubricsCacheKey === cacheKey
  ) {
    return customCouncilProject.rubrics;
  }
  const res = await fetch("/api/creator/rubric-specs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectTitle: customCouncilProject.projectTitle || "",
      projectSummary: customCouncilProject.projectSummary || "",
      essentialQuestion: customCouncilProject.essentialQuestion || "",
      objectives: customCouncilProject.learningObjectives || [],
      learningObjectives: customCouncilProject.learningObjectives || [],
      phases,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not build rubrics.");
  if (!Array.isArray(data.rubrics) || !data.rubrics.length) {
    throw new Error("No rubrics returned from the server.");
  }
  customCouncilProject.rubrics = data.rubrics;
  customCouncilProject.rubricsCacheKey = cacheKey;
  persistCustomCouncil();
  persistRubricsToSavedProjectInLocalStorage();
  return customCouncilProject.rubrics;
}

function loadSavedProjectIntoSession(savedId) {
  if (!savedId) return;
  try {
    const raw = localStorage.getItem("aiCouncilSavedProjects");
    const list = raw ? JSON.parse(raw) : [];
    const item = Array.isArray(list) ? list.find((x) => x.id === savedId) : null;
    if (item?.config) {
      sessionStorage.setItem("aiCouncilActiveProject", JSON.stringify(item.config));
    }
  } catch {
    /* ignore */
  }
}

function buildPhaseSectionFromProject() {
  const optionsEl = document.querySelector(".phase-options");
  if (!optionsEl || !customCouncilProject?.phases?.length) return;
  const phases = customCouncilProject.phases;
  optionsEl.innerHTML = phases
    .map(
      (_, i) =>
        `<label class="phase-option"><input type="radio" name="projectPhase" value="${i + 1}" ${i === 0 ? "checked" : ""} /> ${i + 1}</label>`
    )
    .join("");
  document.querySelectorAll('input[name="projectPhase"]').forEach((radio) => {
    radio.addEventListener("change", onPhaseChange);
  });
  const briefLink = document.getElementById("customProjectBriefLink");
  const att = customCouncilProject.briefAttachment;
  if (briefLink && att?.data) {
    briefLink.href = `data:${att.mimeType || "application/pdf"};base64,${att.data}`;
    briefLink.download = att.name || "project-brief.pdf";
    briefLink.target = "_blank";
    briefLink.rel = "noopener noreferrer";
    briefLink.hidden = false;
  }
  updateRubricCouncilButton();
}

// Phase 1: Jane only. 2: Jane, Carl, Henrietta. 3: + Wolfgang. 4: all.
function getEnabledMemberIds(phase) {
  if (APP_KIND === "custom" && customCouncilProject?.members?.length) {
    const idx = Number(phase) - 1;
    const enabled = new Set();
    customCouncilProject.members.forEach((m) => {
      const pe = Array.isArray(m.phasesEnabled) ? m.phasesEnabled : [];
      if (idx < 0 || idx >= pe.length) {
        enabled.add(m.id);
        return;
      }
      if (pe[idx]) enabled.add(m.id);
    });
    return enabled;
  }
  const map = {
    1: [2],
    2: [2, 5, 1],
    3: [2, 5, 1, 4],
    4: [2, 5, 1, 4, 3],
  };
  return new Set(map[Number(phase)] || map[4]);
}

function getProjectPhase() {
  const r = document.querySelector('input[name="projectPhase"]:checked');
  return r ? r.value : "1";
}

const PHASE_MILESTONE_LABELS = {
  1: "Community Charter",
  2: "Artifact Curation",
  3: "Logistics Audit",
  4: "Golden Record Premiere",
};

function syncPhaseMilestoneTitle() {
  if (!phaseMilestoneTitle && !phaseMilestoneBannerText) return;
  const phase = getProjectPhase();
  let text = "";
  if (APP_KIND === "custom" && customCouncilProject && Array.isArray(customCouncilProject.phases)) {
    const idx = Number(phase) - 1;
    const p = customCouncilProject.phases[idx];
    if (p) {
      const desc = String(p.description || "").trim();
      const tit = String(p.title || "").trim();
      text = desc || tit || "—";
    } else {
      text = "—";
    }
  } else {
    text = PHASE_MILESTONE_LABELS[phase] || PHASE_MILESTONE_LABELS[1];
  }
  if (phaseMilestoneTitle) phaseMilestoneTitle.textContent = text;
  if (phaseMilestoneBannerText) phaseMilestoneBannerText.textContent = text;
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = "status " + type;
}

function setSubmitState() {
  const hasSelection = selectedIds.size > 0;
  const hasPrompt = promptInput.value.trim().length > 0;
  const hasAttachments = attachments.length > 0;
  submitBtn.disabled = !hasSelection || (!hasPrompt && !hasAttachments);
  selectionHint.textContent = hasSelection
    ? `${selectedIds.size} member${selectedIds.size === 1 ? "" : "s"} selected`
    : "Select at least one member";
}

function renderGems() {
  const phase = getProjectPhase();
  const enabledIds = getEnabledMemberIds(phase);
  gemsGrid.innerHTML = "";
  gems.forEach((gem) => {
    const enabled = enabledIds.has(gem.id);
    const card = document.createElement("div");
    const isHuman = APP_KIND === "custom" && gem.isHuman;
    card.className =
      "gem-card" +
      (selectedIds.has(gem.id) ? " selected" : "") +
      (enabled ? "" : " disabled") +
      (isHuman ? " gem-card-human" : "");
    card.dataset.colorIndex = String(((Number(gem.id) - 1) % 5) + 1);
    const imgSrc = gemThumbSrc(gem.image);
    const pollinationsThumb = /^https?:\/\/image\.pollinations\.ai\//i.test(imgSrc);
    const imgHtml = imgSrc
      ? `<img class="gem-card-thumb" src="${escapeHtml(imgSrc)}" alt="" loading="${pollinationsThumb ? "eager" : "lazy"}" />`
      : "";
    const replaceHumanBtnSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    const replaceHumanBtnHtml =
      enabled && APP_KIND === "custom"
        ? `<button type="button" class="gem-replace-human-hit" data-replace-human-gem="${gem.id}" title="Replace with human council member" aria-label="Replace with human council member">${replaceHumanBtnSvg}</button>`
        : "";

    if (isHuman) {
      const m = getCustomMember(gem.id);
      const hc = m?.humanContact || {};
      card.setAttribute("role", "group");
      card.innerHTML = `
        <div class="gem-card-inner">
          <div class="gem-human-front">
            <label class="gem-include"><input type="checkbox" class="gem-select-cb" ${selectedIds.has(gem.id) ? "checked" : ""} /> Include</label>
            ${imgHtml}
            <span class="gem-name">${escapeHtml(gem.name)}</span>
            <span class="gem-job-title">${escapeHtml(gem.jobTitle || "")}</span>
            <span class="gem-flip-hint">Click card to edit contact</span>
          </div>
          <div class="gem-human-back" hidden>
            <input type="text" data-hc="name" placeholder="Name" value="${escapeHtml(hc.name || gem.name || "")}" />
            <input type="text" data-hc="title" placeholder="Title" value="${escapeHtml(hc.title || gem.jobTitle || "")}" />
            <input type="text" data-hc="organization" placeholder="Organization" value="${escapeHtml(hc.organization || "")}" />
            <input type="text" data-hc="phone" placeholder="Phone" value="${escapeHtml(hc.phone || "")}" />
            <input type="text" data-hc="email" placeholder="Email" value="${escapeHtml(hc.email || "")}" />
            <input type="text" data-hc="website" placeholder="Website" value="${escapeHtml(hc.website || "")}" />
            <button type="button" class="btn-mini gem-flip-done">Done</button>
          </div>
        </div>
      `;
      const cb = card.querySelector(".gem-select-cb");
      const front = card.querySelector(".gem-human-front");
      const back = card.querySelector(".gem-human-back");
      if (cb) {
        cb.addEventListener("click", (e) => {
          e.stopPropagation();
          if (cb.checked) selectedIds.add(gem.id);
          else selectedIds.delete(gem.id);
          setSubmitState();
        });
      }
      card.querySelectorAll(".gem-human-back [data-hc]").forEach((inp) => {
        inp.addEventListener("input", () => {
          const mm = getCustomMember(gem.id);
          if (!mm) return;
          if (!mm.humanContact) mm.humanContact = {};
          mm.humanContact[inp.dataset.hc] = inp.value;
          persistCustomCouncil();
        });
      });
      const toggleFlip = (showBack) => {
        if (front) front.hidden = !!showBack;
        if (back) back.hidden = !showBack;
        card.classList.toggle("flipped", !!showBack);
      };
      card.addEventListener("click", (e) => {
        if (!enabled) return;
        if (e.target.closest(".gem-select-cb") || e.target.closest("input[data-hc]") || e.target.closest(".gem-flip-done")) {
          return;
        }
        if (back && !back.hidden) return;
        if (e.target.closest(".gem-human-back")) return;
        toggleFlip(true);
      });
      card.querySelector(".gem-flip-done")?.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFlip(false);
      });
      if (enabled) {
        card.tabIndex = 0;
      } else {
        card.tabIndex = -1;
      }
      bindGemAvatarFallback(card.querySelector(".gem-card-thumb"), gem.name, gem.id);
      gemsGrid.appendChild(card);
      return;
    }

    card.setAttribute("role", "button");
    card.tabIndex = enabled ? 0 : -1;
    card.innerHTML = `
      ${imgHtml}
      ${replaceHumanBtnHtml}
      <span class="gem-name">${escapeHtml(gem.name)}</span>
      <span class="gem-job-title">${escapeHtml(gem.jobTitle || "")}</span>
    `;
    card.querySelector(".gem-replace-human-hit")?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      openReplaceHumanPreconfirm(gem.id);
    });
    if (enabled) {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".gem-replace-human-hit")) return;
        if (selectedIds.has(gem.id)) {
          selectedIds.delete(gem.id);
        } else {
          selectedIds.add(gem.id);
        }
        renderGems();
        setSubmitState();
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          card.click();
        }
      });
    }
    bindGemAvatarFallback(card.querySelector(".gem-card-thumb"), gem.name, gem.id);
    gemsGrid.appendChild(card);
  });
}

function escapeHtml(s) {
  if (s == null) return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

const URL_REGEX = /https?:\/\/[^\s<>"\']+|www\.[^\s<>"\']+/gi;

function normalizeUrl(url) {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^www\./i.test(u)) return "https://" + u;
  return u;
}

function extractUrlSegments(str) {
  if (!str || typeof str !== "string") return [{ type: "text", value: str || "" }];
  const result = [];
  let lastIndex = 0;
  let m;
  URL_REGEX.lastIndex = 0;
  while ((m = URL_REGEX.exec(str)) !== null) {
    const before = str.slice(lastIndex, m.index);
    if (before) result.push({ type: "text", value: before });
    let url = m[0];
    const trailing = url.match(/[.,;:)\]\]]+$/);
    if (trailing) {
      url = url.slice(0, -trailing[0].length);
      result.push({ type: "url", value: normalizeUrl(url) });
      result.push({ type: "text", value: trailing[0] });
    } else {
      result.push({ type: "url", value: normalizeUrl(url) });
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < str.length) result.push({ type: "text", value: str.slice(lastIndex) });
  return result.length ? result : [{ type: "text", value: str }];
}

function responseToHtml(text) {
  if (text == null || text === "") return "";
  let out = "";
  const mdLinkRe = /\[([^\]]*)\]\((https?:\/\/[^)\s]+|www\.[^)\s]+)\)/gi;
  let lastEnd = 0;
  let mdMatch;
  const parts = [];
  while ((mdMatch = mdLinkRe.exec(text)) !== null) {
    parts.push({ type: "text", value: text.slice(lastEnd, mdMatch.index) });
    parts.push({ type: "mdLink", text: mdMatch[1], url: mdMatch[2] });
    lastEnd = mdLinkRe.lastIndex;
  }
  parts.push({ type: "text", value: text.slice(lastEnd) });
  for (const p of parts) {
    if (p.type === "mdLink") {
      out += '<a class="response-text-link" href="' + escapeHtml(normalizeUrl(p.url)) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(p.text || p.url) + "</a>";
      continue;
    }
    const segments = extractUrlSegments(p.value);
    for (const s of segments) {
      if (s.type === "url") {
        out += '<a class="response-text-link" href="' + escapeHtml(s.value) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(s.value) + "</a>";
      } else {
        out += escapeHtml(s.value);
      }
    }
  }
  return out || escapeHtml(text);
}

const ALLOWED_MIME_PREFIXES = ["image/", "text/", "application/pdf", "text/html"];
function isAllowedFile(file) {
  return (
    ALLOWED_MIME_PREFIXES.some((p) => file.type && file.type.startsWith(p)) ||
    /\.(pdf|txt|md|html?)$/i.test(file.name)
  );
}

function renderAttachments() {
  if (attachments.length === 0) {
    attachmentsList.hidden = true;
    attachmentsList.innerHTML = "";
    return;
  }
  attachmentsList.hidden = false;
  attachmentsList.innerHTML = attachments
    .map(
      (a, i) =>
        `<span class="attachment-tag">${escapeHtml(a.name)} <button type="button" class="attachment-remove" data-index="${i}" aria-label="Remove">×</button></span>`
    )
    .join("");
  attachmentsList.querySelectorAll(".attachment-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      attachments.splice(Number(btn.dataset.index), 1);
      renderAttachments();
      setSubmitState();
    });
  });
  setSubmitState();
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = (reader.result || "").replace(/^data:[^;]+;base64,/, "");
      resolve({ name: file.name, mimeType: file.type || "application/octet-stream", data });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function updateReplaceHumanProfilePreview(src) {
  const img = document.getElementById("rhProfilePreview");
  const ph = document.getElementById("rhProfilePlaceholder");
  if (!img || !ph) return;
  const s = String(src || "").trim();
  if (s) {
    img.src = s;
    img.hidden = false;
    ph.hidden = true;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
    ph.hidden = false;
  }
}

function openReplaceHumanPreconfirm(gemId) {
  replaceHumanGemId = gemId;
  const el = document.getElementById("replaceHumanPreconfirmOverlay");
  if (el) el.hidden = false;
}

function closeReplaceHumanPreconfirm() {
  const el = document.getElementById("replaceHumanPreconfirmOverlay");
  if (el) el.hidden = true;
}

function dismissReplaceHumanPreconfirm() {
  closeReplaceHumanPreconfirm();
  replaceHumanGemId = null;
}

function populateReplaceHumanEditorFromGem() {
  resetReplaceHumanSearchSession();
  const gid = replaceHumanGemId;
  const gem = gems.find((g) => Number(g.id) === Number(gid));
  const mm = getCustomMember(gid);
  replaceHumanPendingImage = null;
  const nameEl = document.getElementById("rhName");
  const titleEl = document.getElementById("rhTitle");
  const orgEl = document.getElementById("rhOrganization");
  const emailEl = document.getElementById("rhEmail");
  const phoneEl = document.getElementById("rhPhone");
  const webEl = document.getElementById("rhWebsite");
  const urlEl = document.getElementById("rhProfileUrl");
  if (nameEl) nameEl.value = gem?.name || mm?.name || "";
  if (titleEl) titleEl.value = gem?.jobTitle || mm?.jobTitle || "";
  if (orgEl) orgEl.value = "";
  if (emailEl) emailEl.value = "";
  if (phoneEl) phoneEl.value = "";
  if (webEl) webEl.value = "";
  if (urlEl) urlEl.value = "";
  updateReplaceHumanProfilePreview("");
}

function openReplaceHumanEditor() {
  populateReplaceHumanEditorFromGem();
  const el = document.getElementById("replaceHumanEditorOverlay");
  if (el) el.hidden = false;
}

function closeReplaceHumanEditor() {
  const el = document.getElementById("replaceHumanEditorOverlay");
  if (el) el.hidden = true;
  replaceHumanGemId = null;
  replaceHumanPendingImage = null;
  resetReplaceHumanSearchSession();
  updateReplaceHumanProfilePreview("");
}

function applyReplaceHumanEditorSave() {
  const gid = replaceHumanGemId;
  const mm = getCustomMember(gid);
  if (!mm) {
    closeReplaceHumanEditor();
    return;
  }
  const name = document.getElementById("rhName")?.value?.trim() || "";
  if (!name) {
    setStatus("Enter a name for the human council member.", "error");
    return;
  }
  const title = document.getElementById("rhTitle")?.value?.trim() || "";
  const organization = document.getElementById("rhOrganization")?.value?.trim() || "";
  const email = document.getElementById("rhEmail")?.value?.trim() || "";
  const phone = document.getElementById("rhPhone")?.value?.trim() || "";
  const website = document.getElementById("rhWebsite")?.value?.trim() || "";
  const url = document.getElementById("rhProfileUrl")?.value?.trim() || "";
  let image = "";
  if (replaceHumanPendingImage) image = replaceHumanPendingImage;
  else if (/^https?:\/\//i.test(url) || String(url).startsWith("data:")) image = url;
  if (!image) image = uiAvatarFallbackSrc(name);

  if (replaceHumanSearchSessionExcluded.length) {
    const prev = Array.isArray(mm.excludedLocalExperts) ? mm.excludedLocalExperts : [];
    mm.excludedLocalExperts = [
      ...new Set(
        [...prev, ...replaceHumanSearchSessionExcluded].map((x) => String(x || "").trim()).filter(Boolean)
      ),
    ];
  }
  resetReplaceHumanSearchSession();

  mm.isHuman = true;
  mm.name = name;
  mm.jobTitle = title;
  mm.portraitGender = null;
  mm.localExpert = null;
  mm.excludedLocalExperts = Array.isArray(mm.excludedLocalExperts) ? mm.excludedLocalExperts : [];
  mm.image = image;
  mm.systemInstruction = HUMAN_ADVISOR_SYSTEM_INSTRUCTION;
  mm.humanContact = {
    name,
    title,
    organization,
    phone,
    email,
    website,
  };
  const g = gems.find((x) => Number(x.id) === Number(gid));
  if (g) {
    g.isHuman = true;
    g.name = name;
    g.jobTitle = title;
    g.image = image;
  }
  persistCustomCouncil();
  persistFullProjectConfigToSaved();
  closeReplaceHumanEditor();
  renderGems();
  setSubmitState();
  setStatus("This seat is now a human council member.", "success");
}

const COUNCIL_STOCK_PORTRAIT_MALE = [
  "/portraits/male01.png",
  "/portraits/male02.png",
  "/portraits/male03.png",
  "/portraits/male04.png",
  "/portraits/male05.png",
  "/portraits/male06.png",
  "/portraits/male07.png",
  "/portraits/male08.png",
];
const COUNCIL_STOCK_PORTRAIT_FEMALE = [
  "/portraits/female01.png",
  "/portraits/female02.png",
  "/portraits/female03.png",
  "/portraits/female04.png",
  "/portraits/female05.png",
  "/portraits/female06.png",
  "/portraits/female07.png",
  "/portraits/female08.png",
];

function shuffleCouncilPortraitPool(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function councilMemberPortraitGender(m) {
  const pg = String(m.portraitGender || "").toLowerCase();
  if (pg === "male" || pg === "female" || pg === "neutral") return pg;
  return "neutral";
}

function councilPortraitNeedsMigration(image) {
  const s = String(image || "").trim();
  if (!s) return true;
  if (s.startsWith("/portraits/")) return false;
  if (/pollinations\.ai/i.test(s)) return true;
  if (/dicebear\.com/i.test(s)) return true;
  return false;
}

function assignStockPortraitsToCouncilMembersList(members) {
  if (!Array.isArray(members)) return;
  const male = COUNCIL_STOCK_PORTRAIT_MALE;
  const female = COUNCIL_STOCK_PORTRAIT_FEMALE;
  const pickFirst = (paths, usedSet) => {
    for (const p of shuffleCouncilPortraitPool(paths)) {
      if (!usedSet.has(p)) return p;
    }
    return null;
  };
  const pickUnused = (gender, usedSet) => {
    if (gender === "male") {
      return pickFirst(male, usedSet) || pickFirst(female, usedSet) || pickFirst([...male, ...female], usedSet);
    }
    if (gender === "female") {
      return pickFirst(female, usedSet) || pickFirst(male, usedSet) || pickFirst([...male, ...female], usedSet);
    }
    return (
      pickFirst(shuffleCouncilPortraitPool([...male, ...female]), usedSet) ||
      pickFirst(male, usedSet) ||
      pickFirst(female, usedSet)
    );
  };
  const used = new Set();
  const indices = shuffleCouncilPortraitPool(members.map((_, i) => i).filter((i) => !members[i].isHuman));
  for (const i of indices) {
    const m = members[i];
    const g = councilMemberPortraitGender(m);
    const path = pickUnused(g, used);
    if (path) used.add(path);
    m.image = path || uiAvatarFallbackSrc(m.name || `member${i}`);
  }
}

function maybeMigrateCouncilPortraits() {
  const members = customCouncilProject?.members;
  if (!Array.isArray(members)) return;
  if (!members.some((m) => !m.isHuman && councilPortraitNeedsMigration(m.image))) return;
  assignStockPortraitsToCouncilMembersList(members);
  persistCustomCouncil();
}

function tokenizeLineForFormatting(line) {
  const tokens = [];
  const re = /\*\*[^*]+\*\*|\*[^*]+\*|[^\s*]+|\s+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const seg = m[0];
    if (/^\s+$/.test(seg)) continue;
    if (/^\*\*[^*]+\*\*$/.test(seg)) {
      tokens.push({ type: "word", text: seg.slice(2, -2), bold: true, italic: false });
    } else if (/^\*[^*]+\*$/.test(seg)) {
      tokens.push({ type: "word", text: seg.slice(1, -1), bold: false, italic: false });
    } else {
      tokens.push({ type: "word", text: seg, bold: false, italic: false });
    }
  }
  return tokens;
}

function tokenizeForAnimation(text) {
  if (!text || typeof text !== "string") return [];
  const tokens = [];
  const lines = text.split(/\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line) continue;
    const isShort = line.length < 40;
    const noSentenceEnd = !/[.?!:]$/.test(line);
    if (isShort && noSentenceEnd) {
      tokens.push({ type: "header", text: line });
      tokens.push({ type: "linebreak" });
    } else {
      tokens.push(...tokenizeLineForFormatting(line));
      tokens.push({ type: "linebreak" });
    }
  }
  return tokens;
}

function appendParagraphSpacer(container) {
  const spacer = document.createElement("div");
  spacer.className = "response-paragraph-spacer";
  container.appendChild(spacer);
}

function appendBulletGroupSpacer(container) {
  const spacer = document.createElement("div");
  spacer.className = "response-bullet-group-spacer";
  container.appendChild(spacer);
}

function isUrlToken(text) {
  return /^https?:\/\/[^\s]+/.test(text);
}

function parseUrlWord(text) {
  const match = text.match(/^(https?:\/\/[^\s]+?|www\.[^\s]+?)([.,;:)\]]*)$/i);
  if (match) return { href: normalizeUrl(match[1]), suffix: match[2] };
  if (/^(https?:\/\/[^\s]+|www\.[^\s]+)$/i.test(text)) return { href: normalizeUrl(text), suffix: "" };
  return null;
}

function isFollowUpCommunityHeader(text) {
  return /follow\s*up\s*in\s*your\s*community/i.test((text || "").trim());
}

function getWordDelayMs() {
  return 0;
}

function animateResponseText(container, text, wpm = WORDS_PER_MINUTE) {
  if (!container) return;
  container.innerHTML = "";
  const tokens = tokenizeForAnimation(text);
  let i = 0;
  let bulletNext = false;
  let needSpace = false;
  let previousWordEndedWithQuestion = false;
  let lastWasFollowUpHeader = false;
  let lastAppendedToken = null;

  function scrollToBottom() {
    const scrollParent = container.closest(".response-overlay-card-body");
    if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;
  }

  function scheduleNext() {
    if (i >= tokens.length) return;
    const delay = getWordDelayMs(wpm, lastAppendedToken);
    setTimeout(appendNext, delay);
  }

  function appendNext() {
    if (i >= tokens.length) return;
    const t = tokens[i];
    i++;
    lastAppendedToken = t;

    if (t.type === "header") {
      needSpace = false;
      bulletNext = false;
      previousWordEndedWithQuestion = false;
      const p = document.createElement("p");
      p.className = "response-overlay-section-header" + (isFollowUpCommunityHeader(t.text) ? " response-overlay-followup-community" : "");
      const headerText = (t.text || "").trim();
      if (/[?]$/.test(headerText)) {
        const bullet = document.createElement("span");
        bullet.className = "response-overlay-bullet";
        bullet.textContent = "• ";
        p.appendChild(bullet);
      }
      const textNode = document.createTextNode("");
      p.appendChild(textNode);
      container.appendChild(p);
      container.appendChild(document.createElement("br"));
      lastWasFollowUpHeader = isFollowUpCommunityHeader(t.text);
      let hIdx = 0;
      function headerTick() {
        if (hIdx >= headerText.length) {
          scrollToBottom();
          if (i < tokens.length) setTimeout(scheduleNext, SENTENCE_END_PAUSE_MS);
          return;
        }
        textNode.textContent += headerText[hIdx++];
        scrollToBottom();
        setTimeout(headerTick, LETTER_DELAY_MS);
      }
      headerTick();
      return;
    }
    if (t.type === "linebreak") {
      needSpace = false;
      container.appendChild(document.createElement("br"));
      if (lastWasFollowUpHeader) {
        lastWasFollowUpHeader = false;
      } else if (!previousWordEndedWithQuestion) {
        appendParagraphSpacer(container);
      }
      previousWordEndedWithQuestion = false;
      scrollToBottom();
      if (i < tokens.length) setTimeout(scheduleNext, LINE_BREAK_PAUSE_MS);
      return;
    }
    if (t.type === "word") {
      if (bulletNext) {
        bulletNext = false;
        appendBulletGroupSpacer(container);
        container.appendChild(document.createElement("br"));
        const bullet = document.createElement("span");
        bullet.className = "response-overlay-bullet";
        bullet.textContent = "• ";
        container.appendChild(bullet);
      }
      if (needSpace) container.appendChild(document.createTextNode(" "));
      const urlParts = parseUrlWord(t.text);
      if (urlParts) {
        const a = document.createElement("a");
        a.className = "response-word-appear response-overlay-link";
        a.href = urlParts.href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = urlParts.href;
        container.appendChild(a);
        if (urlParts.suffix) container.appendChild(document.createTextNode(urlParts.suffix));
        needSpace = true;
        if (/[?]$/.test(t.text)) bulletNext = true;
        previousWordEndedWithQuestion = /[?]$/.test(t.text);
        scrollToBottom();
        if (i < tokens.length) setTimeout(scheduleNext, 25);
        return;
      }
      const segments = extractUrlSegments(t.text);
      let segIdx = 0;
      function onSegmentDone() {
        if (segIdx >= segments.length) {
          needSpace = true;
          if (/[?]$/.test(t.text)) bulletNext = true;
          previousWordEndedWithQuestion = /[?]$/.test(t.text);
          scrollToBottom();
          if (i < tokens.length) scheduleNext();
          return;
        }
        const seg = segments[segIdx++];
        if (seg.type === "url") {
          const a = document.createElement("a");
          a.className = "response-word-appear response-overlay-link";
          a.href = seg.value;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = seg.value;
          container.appendChild(a);
          scrollToBottom();
          setTimeout(onSegmentDone, 25);
          return;
        }
        const span = document.createElement("span");
        span.className = "response-word-appear" + (t.bold ? " response-word-bold" : "") + (t.italic ? " response-word-italic" : "");
        container.appendChild(span);
        let charIdx = 0;
        function tick() {
          if (charIdx >= seg.value.length) {
            onSegmentDone();
            return;
          }
          const ch = seg.value[charIdx++];
          span.textContent += ch;
          scrollToBottom();
          const delay = /[.!?]/.test(ch) ? SENTENCE_END_PAUSE_MS : LETTER_DELAY_MS;
          setTimeout(tick, delay);
        }
        tick();
      }
      onSegmentDone();
      return;
    }
    if (i < tokens.length) scheduleNext();
  }
  appendNext();
}

function renderResponseTextStatic(container, text) {
  if (!container) return;
  container.innerHTML = "";
  const tokens = tokenizeForAnimation(text);
  let bulletNext = false;
  let needSpace = false;
  let previousWordEndedWithQuestion = false;
  let lastWasFollowUpHeader = false;
  for (const t of tokens) {
    if (t.type === "header") {
      needSpace = false;
      bulletNext = false;
      previousWordEndedWithQuestion = false;
      const p = document.createElement("p");
      p.className = "response-overlay-section-header" + (isFollowUpCommunityHeader(t.text) ? " response-overlay-followup-community" : "");
      if (/[?]$/.test((t.text || "").trim())) {
        const bullet = document.createElement("span");
        bullet.className = "response-overlay-bullet";
        bullet.textContent = "• ";
        p.appendChild(bullet);
        p.appendChild(document.createTextNode(t.text));
      } else {
        p.textContent = t.text;
      }
      container.appendChild(p);
      container.appendChild(document.createElement("br"));
      lastWasFollowUpHeader = isFollowUpCommunityHeader(t.text);
      continue;
    }
    if (t.type === "linebreak") {
      needSpace = false;
      container.appendChild(document.createElement("br"));
      if (lastWasFollowUpHeader) lastWasFollowUpHeader = false;
      else if (!previousWordEndedWithQuestion) appendParagraphSpacer(container);
      previousWordEndedWithQuestion = false;
      continue;
    }
    if (t.type === "word") {
      if (bulletNext) {
        bulletNext = false;
        appendBulletGroupSpacer(container);
        container.appendChild(document.createElement("br"));
        const bullet = document.createElement("span");
        bullet.className = "response-overlay-bullet";
        bullet.textContent = "• ";
        container.appendChild(bullet);
      }
      if (needSpace) container.appendChild(document.createTextNode(" "));
      const urlParts = parseUrlWord(t.text);
      if (urlParts) {
        const a = document.createElement("a");
        a.className = "response-overlay-link";
        a.href = urlParts.href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = urlParts.href;
        container.appendChild(a);
        if (urlParts.suffix) container.appendChild(document.createTextNode(urlParts.suffix));
      } else {
        const segments = extractUrlSegments(t.text);
        for (const seg of segments) {
          if (seg.type === "url") {
            const a = document.createElement("a");
            a.className = "response-overlay-link";
            a.href = seg.value;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = seg.value;
            container.appendChild(a);
          } else {
            const span = document.createElement("span");
            span.textContent = seg.value;
            if (t.bold) span.classList.add("response-word-bold");
            if (t.italic) span.classList.add("response-word-italic");
            container.appendChild(span);
          }
        }
      }
      needSpace = true;
      if (/[?]$/.test(t.text)) bulletNext = true;
      previousWordEndedWithQuestion = /[?]$/.test(t.text);
    }
  }
}

function closeResponsesOverlay() {
  if (responsesOverlay) responsesOverlay.hidden = true;
}

function updateReturnToResponseButton() {
  if (returnToResponseBtn) returnToResponseBtn.hidden = lastResults.length === 0;
}

function openFollowUpPrompt({ gemId, name, response, card }) {
  currentFollowUp = { gemId, name, response, card };
  if (followUpPromptBox) followUpPromptBox.hidden = false;
  if (followUpInput) {
    followUpInput.value = "";
    followUpInput.focus();
  }
}

function closeFollowUpPrompt() {
  currentFollowUp = null;
  if (followUpPromptBox) followUpPromptBox.hidden = true;
  if (followUpInput) followUpInput.value = "";
}

function appendFollowUpToCard(card, followUpText) {
  if (!card) return;
  const body = card.querySelector(".response-overlay-card-body");
  if (!body) return;
  let block = card.querySelector(".response-overlay-card-followup");
  if (!block) {
    block = document.createElement("div");
    block.className = "response-overlay-card-followup";
    block.innerHTML = "<h4>FOLLOW-UP</h4><div class=\"response-overlay-text\" role=\"article\"></div>";
    body.appendChild(block);
  }
  const textEl = block.querySelector(".response-overlay-text");
  if (textEl) animateResponseText(textEl, followUpText, WORDS_PER_MINUTE);
}

function openResponsesOverlay(results, options = {}) {
  const { showSaveButton = true, jobTitleMap = {}, followUpsByGemId = {}, animate = true } = options;
  if (!responsesOverlayGrid || !responsesOverlay) return;
  responsesOverlayGrid.innerHTML = "";
  const n = results.length;
  results.forEach(({ gemId, name, response, error, jobTitle }) => {
    const colorKey = ((Number(gemId) - 1) % 5) + 1;
    const colors = MEMBER_COLORS[colorKey] || MEMBER_COLORS[2];
    const title = jobTitle || jobTitleMap[name] || "";
    const card = document.createElement("div");
    card.className = "response-overlay-card";
    card.dataset.gemId = String(gemId);
    card.style.setProperty("--member-border", colors.border);
    card.style.setProperty("--member-bg", colors.bg);
    card.style.setProperty("--member-fg", colors.fg);
    card.style.setProperty("--member-card", colors.card);
    const gFound = gems.find((g) => g.id === gemId);
    const imgSrc = gFound?.image;
    const thumb = imgSrc ? gemThumbSrc(imgSrc) : "";
    const imgHtml = thumb ? `<img class="response-overlay-thumb" src="${escapeHtml(thumb)}" alt="" />` : "";
    card.innerHTML = `
      <div class="response-overlay-card-header">
        <div class="response-overlay-card-meta">
          <span class="response-overlay-card-name">${escapeHtml(name)}</span>
          <span class="response-overlay-card-role">${escapeHtml(title)}</span>
        </div>
        <div class="response-overlay-card-avatar">${imgHtml}</div>
      </div>
      <div class="response-overlay-card-body">
        ${error ? `<p class="response-overlay-error">${escapeHtml(error)}</p>` : `<div class="response-overlay-text" role="article"></div>`}
      </div>
      <div class="response-overlay-actions"></div>
    `;
    const body = card.querySelector(".response-overlay-card-body");
    const textEl = card.querySelector(".response-overlay-text");
    const actionsEl = card.querySelector(".response-overlay-actions");
    bindGemAvatarFallback(card.querySelector(".response-overlay-thumb"), name, gemId);
    if (error) {
      if (textEl) textEl.textContent = "";
    } else if (textEl && response) {
      if (animate) {
        animateResponseText(textEl, response, WORDS_PER_MINUTE);
      } else {
        renderResponseTextStatic(textEl, response);
      }
    }
    if (showSaveButton) {
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn-save response-overlay-btn";
      saveBtn.textContent = "Save Response";
      saveBtn.addEventListener("click", () => { saveCurrentChat(); });
      actionsEl.appendChild(saveBtn);
    }
    if (!error && response && !gFound?.isHuman) {
      const sendBtn = document.createElement("button");
      sendBtn.type = "button";
      sendBtn.className = "btn-send-to response-overlay-btn";
      sendBtn.textContent = "Send Response to…";
      sendBtn.addEventListener("click", () => openSendToOverlay({ gemId, name, response }));
      actionsEl.appendChild(sendBtn);
      const followUpBtn = document.createElement("button");
      followUpBtn.type = "button";
      followUpBtn.className = "btn-follow-up response-overlay-btn";
      followUpBtn.textContent = "Ask follow-up";
      followUpBtn.addEventListener("click", () => openFollowUpPrompt({ gemId, name, response, card }));
      actionsEl.appendChild(followUpBtn);
    }
    const followUp = followUpsByGemId[gemId];
    if (followUp && followUp.length > 0) {
      const block = document.createElement("div");
      block.className = "response-overlay-followup";
      block.innerHTML = "<h4>Thoughts from others</h4>";
      const list = document.createElement("div");
      list.className = "response-overlay-followup-list";
      followUp.forEach((r) => {
        const fc = document.createElement("div");
        fc.className = "response-overlay-followup-item";
        fc.innerHTML = `
          <strong>${escapeHtml(r.name)}</strong> ${r.jobTitle ? `<span class="response-overlay-followup-role">${escapeHtml(r.jobTitle)}</span>` : ""}
          <p class="response-overlay-followup-text">${escapeHtml(r.response || "")}</p>
        `;
        list.appendChild(fc);
      });
      block.appendChild(list);
      card.appendChild(block);
    }
    responsesOverlayGrid.appendChild(card);
  });
  responsesOverlay.hidden = false;
}

function renderResults(results, options = {}) {
  const { showSaveButton = true, jobTitleMap = {}, followUpsByGemId = {} } = options;
  resultsList.innerHTML = "";
  results.forEach(({ gemId, name, response, error, jobTitle }) => {
    const gFound = gems.find((g) => g.id === gemId);
    const title = jobTitle || jobTitleMap[name] || "";
    const card = document.createElement("div");
    card.className = "result-card";
    card.dataset.gemId = String(gemId);
    if (error) {
      card.innerHTML = `
        <h3>${escapeHtml(name)}</h3>
        ${title ? `<p class="result-job-title">${escapeHtml(title)}</p>` : ""}
        <p class="response-error">${escapeHtml(error)}</p>
      `;
    } else {
      card.innerHTML = `
        <h3>${escapeHtml(name)}</h3>
        ${title ? `<p class="result-job-title">${escapeHtml(title)}</p>` : ""}
        <p class="response-text">${responseToHtml(response || "")}</p>
      `;
    }
    if (showSaveButton || !error) {
      const actions = document.createElement("div");
      actions.className = "result-card-actions";
      if (showSaveButton) {
        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "btn-save";
        saveBtn.textContent = "Save Response";
        saveBtn.addEventListener("click", () => saveCurrentChat());
        actions.appendChild(saveBtn);
      }
      if (!error && response && !gFound?.isHuman) {
        const sendBtn = document.createElement("button");
        sendBtn.type = "button";
        sendBtn.className = "btn-send-to";
        sendBtn.textContent = "Send Response to…";
        sendBtn.addEventListener("click", () => openSendToOverlay({ gemId, name, response }));
        actions.appendChild(sendBtn);
      }
      card.appendChild(actions);
    }
    const followUp = followUpsByGemId[gemId];
    if (followUp && followUp.length > 0) {
      const block = document.createElement("div");
      block.className = "follow-up-block";
      block.innerHTML = "<h4>Thoughts from others</h4>";
      const list = document.createElement("div");
      list.className = "results-list";
      followUp.forEach((r) => {
        const fc = document.createElement("div");
        fc.className = "result-card";
        fc.innerHTML = `
          <h3>${escapeHtml(r.name)}</h3>
          ${r.jobTitle ? `<p class="result-job-title">${escapeHtml(r.jobTitle)}</p>` : ""}
          <p class="response-text">${responseToHtml(r.response || "")}</p>
        `;
        list.appendChild(fc);
      });
      block.appendChild(list);
      card.appendChild(block);
    }
    resultsList.appendChild(card);
  });
  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function getSaveTitle() {
  if (!lastResults.length) return "";
  const first = lastResults[0];
  const jobTitle = first.jobTitle || gems.find((g) => g.id === first.gemId)?.jobTitle || first.name;
  const now = new Date();
  return `${jobTitle} • ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function saveCurrentChat() {
  if (!lastResults.length) return;
  fetch("/api/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: lastPrompt,
      selectedGems: lastSelectedGems,
      results: lastResults,
      title: getSaveTitle(),
    }),
  })
    .then((r) => r.json())
    .then(() => {
      setStatus("Chat saved. Open Recent Chats to retrieve it.", "success");
    })
    .catch((err) => setStatus("Could not save: " + (err.message || "error"), "error"));
}

function openSendToOverlay(source) {
  sendToSource = source;
  sendToSelectedIds = new Set();
  const others = gems.filter((g) => g.id !== source.gemId && !g.isHuman);
  sendToList.innerHTML = "";
  others.forEach((gem) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "send-to-item";
    item.innerHTML = `
      <span><span class="send-to-name">${escapeHtml(gem.name)}</span><br><span class="send-to-job">${escapeHtml(gem.jobTitle || "")}</span></span>
    `;
    item.addEventListener("click", () => {
      if (sendToSelectedIds.has(gem.id)) {
        sendToSelectedIds.delete(gem.id);
      } else {
        sendToSelectedIds.add(gem.id);
      }
      item.classList.toggle("selected", sendToSelectedIds.has(gem.id));
    });
    sendToList.appendChild(item);
  });
  sendToOverlay.hidden = false;
  recentChatsDropdown.hidden = true;
}

function closeSendToOverlay() {
  sendToOverlay.hidden = true;
  sendToSource = null;
}

function confirmSendTo() {
  if (!sendToSource || sendToSelectedIds.size === 0) {
    closeSendToOverlay();
    return;
  }
  const sourceGemId = sendToSource.gemId;
  const prompt = sendToSource.response;
  const selectedIdsForRequest = Array.from(sendToSelectedIds).filter((id) => {
    const g = gems.find((x) => x.id === id);
    return g && !g.isHuman;
  });
  if (selectedIdsForRequest.length === 0) {
    closeSendToOverlay();
    setStatus("Choose at least one AI member to respond.", "error");
    return;
  }
  sendToConfirm.disabled = true;
  closeSendToOverlay();
  setStatus("");
  startCouncilLoading();
  fetch(APP_KIND === "custom" ? "/api/chat/custom" : "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      chatPayload({
        prompt,
        selectedGems: selectedIdsForRequest,
        opinionOnResponse: true,
      })
    ),
  })
    .then((r) => r.json())
    .then((data) => {
      if (!data.results) throw new Error(data.error || "No results");
      const jobTitleMap = {};
      gems.forEach((g) => { jobTitleMap[g.name] = g.jobTitle; });
      const followUpsByGemId = {};
      const withTitles = data.results.map((r) => ({ ...r, jobTitle: jobTitleMap[r.name] || r.jobTitle }));
      followUpsByGemId[sourceGemId] = withTitles;
      openResponsesOverlay(lastResults, {
        showSaveButton: true,
        jobTitleMap,
        followUpsByGemId,
        animate: false,
      });
      updateReturnToResponseButton();
      setStatus(`Got ${data.results.length} response(s) from others.`, "success");
    })
    .catch((err) => setStatus("Send failed: " + (err.message || "error"), "error"))
    .finally(() => {
      stopCouncilLoading();
      sendToConfirm.disabled = false;
    });
}

sendToOverlayBackdrop.addEventListener("click", closeSendToOverlay);
sendToCancel.addEventListener("click", closeSendToOverlay);
sendToConfirm.addEventListener("click", confirmSendTo);

if (responsesOverlayBackdrop) responsesOverlayBackdrop.addEventListener("click", closeResponsesOverlay);
if (responsesOverlayClose) responsesOverlayClose.addEventListener("click", closeResponsesOverlay);
if (returnToResponseBtn) {
  returnToResponseBtn.addEventListener("click", () => {
    if (lastResults.length > 0 && responsesOverlay) responsesOverlay.hidden = false;
  });
}

if (followUpCancel) followUpCancel.addEventListener("click", closeFollowUpPrompt);
if (followUpSend) {
  followUpSend.addEventListener("click", () => {
    if (!currentFollowUp || !followUpInput) return;
    const question = followUpInput.value.trim();
    if (!question) return;
    const fuGem = gems.find((g) => g.id === currentFollowUp.gemId);
    if (fuGem?.isHuman) {
      setStatus("Follow-up applies to AI members only.", "error");
      return;
    }
    followUpSend.disabled = true;
    setStatus("");
    startCouncilLoading();
    fetch(APP_KIND === "custom" ? "/api/chat/custom" : "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        chatPayload({
          selectedGems: [currentFollowUp.gemId],
          prompt: question,
          followUpPreviousResponse: currentFollowUp.response,
        })
      ),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.results || !data.results.length) throw new Error(data.error || "No response");
        const followUpResponse = data.results[0].response || "";
        appendFollowUpToCard(currentFollowUp.card, followUpResponse);
        closeFollowUpPrompt();
        setStatus("Follow-up response added.", "success");
      })
      .catch((err) => setStatus("Follow-up failed: " + (err.message || "error"), "error"))
      .finally(() => {
        stopCouncilLoading();
        followUpSend.disabled = false;
      });
  });
}

if (sendToOverlay) sendToOverlay.hidden = true;
if (responsesOverlay) responsesOverlay.hidden = true;
if (followUpPromptBox) followUpPromptBox.hidden = true;

function loadRecentChats() {
  fetch("/api/chats")
    .then((r) => r.json())
    .then((data) => {
      const chats = data.chats || [];
      recentChatsList.innerHTML = "";
      recentChatsEmpty.hidden = chats.length > 0;
      chats.forEach((chat) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "recent-chat-item";
        const date = new Date(chat.createdAt);
        btn.innerHTML = `
          <span class="recent-chat-prompt">${escapeHtml(chat.title || chat.prompt)}</span>
          <span class="recent-chat-meta">${chat.resultCount} response(s)</span>
        `;
        btn.addEventListener("click", () => {
          fetch(`/api/chats/${chat.id}`)
            .then((r) => r.json())
            .then((c) => {
              lastPrompt = c.prompt;
              lastSelectedGems = c.selectedGems || [];
              lastResults = c.results || [];
              promptInput.value = c.prompt;
              selectedIds = new Set((c.selectedGems || []).map((id) => Number(id)).filter(Boolean));
              const jobTitleMap = {};
              (c.results || []).forEach((r) => { jobTitleMap[r.name] = r.jobTitle || ""; });
              renderGems();
              openResponsesOverlay(c.results || [], { showSaveButton: false, jobTitleMap, animate: false });
              updateReturnToResponseButton();
              setSubmitState();
              recentChatsDropdown.hidden = true;
              setStatus("Loaded saved chat.");
            });
        });
        recentChatsList.appendChild(btn);
      });
    });
}

recentChatsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = !recentChatsDropdown.hidden;
  recentChatsDropdown.hidden = open;
  if (!open) {
    loadRecentChats();
    recentChatsBtn.setAttribute("aria-expanded", "true");
  } else {
    recentChatsBtn.setAttribute("aria-expanded", "false");
  }
});

document.body.addEventListener("click", () => {
  if (!recentChatsDropdown.hidden) {
    recentChatsDropdown.hidden = true;
    recentChatsBtn.setAttribute("aria-expanded", "false");
  }
});

recentChatsDropdown.addEventListener("click", (e) => e.stopPropagation());

async function submit() {
  const prompt = promptInput.value.trim();
  if (selectedIds.size === 0) return;
  if (!prompt && attachments.length === 0) return;

  submitBtn.classList.add("loading");
  submitBtn.disabled = true;
  setStatus("");
  resultsSection.hidden = true;
  if (returnToResponseBtn) returnToResponseBtn.hidden = true;
  startCouncilLoading();

  try {
    const body = {
      selectedGems: Array.from(selectedIds),
      prompt: prompt || "(See attached files.)",
      attachments: attachments.length > 0 ? attachments.map((a) => ({ name: a.name, mimeType: a.mimeType, data: a.data })) : undefined,
    };
    const res = await fetch(APP_KIND === "custom" ? "/api/chat/custom" : "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chatPayload(body)),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus(data.error || "Request failed", "error");
      return;
    }

    lastPrompt = prompt || "(Attached files)";
    lastSelectedGems = Array.from(selectedIds);
    lastResults = data.results || [];
    attachments = [];
    renderAttachments();
    const jobTitleMap = {};
    gems.forEach((g) => { jobTitleMap[g.name] = g.jobTitle; });
    lastResults.forEach((r) => { r.jobTitle = jobTitleMap[r.name] || r.jobTitle; });
    openResponsesOverlay(lastResults, { showSaveButton: true, jobTitleMap, animate: true });
    updateReturnToResponseButton();
    setStatus(`Done. ${lastResults.length} response(s).`, "success");
  } catch (err) {
    setStatus("Network error: " + (err.message || "Could not reach server"), "error");
  } finally {
    stopCouncilLoading();
    submitBtn.classList.remove("loading");
    setSubmitState();
  }
}

async function loadGems() {
  if (APP_KIND === "custom") {
    const params = new URLSearchParams(window.location.search);
    loadSavedProjectIntoSession(params.get("saved"));
    let raw = sessionStorage.getItem("aiCouncilActiveProject");
    try {
      customCouncilProject = raw ? JSON.parse(raw) : null;
    } catch {
      customCouncilProject = null;
    }
    if (!customCouncilProject?.members?.length) {
      window.location.href = "/";
      return;
    }
    maybeMigrateCouncilPortraits();
    const titleEl = document.getElementById("councilPageTitle");
    if (titleEl) titleEl.textContent = customCouncilProject.projectTitle || "Your AI Council";
    buildPhaseSectionFromProject();
    gems = customCouncilProject.members.map((m) => ({
      id: m.id,
      name: m.name,
      jobTitle: m.jobTitle,
      image: m.image || null,
      isHuman: !!m.isHuman,
    }));
    selectedIds = new Set(gems.filter((g) => !g.isHuman).map((g) => g.id));
    renderGems();
    syncPhaseMilestoneTitle();
    setSubmitState();
    if (viewRubricCouncilBtn) viewRubricCouncilBtn.hidden = false;
    return;
  }

  try {
    const res = await fetch("/api/gems");
    const data = await res.json();
    gems = data.gems || [];
  } catch {
    gems = [
      { id: 1, name: "Henrietta", jobTitle: "Scientific Historian", image: "henrietta.jpg" },
      { id: 2, name: "Jane", jobTitle: "Cultural Ethnographer", image: "jane.png" },
      { id: 3, name: "Laika", jobTitle: "Launch Visionary", image: "Laika.jpg" },
      { id: 4, name: "Wolfgang", jobTitle: "Logistics Architect", image: "wolfgang.jpg" },
      { id: 5, name: "Carl", jobTitle: "Interstellar Linguist", image: "carl.jpg" },
    ];
  }
  renderGems();
  syncPhaseMilestoneTitle();
  setSubmitState();
}

function onPhaseChange() {
  const phase = getProjectPhase();
  const enabledIds = getEnabledMemberIds(phase);
  selectedIds.forEach((id) => {
    if (!enabledIds.has(id)) selectedIds.delete(id);
  });
  syncPhaseMilestoneTitle();
  renderGems();
  setSubmitState();
  updateRubricCouncilButton();
}

document.querySelectorAll('input[name="projectPhase"]').forEach((radio) => {
  radio.addEventListener("change", onPhaseChange);
});

uploadBtn.addEventListener("click", () => fileInput.click());

viewRubricCouncilBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!RUBRIC_CREATION_ENABLED) return;
  if (APP_KIND !== "custom" || !customCouncilProject) return;
  try {
    if (hasRubricForCurrentPhase()) {
      await openRubricChartInNewTabForRow(getCurrentPhaseRubricRow());
      return;
    }
    openRubricPreconfirmOverlay();
  } catch (err) {
    setStatus(err.message || String(err), "error");
  }
});

document.getElementById("rubricPreconfirmBackdrop")?.addEventListener("click", () => closeRubricPreconfirmOverlay());
document.getElementById("rubricPreconfirmNo")?.addEventListener("click", async () => {
  closeRubricPreconfirmOverlay();
  try {
    await createRubricAndOpenForCurrentPhase();
  } catch (err) {
    setStatus(err.message || String(err), "error");
  }
});
document.getElementById("rubricPreconfirmYes")?.addEventListener("click", () => {
  closeRubricPreconfirmOverlay();
  populateRubricEditOverlay();
  openRubricEditOverlay();
});

document.getElementById("rubricEditBackdrop")?.addEventListener("click", () => closeRubricEditOverlay());
document.getElementById("rubricEditClose")?.addEventListener("click", () => closeRubricEditOverlay());
document.getElementById("rubricEditSaveProject")?.addEventListener("click", () => {
  collectRubricEditOverlayToProject();
  normalizeCouncilMemberPhasesAfterPhaseCountChange();
  persistCustomCouncil();
  persistFullProjectConfigToSaved();
  closeRubricEditOverlay();
  refreshCouncilPhaseUIAfterProjectEdit();
  setStatus("Project details saved.", "success");
});

document.getElementById("rubricEditCreateRubric")?.addEventListener("click", async () => {
  collectRubricEditOverlayToProject();
  normalizeCouncilMemberPhasesAfterPhaseCountChange();
  persistCustomCouncil();
  persistFullProjectConfigToSaved();
  closeRubricEditOverlay();
  refreshCouncilPhaseUIAfterProjectEdit();
  try {
    await createRubricAndOpenForCurrentPhase();
    setStatus("Rubric created. Opened in a new tab.", "success");
  } catch (err) {
    setStatus(err.message || String(err), "error");
  }
});

document.getElementById("rubricEditSupportingFiles")?.addEventListener("change", async (e) => {
  const inp = e.target;
  const files = Array.from(inp.files || []);
  inp.value = "";
  for (const file of files) {
    if (!isAllowedFile(file)) continue;
    try {
      const payload = await readFileAsBase64(file);
      if (payload?.data) {
        rubricEditSupportingStaging.push({
          name: payload.name || file.name,
          mimeType: payload.mimeType || file.type || "application/octet-stream",
          data: payload.data,
        });
      }
    } catch {
      setStatus("Could not read file: " + file.name, "error");
    }
  }
  renderRubricEditSupportingList();
});

document.getElementById("replaceHumanPreconfirmBackdrop")?.addEventListener("click", () => dismissReplaceHumanPreconfirm());
document.getElementById("replaceHumanPreconfirmNo")?.addEventListener("click", () => dismissReplaceHumanPreconfirm());
document.getElementById("replaceHumanPreconfirmYes")?.addEventListener("click", () => {
  closeReplaceHumanPreconfirm();
  openReplaceHumanEditor();
});

document.getElementById("replaceHumanEditorBackdrop")?.addEventListener("click", () => closeReplaceHumanEditor());
document.getElementById("replaceHumanEditorClose")?.addEventListener("click", () => closeReplaceHumanEditor());
document.getElementById("replaceHumanEditorCancel")?.addEventListener("click", () => closeReplaceHumanEditor());
document.getElementById("replaceHumanEditorSave")?.addEventListener("click", () => applyReplaceHumanEditorSave());

document.getElementById("replaceHumanSearchBtn")?.addEventListener("click", () => {
  void runReplaceHumanLocalSearch();
});

document.getElementById("replaceHumanAvatarHit")?.addEventListener("click", () => {
  document.getElementById("rhProfileFile")?.click();
});

document.getElementById("rhProfileFile")?.addEventListener("change", async (e) => {
  const inp = e.target;
  const file = (inp.files || [])[0];
  inp.value = "";
  if (!file || !String(file.type || "").startsWith("image/")) return;
  try {
    replaceHumanPendingImage = await readFileAsDataUrl(file);
    const urlEl = document.getElementById("rhProfileUrl");
    if (urlEl) urlEl.value = "";
    updateReplaceHumanProfilePreview(replaceHumanPendingImage);
  } catch {
    setStatus("Could not read that image file.", "error");
  }
});

document.getElementById("rhProfileUrl")?.addEventListener("input", () => {
  replaceHumanPendingImage = null;
  const u = document.getElementById("rhProfileUrl")?.value?.trim() || "";
  if (/^https?:\/\//i.test(u) || u.startsWith("data:")) updateReplaceHumanProfilePreview(u);
  else updateReplaceHumanProfilePreview("");
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const rhEd = document.getElementById("replaceHumanEditorOverlay");
  const rhPre = document.getElementById("replaceHumanPreconfirmOverlay");
  const pre = document.getElementById("rubricPreconfirmOverlay");
  const ed = document.getElementById("rubricEditOverlay");
  if (rhEd && !rhEd.hidden) {
    closeReplaceHumanEditor();
    e.preventDefault();
    return;
  }
  if (rhPre && !rhPre.hidden) {
    dismissReplaceHumanPreconfirm();
    e.preventDefault();
    return;
  }
  if (ed && !ed.hidden) {
    closeRubricEditOverlay();
    e.preventDefault();
    return;
  }
  if (pre && !pre.hidden) {
    closeRubricPreconfirmOverlay();
    e.preventDefault();
  }
});
fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []).filter(isAllowedFile);
  fileInput.value = "";
  for (const file of files) {
    try {
      const a = await readFileAsBase64(file);
      attachments.push(a);
    } catch (err) {
      setStatus("Could not read file: " + file.name, "error");
    }
  }
  renderAttachments();
});

promptInput.addEventListener("input", setSubmitState);
promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
});
submitBtn.addEventListener("click", submit);

loadGems();
