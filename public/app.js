const gemsGrid = document.getElementById("gemsGrid");
const selectionHint = document.getElementById("selectionHint");
const promptInput = document.getElementById("promptInput");
const submitBtn = document.getElementById("submitBtn");
const resultsSection = document.getElementById("resultsSection");
const resultsList = document.getElementById("resultsList");
const statusEl = document.getElementById("status");
const councilMenuBtn = document.getElementById("councilMenuBtn");
const councilMenuDropdown = document.getElementById("councilMenuDropdown");
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
const phaseProjectTitle = document.getElementById("phaseProjectTitle");
const phaseMilestoneTitle = document.getElementById("phaseMilestoneTitle");
const phaseMilestoneBannerText = document.getElementById("phaseMilestoneBannerText");
const viewRubricCouncilBtn = document.getElementById("viewRubricCouncilBtn");
const attachmentsList = document.getElementById("attachmentsList");
const promptSessionRow = document.getElementById("promptSessionRow");
const promptSessionChecks = document.getElementById("promptSessionChecks");
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
/** Follow-up prompts are always capped (main student question may be higher for Uni+). */
const FOLLOW_UP_MAX_CHARS = 144;

const COUNCIL_LOADING_PHRASES = [
  "Council members are thinking…",
  "Listening carefully…",
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
/** When sending to human members: note + confirm steps before stub email + optional AI opinion fetch. */
let pendingSendTo = null;
/** Last introductory note from the human-email flow (for future server wiring). */
let lastHumanEmailIntroNote = "";

function formatEnglishNames(names) {
  const list = (names || []).map((n) => String(n || "").trim()).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}
let attachments = []; // { name, mimeType, data (base64) }

const APP_KIND = document.body.dataset.app || "golden-record";

const DAILY_PROMPT_LIMIT = 3;
const PROMPT_INPUT_DEFAULT_PLACEHOLDER = "Ask something… all selected members will answer.";
const PROMPT_EXHAUSTED_PLACEHOLDER = "All daily prompts have been used - come back tomorrow!";

/** Set to `true` after QC — enables View/Create Rubric on the council page (must match create-council.js). */
const RUBRIC_CREATION_ENABLED = false;
let customCouncilProject = null;

const HUMAN_ADVISOR_SYSTEM_INSTRUCTION =
  "Human community advisor. This slot is filled by a real-world contact in the educator's region. Encourage students to connect professionally and verify contact details before outreach.";

const HUMAN_ADVISOR_SCHOOL_COMMUNITY_INSTRUCTION =
  "Human community advisor. This slot represents a **school-community** connection (parent, volunteer, or partner your school coordinates—not an unsupervised internet contact). Encourage students to work through their teacher for introductions, respect privacy, and treat outreach as a supervised classroom activity.";

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

function setReplaceHumanSearchLoading(loading, isAnotherSearch) {
  const loadEl = document.getElementById("replaceHumanSearchLoading");
  const msgEl = document.getElementById("replaceHumanSearchLoadingMessage");
  const subEl = document.getElementById("replaceHumanSearchLoadingSub");
  const overlay = document.getElementById("replaceHumanEditorOverlay");
  const panel = document.querySelector(".replace-human-editor-panel");
  if (msgEl) {
    const g = getCouncilGradeLevelForUi();
    const k8 = g === "6-8";
    msgEl.textContent = k8
      ? isAnotherSearch
        ? "Finding another community member…"
        : "Searching school community…"
      : isAnotherSearch
        ? "Finding another contact…"
        : "Searching for a local expert…";
  }
  if (subEl) {
    const g = getCouncilGradeLevelForUi();
    const k8 = g === "6-8";
    subEl.textContent = k8
      ? "Matching your project theme to school-community profiles (demo roster). This can take a little while—please wait."
      : "Using your project, location, and this seat’s role. This can take a little while—please wait.";
  }
  if (loadEl) {
    loadEl.hidden = !loading;
    loadEl.setAttribute("aria-hidden", loading ? "false" : "true");
  }
  if (overlay) overlay.setAttribute("aria-busy", loading ? "true" : "false");
  if (panel) panel.classList.toggle("replace-human-editor-panel--searching", loading);
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
  const isAnother = replaceHumanSearchSessionExcluded.length > 0;
  if (btn) btn.disabled = true;
  setReplaceHumanSearchLoading(true, isAnother);
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
        gradeLevel: getCouncilGradeLevelForUi(),
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
    const rhEmailPrompts = document.getElementById("rhEmailPromptsToMember");
    if (rhEmailPrompts) rhEmailPrompts.checked = false;
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
    setReplaceHumanSearchLoading(false, false);
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

function councilPromptMaxChars(project) {
  const g = String(project?.gradeLevel ?? "6-8").trim();
  return g === "Uni+" ? 288 : 144;
}

function getCouncilGradeLevelForUi() {
  if (APP_KIND === "custom" && customCouncilProject?.gradeLevel) {
    return String(customCouncilProject.gradeLevel).trim();
  }
  return "6-8";
}

function usesDailyPromptLimit() {
  const g = getCouncilGradeLevelForUi();
  return g === "6-8" || g === "HS";
}

function dailyPromptStorageKey() {
  const today = new Date().toISOString().slice(0, 10);
  const scope =
    APP_KIND === "custom" && customCouncilProject?.id != null
      ? `custom-${customCouncilProject.id}`
      : "golden-record";
  return `konsult-daily-prompts-${today}-${scope}`;
}

function getDailyPromptsUsed() {
  if (!usesDailyPromptLimit()) return 0;
  try {
    const n = parseInt(localStorage.getItem(dailyPromptStorageKey()) || "0", 10);
    return Number.isFinite(n) ? Math.min(DAILY_PROMPT_LIMIT, Math.max(0, n)) : 0;
  } catch {
    return 0;
  }
}

function incrementDailyPromptsUsed() {
  if (!usesDailyPromptLimit()) return;
  try {
    localStorage.setItem(dailyPromptStorageKey(), String(getDailyPromptsUsed() + 1));
  } catch {
    /* ignore */
  }
  applyDailyPromptLimitUi();
}

function decrementDailyPromptsUsed() {
  if (!usesDailyPromptLimit()) return;
  try {
    localStorage.setItem(dailyPromptStorageKey(), String(Math.max(0, getDailyPromptsUsed() - 1)));
  } catch {
    /* ignore */
  }
  applyDailyPromptLimitUi();
}

function dailyPromptsExhausted() {
  return usesDailyPromptLimit() && getDailyPromptsUsed() >= DAILY_PROMPT_LIMIT;
}

function updatePromptSessionChecks() {
  if (!promptSessionChecks) return;
  const used = getDailyPromptsUsed();
  promptSessionChecks.querySelectorAll(".prompt-session-check").forEach((el, idx) => {
    el.classList.toggle("prompt-session-check--used", idx < used);
  });
}

function applyDailyPromptLimitUi() {
  if (!usesDailyPromptLimit()) {
    if (promptSessionRow) promptSessionRow.hidden = true;
    if (promptInput) {
      promptInput.disabled = false;
      if (!promptInput.placeholder || promptInput.placeholder === PROMPT_EXHAUSTED_PLACEHOLDER) {
        promptInput.placeholder = PROMPT_INPUT_DEFAULT_PLACEHOLDER;
      }
    }
    if (uploadBtn) uploadBtn.disabled = false;
    return;
  }

  if (promptSessionRow) promptSessionRow.hidden = false;
  updatePromptSessionChecks();

  const exhausted = dailyPromptsExhausted();
  if (promptInput) {
    promptInput.disabled = exhausted;
    promptInput.placeholder = exhausted ? PROMPT_EXHAUSTED_PLACEHOLDER : PROMPT_INPUT_DEFAULT_PLACEHOLDER;
  }
  if (uploadBtn) uploadBtn.disabled = exhausted;
  setSubmitState();
}

/** Typing animation for overlay text (faster pacing for Uni+). */
function getResponseAnimationParams() {
  if (getCouncilGradeLevelForUi() === "Uni+") {
    return {
      letterDelayMs: 11,
      sentenceEndPauseMs: 750,
      lineBreakPauseMs: 520,
    };
  }
  return {
    letterDelayMs: LETTER_DELAY_MS,
    sentenceEndPauseMs: SENTENCE_END_PAUSE_MS,
    lineBreakPauseMs: LINE_BREAK_PAUSE_MS,
  };
}

function applyFollowUpCharLimitEverywhere() {
  if (followUpInput) {
    followUpInput.maxLength = FOLLOW_UP_MAX_CHARS;
    followUpInput.setAttribute("maxlength", String(FOLLOW_UP_MAX_CHARS));
    if (followUpInput.value.length > FOLLOW_UP_MAX_CHARS) {
      followUpInput.value = followUpInput.value.slice(0, FOLLOW_UP_MAX_CHARS);
    }
  }
}

function applyCouncilPromptCharLimits() {
  applyFollowUpCharLimitEverywhere();
  if (APP_KIND !== "custom" || !customCouncilProject) return;
  const max = councilPromptMaxChars(customCouncilProject);
  if (promptInput) {
    promptInput.maxLength = max;
    promptInput.setAttribute("maxlength", String(max));
    if (promptInput.value.length > max) promptInput.value = promptInput.value.slice(0, max);
  }
  const hint = document.getElementById("promptCharHint");
  if (hint) {
    hint.hidden = false;
    hint.textContent = `Student questions: up to ${max} characters at this grade level. Follow-up questions: ${FOLLOW_UP_MAX_CHARS} characters.`;
  }
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
  updateCouncilMenuItems();
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
  syncCouncilEssentialQuestionTagline();
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
  const optionsEl = document.getElementById("phaseOptions");
  if (!optionsEl || !customCouncilProject?.phases?.length) return;
  const phases = customCouncilProject.phases;
  optionsEl.innerHTML = phases
    .map((p, i) => {
      const num = String(i + 1);
      const phaseTitle = String(p.title || "").trim();
      const active = i === 0;
      const ariaLabel = phaseTitle ? `Phase ${num}: ${phaseTitle}` : `Phase ${num}`;
      return `<button type="button" class="phase-toggle${active ? " phase-toggle--active" : ""}" data-phase="${num}" aria-label="${escapeHtml(ariaLabel)}" aria-pressed="${active ? "true" : "false"}">${num}</button>`;
    })
    .join("");
  initPhaseToggleGroup(optionsEl);
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
  updateCouncilMenuItems();
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
  const active = document.querySelector(".phase-toggle--active");
  return active?.dataset?.phase || "1";
}

function initPhaseToggleGroup(container) {
  if (!container) return;
  container.querySelectorAll(".phase-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".phase-toggle").forEach((b) => {
        b.classList.remove("phase-toggle--active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("phase-toggle--active");
      btn.setAttribute("aria-pressed", "true");
      onPhaseChange();
    });
  });
}

function setCouncilMenuOpen(open) {
  if (!councilMenuDropdown) return;
  councilMenuDropdown.hidden = !open;
  if (councilMenuBtn) councilMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

function updateCouncilMenuItems() {
  const rubricBtn = document.getElementById("viewRubricCouncilBtn");
  if (rubricBtn) rubricBtn.hidden = APP_KIND !== "custom";
}

/** Normalize ids so numeric member ids stay comparable across string/number mismatches. */
function canonicalGemId(id) {
  const n = Number(id);
  return Number.isNaN(n) ? id : n;
}

function selectionContainsGemId(selectedSet, gemId) {
  const gid = canonicalGemId(gemId);
  for (const sid of selectedSet) {
    if (canonicalGemId(sid) === gid) return true;
  }
  return false;
}

function selectionIdMatchesEnabled(enabledIds, gemId) {
  const gid = canonicalGemId(gemId);
  for (const eid of enabledIds) {
    if (canonicalGemId(eid) === gid) return true;
  }
  return false;
}

function pruneSelectionToCurrentPhase() {
  const enabledIds = getEnabledMemberIds(getProjectPhase());
  [...selectedIds].forEach((id) => {
    if (!selectionIdMatchesEnabled(enabledIds, id)) selectedIds.delete(id);
  });
}

function toggleGemSelection(gemId) {
  const gid = canonicalGemId(gemId);
  let existing = null;
  for (const sid of selectedIds) {
    if (canonicalGemId(sid) === gid) {
      existing = sid;
      break;
    }
  }
  if (existing !== null) selectedIds.delete(existing);
  else selectedIds.add(gid);
}

const PHASE_MILESTONE_LABELS = {
  1: "Community Charter",
  2: "Artifact Curation",
  3: "Logistics Audit",
  4: "Golden Record Premiere",
};

function syncPhaseMilestoneTitle() {
  const phase = getProjectPhase();
  let phaseTitle = "";
  let milestoneText = "";

  if (APP_KIND === "custom" && customCouncilProject && Array.isArray(customCouncilProject.phases)) {
    const idx = Number(phase) - 1;
    const p = customCouncilProject.phases[idx];
    if (p) {
      phaseTitle = String(p.title || "").trim() || `Phase ${phase}`;
      milestoneText = String(p.description || "").trim() || "—";
    } else {
      phaseTitle = `Phase ${phase}`;
      milestoneText = "—";
    }
  } else {
    phaseTitle = PHASE_MILESTONE_LABELS[phase] || PHASE_MILESTONE_LABELS[1];
    milestoneText = phaseTitle;
  }

  if (phaseProjectTitle) phaseProjectTitle.textContent = phaseTitle;
  if (phaseMilestoneTitle) phaseMilestoneTitle.textContent = phaseTitle;
  if (phaseMilestoneBannerText) phaseMilestoneBannerText.textContent = milestoneText;
}

function syncCouncilEssentialQuestionTagline() {
  const el = document.getElementById("councilTagline");
  if (!el) return;
  if (APP_KIND !== "custom" || !customCouncilProject) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  const eq = String(customCouncilProject.essentialQuestion || "").trim();
  el.textContent = eq;
  el.hidden = !eq;
}

function setCouncilPageTitle(text) {
  const titleEl = document.getElementById("councilPageTitle");
  if (titleEl) titleEl.textContent = text || "Your PBL Council";
  if (typeof document !== "undefined" && document.title) {
    document.title = text ? `${text} — Council` : "Your PBL Council";
  }
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = "status " + type;
}

function setSubmitState() {
  const hasSelection = selectedIds.size > 0;
  const hasPrompt = promptInput.value.trim().length > 0;
  const hasAttachments = attachments.length > 0;
  const limitBlocked = dailyPromptsExhausted();
  submitBtn.disabled = limitBlocked || !hasSelection || (!hasPrompt && !hasAttachments);
  selectionHint.textContent = hasSelection
    ? `${selectedIds.size} member${selectedIds.size === 1 ? "" : "s"} selected`
    : "Select at least one member";
}

function renderGems() {
  const phase = getProjectPhase();
  const enabledIds = getEnabledMemberIds(phase);
  gemsGrid.innerHTML = "";
  gems.forEach((gem) => {
    const enabled = selectionIdMatchesEnabled(enabledIds, gem.id);
    const card = document.createElement("div");
    const isHuman = APP_KIND === "custom" && gem.isHuman;
    card.className =
      "gem-card" +
      (selectionContainsGemId(selectedIds, gem.id) ? " selected" : "") +
      (enabled ? "" : " disabled") +
      (isHuman ? " gem-card-human" : "");
    card.dataset.colorIndex = String(((Number(gem.id) - 1) % 5) + 1);
    const imgSrc = gemThumbSrc(gem.image);
    const pollinationsThumb = /^https?:\/\/image\.pollinations\.ai\//i.test(imgSrc);
    const imgHtml = imgSrc
      ? `<img class="gem-card-thumb" src="${escapeHtml(imgSrc)}" alt="" loading="${pollinationsThumb ? "eager" : "lazy"}" />`
      : "";
    const replaceHumanBtnSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    const replaceHumanBtnLabel = isHuman ? "Edit human council member profile" : "Replace with human council member";
    const replaceHumanBtnHtml =
      enabled && APP_KIND === "custom"
        ? `<button type="button" class="gem-replace-human-hit" data-replace-human-gem="${gem.id}" title="${replaceHumanBtnLabel}" aria-label="${replaceHumanBtnLabel}">${replaceHumanBtnSvg}</button>`
        : "";

    if (isHuman) {
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
        replaceHumanGemId = gem.id;
        openReplaceHumanEditor();
      });
      if (enabled) {
        card.addEventListener("click", (e) => {
          if (e.target.closest(".gem-replace-human-hit")) return;
          toggleGemSelection(gem.id);
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
        toggleGemSelection(gem.id);
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

/** Display name in response card headers: suffix for AI members only. */
function formatResponseCardMemberName(displayName, gem) {
  const base = String(displayName || "").trim();
  const isHuman = gem && gem.isHuman === true;
  if (isHuman) return base || "—";
  return base ? `${base} (AI Council Member)` : "AI Council Member";
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
  const mdToHtml =
    typeof markdownInlineToHtml === "function" ? markdownInlineToHtml : (s) => escapeHtml(String(s ?? ""));
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
      out +=
        '<a class="response-text-link" href="' +
        escapeHtml(normalizeUrl(p.url)) +
        '" target="_blank" rel="noopener noreferrer">' +
        mdToHtml(p.text || p.url) +
        "</a>";
      continue;
    }
    const segments = extractUrlSegments(p.value);
    for (const s of segments) {
      if (s.type === "url") {
        out +=
          '<a class="response-text-link" href="' +
          escapeHtml(s.value) +
          '" target="_blank" rel="noopener noreferrer">' +
          escapeHtml(s.value) +
          "</a>";
      } else {
        out += mdToHtml(s.value);
      }
    }
  }
  return out || mdToHtml(text);
}

/** Multi-line overlay follow-ups: line breaks plus * / ** on each line. */
function markdownFollowUpToHtml(text) {
  if (text == null || text === "") return "";
  if (typeof markdownInlineToHtml !== "function") return escapeHtml(text);
  return String(text)
    .split("\n")
    .map((line) => markdownInlineToHtml(line))
    .join("<br />");
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
  const emailPromptsEl = document.getElementById("rhEmailPromptsToMember");
  const phoneEl = document.getElementById("rhPhone");
  const webEl = document.getElementById("rhWebsite");
  const urlEl = document.getElementById("rhProfileUrl");
  const hc = mm?.humanContact && typeof mm.humanContact === "object" ? mm.humanContact : {};
  const editingHuman = !!(gem?.isHuman && mm?.isHuman);
  if (nameEl) nameEl.value = String(hc.name || gem?.name || mm?.name || "").trim();
  if (titleEl) titleEl.value = String(hc.title || gem?.jobTitle || mm?.jobTitle || "").trim();
  if (orgEl) orgEl.value = String(hc.organization || "").trim();
  if (emailEl) emailEl.value = String(hc.email || "").trim();
  if (emailPromptsEl) emailPromptsEl.checked = !!hc.emailPromptsToMember;
  if (phoneEl) phoneEl.value = String(hc.phone || "").trim();
  if (webEl) webEl.value = String(hc.website || "").trim();
  const portrait = String(mm?.image || gem?.image || "").trim();
  if (urlEl) {
    if (
      editingHuman &&
      /^https?:\/\//i.test(portrait) &&
      !/ui-avatars\.com\/api\//i.test(portrait)
    ) {
      urlEl.value = portrait;
    } else {
      urlEl.value = "";
    }
  }
  updateReplaceHumanProfilePreview(portrait);
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
  const wasAlreadyHuman = !!mm.isHuman;
  const name = document.getElementById("rhName")?.value?.trim() || "";
  if (!name) {
    setStatus("Enter a name for the human council member.", "error");
    return;
  }
  const title = document.getElementById("rhTitle")?.value?.trim() || "";
  const organization = document.getElementById("rhOrganization")?.value?.trim() || "";
  const email = document.getElementById("rhEmail")?.value?.trim() || "";
  const emailPromptsToMember = !!document.getElementById("rhEmailPromptsToMember")?.checked;
  const phone = document.getElementById("rhPhone")?.value?.trim() || "";
  const website = document.getElementById("rhWebsite")?.value?.trim() || "";
  const url = document.getElementById("rhProfileUrl")?.value?.trim() || "";
  let image = "";
  if (replaceHumanPendingImage) image = replaceHumanPendingImage;
  else if (/^https?:\/\//i.test(url) || String(url).startsWith("data:")) image = url;
  if (!image && wasAlreadyHuman && String(mm.image || "").trim()) {
    image = String(mm.image).trim();
  }
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
  const gradeLevel = getCouncilGradeLevelForUi();
  mm.systemInstruction =
    gradeLevel === "6-8"
      ? HUMAN_ADVISOR_SCHOOL_COMMUNITY_INSTRUCTION
      : HUMAN_ADVISOR_SYSTEM_INSTRUCTION;
  mm.humanContact = {
    name,
    title,
    organization,
    phone,
    email,
    website,
    emailPromptsToMember,
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
  setStatus(
    wasAlreadyHuman ? "Human council member profile updated." : "This seat is now a human council member.",
    "success"
  );
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
  if (typeof tokenizeMarkdownLineForCouncil === "function") return tokenizeMarkdownLineForCouncil(line);
  const tokens = [];
  const re = /\*\*[^*]+\*\*|\*[^*]+\*|[^\s*]+|\s+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const seg = m[0];
    if (/^\s+$/.test(seg)) continue;
    if (/^\*\*[^*]+\*\*$/.test(seg)) {
      tokens.push({ type: "word", text: seg.slice(2, -2), bold: true, italic: false });
    } else if (/^\*[^*]+\*$/.test(seg)) {
      tokens.push({ type: "word", text: seg.slice(1, -1), bold: false, italic: true });
    } else {
      tokens.push({ type: "word", text: seg, bold: false, italic: false });
    }
  }
  return tokens;
}

/** Normalize model output: max one blank line between blocks, trim trailing spaces per line. */
function preprocessChatResponseText(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.replace(/\r\n/g, "\n");
  s = s.replace(/\n[ \t]+\n/g, "\n\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s
    .split("\n")
    .map((ln) => ln.trimEnd().replace(/[ \t]{2,}/g, " "))
    .join("\n")
    .trimEnd();
}

function tokenizeForAnimation(text) {
  const body = preprocessChatResponseText(text);
  if (!body) return [];
  const tokens = [];
  const lines = body.split("\n");
  for (let li = 0; li < lines.length; li++) {
    const rawLine = lines[li];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const md = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (md) {
      const headerInner = (md[2] || "").trim();
      if (headerInner) {
        tokens.push({ type: "header", text: headerInner, mdHeading: true });
      }
      continue;
    }
    const line = trimmed.replace(/[ \t]{2,}/g, " ");
    const isShort = line.length < 40;
    const noSentenceEnd = !/[.?!:]$/.test(line);
    if (isShort && noSentenceEnd) {
      tokens.push({ type: "header", text: line, mdHeading: false });
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

function animateResponseText(container, text, animation = {}) {
  if (!container) return Promise.resolve();
  const letterDelay = animation.letterDelayMs ?? LETTER_DELAY_MS;
  const sentencePause = animation.sentenceEndPauseMs ?? SENTENCE_END_PAUSE_MS;
  const lineBreakPause = animation.lineBreakPauseMs ?? LINE_BREAK_PAUSE_MS;
  container.innerHTML = "";
  const tokens = tokenizeForAnimation(text);
  if (!tokens.length) return Promise.resolve();

  return new Promise((resolve) => {
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

    function afterToken(delayMs) {
      if (i >= tokens.length) {
        resolve();
        return;
      }
      if (delayMs != null) setTimeout(scheduleNext, delayMs);
      else scheduleNext();
    }

    function scheduleNext() {
      if (i >= tokens.length) {
        resolve();
        return;
      }
      setTimeout(appendNext, getWordDelayMs());
    }

    function appendNext() {
      if (i >= tokens.length) {
        resolve();
        return;
      }
      const t = tokens[i];
      i++;
      lastAppendedToken = t;

      if (t.type === "header") {
        needSpace = false;
        bulletNext = false;
        previousWordEndedWithQuestion = false;
        const headerText = (t.text || "").trim();
        const rich =
          typeof markdownInlineToHtml === "function" &&
          /\*\*|\*(?!\*)/.test(headerText);
        if (rich) {
          const pr = document.createElement("p");
          pr.className =
            "response-overlay-section-header" +
            (t.mdHeading ? " response-overlay-md-heading" : "") +
            (isFollowUpCommunityHeader(t.text) ? " response-overlay-followup-community" : "");
          if (/[?]$/.test(headerText)) {
            const bullet = document.createElement("span");
            bullet.className = "response-overlay-bullet";
            bullet.textContent = "• ";
            pr.appendChild(bullet);
          }
          const inner = document.createElement("span");
          inner.innerHTML = markdownInlineToHtml(headerText);
          pr.appendChild(inner);
          container.appendChild(pr);
          container.appendChild(document.createElement("br"));
          lastWasFollowUpHeader = isFollowUpCommunityHeader(t.text);
          scrollToBottom();
          afterToken(sentencePause);
          return;
        }
        const p = document.createElement("p");
        p.className =
          "response-overlay-section-header" +
          (t.mdHeading ? " response-overlay-md-heading" : "") +
          (isFollowUpCommunityHeader(t.text) ? " response-overlay-followup-community" : "");
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
            afterToken(sentencePause);
            return;
          }
          textNode.textContent += headerText[hIdx++];
          scrollToBottom();
          setTimeout(headerTick, letterDelay);
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
        afterToken(lineBreakPause);
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
          afterToken(25);
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
            afterToken();
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
            const delay = /[.!?]/.test(ch) ? sentencePause : letterDelay;
            setTimeout(tick, delay);
          }
          tick();
        }
        onSegmentDone();
        return;
      }
      afterToken();
    }

    appendNext();
  });
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
      const headerText = (t.text || "").trim();
      const rich =
        typeof markdownInlineToHtml === "function" &&
        /\*\*|\*(?!\*)/.test(headerText);
      const p = document.createElement("p");
      p.className =
        "response-overlay-section-header" +
        (t.mdHeading ? " response-overlay-md-heading" : "") +
        (isFollowUpCommunityHeader(t.text) ? " response-overlay-followup-community" : "");
      if (rich) {
        if (/[?]$/.test(headerText)) {
          const bullet = document.createElement("span");
          bullet.className = "response-overlay-bullet";
          bullet.textContent = "• ";
          p.appendChild(bullet);
        }
        const inner = document.createElement("span");
        inner.innerHTML = markdownInlineToHtml(headerText);
        p.appendChild(inner);
      } else if (/[?]$/.test(headerText)) {
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
  stopAllCouncilCardWaiting();
}

const COUNCIL_MEMBER_WAITING_PHRASES = [
  "Listening…",
  "Considering alternate viewpoints…",
  "Taking notes…",
  "Organizing thoughts…",
  "Weighing the evidence…",
  "Finding a distinct angle…",
  "Reflecting on the question…",
  "Preparing a response…",
  "Considering what others said…",
  "Thinking it through…",
  "Looking for a fresh lens…",
  "Connecting ideas…",
];

const councilCardWaitingIntervals = new Map();

function orderCouncilMemberIdsForTurn(ids) {
  return [...ids].sort((a, b) => Number(a) - Number(b));
}

function stopCouncilCardWaiting(gemId) {
  const key = Number(gemId);
  const timer = councilCardWaitingIntervals.get(key);
  if (timer) clearInterval(timer);
  councilCardWaitingIntervals.delete(key);
}

function stopAllCouncilCardWaiting() {
  for (const key of [...councilCardWaitingIntervals.keys()]) {
    stopCouncilCardWaiting(key);
  }
}

function getResponseOverlayCard(gemId) {
  return responsesOverlayGrid?.querySelector(`.response-overlay-card[data-gem-id="${Number(gemId)}"]`);
}

function setCouncilCardThinking(gemId) {
  stopCouncilCardWaiting(gemId);
  const textEl = getResponseOverlayCard(gemId)?.querySelector(".response-overlay-text");
  if (!textEl) return;
  textEl.classList.remove("response-overlay-text--waiting");
  textEl.classList.add("response-overlay-text--thinking");
  textEl.textContent = "Thinking…";
}

function startCouncilCardWaiting(gemId) {
  stopCouncilCardWaiting(gemId);
  const textEl = getResponseOverlayCard(gemId)?.querySelector(".response-overlay-text");
  if (!textEl) return;
  textEl.classList.remove("response-overlay-text--thinking");
  textEl.classList.add("response-overlay-text--waiting");
  let i = 0;
  textEl.textContent = COUNCIL_MEMBER_WAITING_PHRASES[0];
  const timer = setInterval(() => {
    i = (i + 1) % COUNCIL_MEMBER_WAITING_PHRASES.length;
    if (textEl.classList.contains("response-overlay-text--waiting")) {
      textEl.textContent = COUNCIL_MEMBER_WAITING_PHRASES[i];
    }
  }, 2400);
  councilCardWaitingIntervals.set(Number(gemId), timer);
}

function appendResponseOverlayCardActions(card, { gemId, name, response, error, showSaveButton, gFound }) {
  const actionsEl = card.querySelector(".response-overlay-actions");
  if (!actionsEl || actionsEl.dataset.actionsBound === "1") return;
  let bound = false;
  if (showSaveButton) {
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn-save response-overlay-btn";
    saveBtn.textContent = "Save Response";
    saveBtn.addEventListener("click", () => {
      document.querySelectorAll(".response-overlay-save-feedback").forEach((el) => {
        el.textContent = "";
        el.hidden = true;
      });
      saveCurrentChat();
    });
    actionsEl.appendChild(saveBtn);
    bound = true;
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
    const saveFeedback = document.createElement("span");
    saveFeedback.className = "response-overlay-save-feedback";
    saveFeedback.hidden = true;
    saveFeedback.setAttribute("aria-live", "polite");
    actionsEl.appendChild(saveFeedback);
    bound = true;
  }
  if (bound) actionsEl.dataset.actionsBound = "1";
}

async function finishCouncilOverlayCard(gemId, result, { jobTitleMap = {}, animate = true, showSaveButton = true }) {
  stopCouncilCardWaiting(gemId);
  const card = getResponseOverlayCard(gemId);
  if (!card) return;
  const gFound = gems.find((g) => Number(g.id) === Number(gemId));
  const name = result.name || gFound?.name || "Advisor";
  const body = card.querySelector(".response-overlay-card-body");
  let textEl = card.querySelector(".response-overlay-text");
  const animParams = getResponseAnimationParams();

  if (result.error) {
    card.querySelector(".response-overlay-error")?.remove();
    if (textEl) textEl.remove();
    const errP = document.createElement("p");
    errP.className = "response-overlay-error";
    errP.textContent = result.error;
    body?.appendChild(errP);
  } else if (body) {
    card.querySelector(".response-overlay-error")?.remove();
    if (!textEl) {
      textEl = document.createElement("div");
      textEl.className = "response-overlay-text";
      textEl.setAttribute("role", "article");
      body.appendChild(textEl);
    }
    textEl.classList.remove("response-overlay-text--waiting", "response-overlay-text--thinking");
    if (animate) await animateResponseText(textEl, result.response || "", animParams);
    else renderResponseTextStatic(textEl, result.response || "");
  }

  appendResponseOverlayCardActions(card, {
    gemId,
    name,
    response: result.response,
    error: result.error,
    showSaveButton,
    gFound,
  });
}

function initSequentialCouncilOverlay(orderedIds, jobTitleMap) {
  const shells = orderedIds.map((id) => {
    const g = gems.find((x) => Number(x.id) === Number(id));
    return {
      gemId: id,
      name: g?.name || "Advisor",
      jobTitle: g?.jobTitle || jobTitleMap[g?.name] || "",
      response: null,
      error: null,
    };
  });
  openResponsesOverlay(shells, { showSaveButton: false, jobTitleMap, animate: false });
  orderedIds.forEach((id, i) => {
    if (i === 0) setCouncilCardThinking(id);
    else startCouncilCardWaiting(id);
  });
}

async function fetchCouncilChatTurn({ memberId, bodyBase, priorCouncilResponses }) {
  const payload = chatPayload({
    ...bodyBase,
    selectedGems: [memberId],
    ...(priorCouncilResponses?.length ? { priorCouncilResponses } : {}),
  });
  const res = await fetch(APP_KIND === "custom" ? "/api/chat/custom" : "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  const row =
    (data.results || []).find((r) => Number(r.gemId) === Number(memberId)) || (data.results || [])[0];
  if (!row) throw new Error("No response from council member.");
  return row;
}

async function runSequentialCouncilChat({ orderedIds, bodyBase, jobTitleMap }) {
  initSequentialCouncilOverlay(orderedIds, jobTitleMap);
  const priorCouncilResponses = [];
  const accumulated = [];

  for (let i = 0; i < orderedIds.length; i++) {
    const memberId = orderedIds[i];
    setCouncilCardThinking(memberId);
    for (let j = i + 1; j < orderedIds.length; j++) {
      startCouncilCardWaiting(orderedIds[j]);
    }

    let result;
    try {
      result = await fetchCouncilChatTurn({
        memberId,
        bodyBase,
        priorCouncilResponses: priorCouncilResponses.length ? priorCouncilResponses : undefined,
      });
      const g = gems.find((x) => Number(x.id) === Number(memberId));
      result.jobTitle = result.jobTitle || g?.jobTitle || jobTitleMap[result.name] || "";
    } catch (err) {
      const g = gems.find((x) => Number(x.id) === Number(memberId));
      result = {
        gemId: memberId,
        name: g?.name || "Advisor",
        jobTitle: g?.jobTitle || jobTitleMap[g?.name] || "",
        response: null,
        error: err.message || String(err),
      };
    }

    await finishCouncilOverlayCard(memberId, result, { jobTitleMap, animate: true, showSaveButton: true });
    accumulated.push(result);
    if (result.response && !result.error) {
      priorCouncilResponses.push({
        gemId: memberId,
        name: result.name,
        jobTitle: result.jobTitle || "",
        response: result.response,
      });
    }
  }

  stopAllCouncilCardWaiting();
  return accumulated;
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
  if (textEl) animateResponseText(textEl, followUpText, getResponseAnimationParams());
}

function openResponsesOverlay(results, options = {}) {
  const { showSaveButton = true, jobTitleMap = {}, followUpsByGemId = {}, animate = true } = options;
  if (!responsesOverlayGrid || !responsesOverlay) return;
  responsesOverlayGrid.innerHTML = "";
  const animParams = getResponseAnimationParams();
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
          <span class="response-overlay-card-name">${escapeHtml(formatResponseCardMemberName(name, gFound))}</span>
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
        animateResponseText(textEl, response, animParams);
      } else {
        renderResponseTextStatic(textEl, response);
      }
    }
    appendResponseOverlayCardActions(card, { gemId, name, response, error, showSaveButton, gFound });
    const followUp = followUpsByGemId[gemId];
    if (followUp && followUp.length > 0) {
      const block = document.createElement("div");
      block.className = "response-overlay-followup";
      block.innerHTML = "<h4>Thoughts from others</h4>";
      const list = document.createElement("div");
      list.className = "response-overlay-followup-list";
      followUp.forEach((r) => {
        const rGem = gems.find((g) => Number(g.id) === Number(r.gemId));
        const followName = formatResponseCardMemberName(r.name, rGem);
        const fc = document.createElement("div");
        fc.className = "response-overlay-followup-item";
        fc.innerHTML = `
          <strong>${escapeHtml(followName)}</strong> ${r.jobTitle ? `<span class="response-overlay-followup-role">${escapeHtml(r.jobTitle)}</span>` : ""}
          <p class="response-overlay-followup-text">${markdownFollowUpToHtml(r.response || "")}</p>
        `;
        list.appendChild(fc);
      });
      block.appendChild(list);
      card.appendChild(block);
    }
    responsesOverlayGrid.appendChild(card);
  });
  responsesOverlay.querySelector(".responses-overlay-panel")?.classList.toggle("responses-overlay-panel--uni-plus", getCouncilGradeLevelForUi() === "Uni+");
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
    const headerName = formatResponseCardMemberName(name, gFound);
    if (error) {
      card.innerHTML = `
        <h3>${escapeHtml(headerName)}</h3>
        ${title ? `<p class="result-job-title">${escapeHtml(title)}</p>` : ""}
        <p class="response-error">${escapeHtml(error)}</p>
      `;
    } else {
      card.innerHTML = `
        <h3>${escapeHtml(headerName)}</h3>
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
        const rGem = gems.find((g) => Number(g.id) === Number(r.gemId));
        const followName = formatResponseCardMemberName(r.name, rGem);
        const fc = document.createElement("div");
        fc.className = "result-card";
        fc.innerHTML = `
          <h3>${escapeHtml(followName)}</h3>
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
      setStatus("");
      document.querySelectorAll(".response-overlay-save-feedback").forEach((el) => {
        el.textContent = "Response saved";
        el.hidden = false;
      });
    })
    .catch((err) => setStatus("Could not save: " + (err.message || "error"), "error"));
}

function openSendToOverlay(source) {
  sendToSource = source;
  sendToSelectedIds = new Set();
  const others = gems.filter((g) => Number(g.id) !== Number(source.gemId));
  sendToList.innerHTML = "";
  others.forEach((gem) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "send-to-item" + (gem.isHuman ? " send-to-item--human" : "");
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
  setCouncilMenuOpen(false);
}

function closeSendToOverlay() {
  sendToOverlay.hidden = true;
  sendToSource = null;
}

function runOpinionRequestForSendTo(sourceGemId, prompt, aiIds) {
  if (!aiIds.length) {
    sendToConfirm.disabled = false;
    return Promise.resolve();
  }
  sendToConfirm.disabled = true;
  setStatus("");
  startCouncilLoading();
  return fetch(APP_KIND === "custom" ? "/api/chat/custom" : "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      chatPayload({
        prompt,
        selectedGems: aiIds,
        opinionOnResponse: true,
      })
    ),
  })
    .then((r) => r.json())
    .then((data) => {
      if (!data.results) throw new Error(data.error || "No results");
      const jobTitleMap = {};
      gems.forEach((g) => {
        jobTitleMap[g.name] = g.jobTitle;
      });
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

function openSendToHumanNoteStep() {
  if (!pendingSendTo) return;
  const names = formatEnglishNames(pendingSendTo.humanGems.map((g) => g.name));
  const input = document.getElementById("sendToHumanNoteInput");
  if (input) {
    input.value = pendingSendTo.note || "";
    input.placeholder = `Add a note for ${names} to introduce this email.`;
  }
  const el = document.getElementById("sendToHumanNoteOverlay");
  if (el) el.hidden = false;
}

function closeSendToHumanNoteOverlay() {
  const el = document.getElementById("sendToHumanNoteOverlay");
  if (el) el.hidden = true;
}

function closeSendToHumanConfirmOverlay() {
  const el = document.getElementById("sendToHumanConfirmOverlay");
  if (el) el.hidden = true;
}

function abortSendToHumanFlow() {
  closeSendToHumanNoteOverlay();
  closeSendToHumanConfirmOverlay();
  pendingSendTo = null;
  if (sendToOverlay) sendToOverlay.hidden = false;
}

function confirmSendTo() {
  if (!sendToSource || sendToSelectedIds.size === 0) {
    closeSendToOverlay();
    return;
  }
  const sourceGemId = sendToSource.gemId;
  const prompt = sendToSource.response;
  const selectedIds = Array.from(sendToSelectedIds);
  const humanGems = [];
  const aiIds = [];
  for (const id of selectedIds) {
    const g = gems.find((x) => Number(x.id) === Number(id));
    if (!g) continue;
    if (g.isHuman) humanGems.push(g);
    else aiIds.push(id);
  }
  if (humanGems.length === 0 && aiIds.length === 0) {
    closeSendToOverlay();
    setStatus("Choose at least one member.", "error");
    return;
  }
  if (humanGems.length > 0) {
    pendingSendTo = {
      sourceGemId,
      prompt,
      humanGems,
      aiIds,
      note: "",
    };
    sendToOverlay.hidden = true;
    openSendToHumanNoteStep();
    return;
  }
  sendToConfirm.disabled = true;
  closeSendToOverlay();
  runOpinionRequestForSendTo(sourceGemId, prompt, aiIds);
}

function onSendToHumanNoteNextClick() {
  const input = document.getElementById("sendToHumanNoteInput");
  if (pendingSendTo && input) pendingSendTo.note = input.value || "";
  closeSendToHumanNoteOverlay();
  const msg = document.getElementById("sendToHumanConfirmMessage");
  if (msg && pendingSendTo) {
    const who = formatEnglishNames(pendingSendTo.humanGems.map((g) => g.name));
    msg.textContent = `Are you sure you want to send this email to ${who}? Make sure you have explained why you are sending it.`;
  }
  const el = document.getElementById("sendToHumanConfirmOverlay");
  if (el) el.hidden = false;
}

function onSendToHumanConfirmBack() {
  closeSendToHumanConfirmOverlay();
  openSendToHumanNoteStep();
}

function finalizeSendToHumanEmailFlow() {
  if (!pendingSendTo) return;
  const { sourceGemId, prompt, humanGems, aiIds, note } = pendingSendTo;
  const who = formatEnglishNames(humanGems.map((g) => g.name));
  lastHumanEmailIntroNote = String(note || "").trim();
  closeSendToHumanNoteOverlay();
  closeSendToHumanConfirmOverlay();
  pendingSendTo = null;
  sendToSource = null;
  if (sendToOverlay) sendToOverlay.hidden = true;
  setStatus(
    `Email to ${who} is not sent yet (delivery not connected). Your introductory note will be included when email is wired.`,
    "success"
  );
  if (aiIds.length > 0) {
    runOpinionRequestForSendTo(sourceGemId, prompt, aiIds);
  }
}

sendToOverlayBackdrop.addEventListener("click", closeSendToOverlay);
sendToCancel.addEventListener("click", closeSendToOverlay);
sendToConfirm.addEventListener("click", confirmSendTo);

document.getElementById("sendToHumanNoteBackdrop")?.addEventListener("click", abortSendToHumanFlow);
document.getElementById("sendToHumanNoteCancel")?.addEventListener("click", abortSendToHumanFlow);
document.getElementById("sendToHumanNoteNext")?.addEventListener("click", onSendToHumanNoteNextClick);
document.getElementById("sendToHumanConfirmBackdrop")?.addEventListener("click", onSendToHumanConfirmBack);
document.getElementById("sendToHumanConfirmBack")?.addEventListener("click", onSendToHumanConfirmBack);
document.getElementById("sendToHumanConfirmSend")?.addEventListener("click", finalizeSendToHumanEmailFlow);

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
    let question = followUpInput.value.trim();
    if (question.length > FOLLOW_UP_MAX_CHARS) question = question.slice(0, FOLLOW_UP_MAX_CHARS);
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
              selectedIds = new Set(
                (c.selectedGems || [])
                  .map((id) => canonicalGemId(id))
                  .filter((id) => !(typeof id === "number" && Number.isNaN(id)))
              );
              pruneSelectionToCurrentPhase();
              const jobTitleMap = {};
              (c.results || []).forEach((r) => { jobTitleMap[r.name] = r.jobTitle || ""; });
              renderGems();
              openResponsesOverlay(c.results || [], { showSaveButton: false, jobTitleMap, animate: false });
              updateReturnToResponseButton();
              setSubmitState();
              setCouncilMenuOpen(false);
              setStatus("Loaded saved chat.");
            });
        });
        recentChatsList.appendChild(btn);
      });
    });
}

councilMenuBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  const willOpen = councilMenuDropdown?.hidden !== false;
  setCouncilMenuOpen(willOpen);
  if (willOpen) loadRecentChats();
});

document.body.addEventListener("click", () => setCouncilMenuOpen(false));

councilMenuDropdown?.addEventListener("click", (e) => e.stopPropagation());

async function submit() {
  const prompt = promptInput.value.trim();
  const enabledIds = getEnabledMemberIds(getProjectPhase());
  const idsToSend = Array.from(selectedIds).filter((id) => selectionIdMatchesEnabled(enabledIds, id));
  if (idsToSend.length === 0) {
    if (selectedIds.size > 0) {
      setStatus("None of the selected members are active for this project phase. Change phase or select members who are active now.", "error");
    }
    return;
  }
  if (!prompt && attachments.length === 0) return;
  if (dailyPromptsExhausted()) return;

  submitBtn.classList.add("loading");
  submitBtn.disabled = true;
  setStatus("");
  resultsSection.hidden = true;
  if (returnToResponseBtn) returnToResponseBtn.hidden = true;
  const orderedIdsPreview = orderCouncilMemberIdsForTurn(idsToSend);
  if (orderedIdsPreview.length <= 1) startCouncilLoading();

  let promptSlotCounted = false;
  incrementDailyPromptsUsed();
  promptSlotCounted = true;

  try {
    const bodyBase = {
      prompt: prompt || "(See attached files.)",
      attachments: attachments.length > 0 ? attachments.map((a) => ({ name: a.name, mimeType: a.mimeType, data: a.data })) : undefined,
    };
    const jobTitleMap = {};
    gems.forEach((g) => {
      jobTitleMap[g.name] = g.jobTitle;
    });
    const orderedIds = orderCouncilMemberIdsForTurn(idsToSend);

    if (orderedIds.length > 1) {
      lastPrompt = prompt || "(Attached files)";
      lastSelectedGems = idsToSend;
      lastResults = await runSequentialCouncilChat({ orderedIds, bodyBase, jobTitleMap });
      attachments = [];
      renderAttachments();
      updateReturnToResponseButton();
      setStatus(`Done. ${lastResults.length} response(s).`, "success");
    } else {
      const res = await fetch(APP_KIND === "custom" ? "/api/chat/custom" : "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatPayload({ ...bodyBase, selectedGems: orderedIds })),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (promptSlotCounted) {
          decrementDailyPromptsUsed();
          promptSlotCounted = false;
        }
        setStatus(data.error || "Request failed", "error");
        return;
      }
      lastPrompt = prompt || "(Attached files)";
      lastSelectedGems = idsToSend;
      lastResults = data.results || [];
      attachments = [];
      renderAttachments();
      lastResults.forEach((r) => {
        r.jobTitle = jobTitleMap[r.name] || r.jobTitle;
      });
      openResponsesOverlay(lastResults, { showSaveButton: true, jobTitleMap, animate: true });
      updateReturnToResponseButton();
      setStatus(`Done. ${lastResults.length} response(s).`, "success");
    }
  } catch (err) {
    if (promptSlotCounted) decrementDailyPromptsUsed();
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
      window.location.href = "/home.html";
      return;
    }
    maybeMigrateCouncilPortraits();
    const title = customCouncilProject.projectTitle || "Your AI Council";
    setCouncilPageTitle(title);
    buildPhaseSectionFromProject();
    syncCouncilEssentialQuestionTagline();
    gems = customCouncilProject.members.map((m) => ({
      id: m.id,
      name: m.name,
      jobTitle: m.jobTitle,
      image: m.image || null,
      isHuman: !!m.isHuman,
    }));
    selectedIds = new Set();
    pruneSelectionToCurrentPhase();
    renderGems();
    syncPhaseMilestoneTitle();
    setSubmitState();
    if (viewRubricCouncilBtn) viewRubricCouncilBtn.hidden = false;
    updateCouncilMenuItems();
    applyCouncilPromptCharLimits();
    applyDailyPromptLimitUi();
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
  pruneSelectionToCurrentPhase();
  renderGems();
  syncPhaseMilestoneTitle();
  setSubmitState();
  syncCouncilEssentialQuestionTagline();
  applyDailyPromptLimitUi();
}

function onPhaseChange() {
  pruneSelectionToCurrentPhase();
  syncPhaseMilestoneTitle();
  renderGems();
  setSubmitState();
  updateRubricCouncilButton();
}

initPhaseToggleGroup(document.getElementById("phaseOptions"));
updateCouncilMenuItems();

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
  const stHumanConfirm = document.getElementById("sendToHumanConfirmOverlay");
  const stHumanNote = document.getElementById("sendToHumanNoteOverlay");
  const st = sendToOverlay;
  if (stHumanConfirm && !stHumanConfirm.hidden) {
    onSendToHumanConfirmBack();
    e.preventDefault();
    return;
  }
  if (stHumanNote && !stHumanNote.hidden) {
    abortSendToHumanFlow();
    e.preventDefault();
    return;
  }
  if (st && !st.hidden) {
    closeSendToOverlay();
    e.preventDefault();
    return;
  }
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
applyFollowUpCharLimitEverywhere();
