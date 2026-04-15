const STORAGE_KEY = "aiCouncilSavedProjects";
const DRAFT_STORAGE_KEY = "aiCouncilTemplateDrafts";
/** ~330KB file as base64 — keeps localStorage under typical limits */
const MAX_EMBEDDED_BRIEF_BASE64_LEN = 450000;

let currentDraftId = null;

function setCreatorLoading(show, message, subtext) {
  const ov = document.getElementById("creatorLoadingOverlay");
  const msg = document.getElementById("creatorLoadingMessage");
  const sub = document.getElementById("creatorLoadingSub");
  if (!ov) return;
  if (show) {
    if (msg && message) msg.textContent = message;
    if (sub) {
      sub.textContent = subtext || "The assistant is processing your request.";
      sub.hidden = false;
    }
  }
  ov.hidden = !show;
  ov.setAttribute("aria-busy", show ? "true" : "false");
}

const state = {
  useCaptainPlanetPortraits: false,
  objectives: ["", ""],
  phases: [
    { title: "", description: "" },
    { title: "", description: "" },
    { title: "", description: "" },
    { title: "", description: "" },
  ],
  members: [],
  memberCount: 4,
  supportingMeta: [],
  settings: {
    pacingAlerts: false,
    reflectionLogs: false,
    familyPortal: false,
    collaborationMode: false,
  },
  /** Embedded brief from a loaded draft when file input cannot be repopulated */
  draftBriefAttachment: null,
};

function escapeHtml(s) {
  if (s == null) return "";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/** Unisex / ambiguous given names → neutral portrait cues */
const PORTRAIT_AMBIGUOUS_NAMES = new Set([
  "alex", "avery", "blair", "cameron", "casey", "corey", "devon", "drew", "ellis", "frankie",
  "harper", "jamie", "jordan", "kendall", "kim", "lee", "logan", "morgan", "parker", "pat", "quinn",
  "reese", "remy", "riley", "robin", "rowan", "sam", "skyler", "sydney", "taylor", "terry",
]);

const PORTRAIT_FEMALE_NAMES = new Set([
  "ada", "aida", "aisha", "alicia", "alina", "allison", "alyssa", "amanda", "amelia", "amy", "ana",
  "andrea", "angela", "anna", "anne", "aria", "ashley", "astrid", "athena", "audrey", "ava", "beatrice",
  "beth", "brenda", "brianna", "bridget", "carla", "carmen", "carol", "caroline", "catherine", "charlotte",
  "chloe", "claire", "danielle", "diana", "donna", "elena", "elizabeth", "ella", "ellen", "emily", "emma",
  "erica", "erin", "esther", "eva", "evelyn", "fatima", "fiona", "gabriela", "grace", "greta", "hannah",
  "heather", "helen", "helena", "henrietta", "holly", "iris", "isabel", "isabella", "ivy", "jade",
  "jane", "janet", "jasmine", "jennifer", "jessica", "joan", "julia", "julie", "june", "karen", "kate",
  "katherine", "katie", "kayla", "kelly", "kimberly", "laura", "lauren", "layla", "leah", "lena", "lily",
  "linda", "lisa", "lucy", "lydia", "margaret", "maria", "marie", "marina", "martha", "mary", "maya",
  "megan", "melissa", "mia", "michelle", "min", "molly", "monica", "naomi", "natalie", "nicole", "nina",
  "nora", "olivia", "patricia", "priya", "rachel", "rebecca", "rosa", "rose", "ruby", "ruth", "sandra",
  "sara", "sarah", "sophia", "sophie", "stella", "stephanie", "susan", "tamara", "tanya", "tara", "theresa",
  "valerie", "vanessa", "vera", "victoria", "violet", "vivian", "wendy", "yasmin", "yuki", "zoe", "zara",
]);

const PORTRAIT_MALE_NAMES = new Set([
  "adam", "ahmed", "ahsan", "alan", "albert", "alejandro", "alexander", "ali", "allen", "andre", "andrew",
  "anthony", "antonio", "arthur", "benjamin", "brian", "bruce", "carl", "carlos", "charles", "chris",
  "christopher", "craig", "daniel", "darnell", "david", "derek", "diego", "donald", "douglas", "edward",
  "eric", "ethan", "eugene", "felix", "francisco", "frank", "fred", "gary", "george", "gerald", "gregory",
  "harold", "harry", "henry", "howard", "ian", "isaac", "jack", "jacob", "james", "jason", "jeffrey",
  "jeremy", "jerry", "jesse", "jim", "joe", "john", "jonathan", "jorge", "jose", "joseph", "joshua",
  "juan", "justin", "keith", "kenneth", "kevin", "larry", "lawrence", "liam", "louis", "lucas", "marcus",
  "mark", "martin", "marvin", "matthew", "michael", "miguel", "mohammed", "nathan", "nelson", "nicholas",
  "noah", "omar", "oscar", "patrick", "paul", "pedro", "peter", "philip", "ralph", "raymond", "richard",
  "robert", "roger", "ronald", "ross", "roy", "ryan", "samuel", "scott", "sean", "stephen", "steven",
  "thomas", "timothy", "tyler", "victor", "vincent", "walter", "wayne", "william", "wolfgang", "zac",
  "zachary",
]);

function firstGivenNameToken(name) {
  if (!name || typeof name !== "string") return "";
  const cleaned = name.replace(/^[^a-zA-Z]+/, "").trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/[\s,]+/).filter(Boolean);
  if (!parts.length) return "";
  let first = parts[0].replace(/[^a-zA-Z'-]/g, "").toLowerCase().replace(/\.+$/, "");
  const honor = new Set(["dr", "prof", "mr", "mrs", "ms", "mx", "sir", "madam"]);
  if (honor.has(first) && parts.length > 1) {
    first = parts[1].replace(/[^a-zA-Z'-]/g, "").toLowerCase().replace(/\.+$/, "");
  }
  return first;
}

function parsePortraitGender(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "female" || s === "woman" || s === "f") return "female";
  if (s === "male" || s === "man" || s === "m") return "male";
  if (s === "neutral" || s === "nonbinary" || s === "nb" || s === "enby" || s === "none") return "neutral";
  return null;
}

function inferPortraitGenderFromName(name) {
  const first = firstGivenNameToken(name);
  if (!first) return "neutral";
  if (PORTRAIT_AMBIGUOUS_NAMES.has(first)) return "neutral";
  if (PORTRAIT_MALE_NAMES.has(first)) return "male";
  if (PORTRAIT_FEMALE_NAMES.has(first)) return "female";
  return "neutral";
}

function effectivePortraitGender(stored, name) {
  return parsePortraitGender(stored) ?? inferPortraitGenderFromName(name);
}

function portraitGenderPromptCue(gender) {
  if (gender === "female") {
    return "adult woman mentor, clearly feminine face and styling appropriate for a 90s cartoon heroine";
  }
  if (gender === "male") {
    return "adult man mentor, clearly masculine face and styling appropriate for a 90s cartoon hero";
  }
  return "adult mentor with soft, inclusive androgynous presentation (avoid strong gender stereotypes)";
}

function getEssentialQuestion() {
  return document.getElementById("essentialQuestion")?.value?.trim() || "";
}

function avatarUrl(seed) {
  const s = encodeURIComponent((seed || "council").slice(0, 40));
  return `https://api.dicebear.com/7.x/notionists/svg?seed=${s}`;
}

function uiAvatarsUrl(name) {
  const label = encodeURIComponent((name || "Advisor").slice(0, 42));
  return `https://ui-avatars.com/api/?name=${label}&size=320&background=1e3a5f&color=fff`;
}

function normalizeExpertApi(j) {
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

function expertDedupeKey(raw) {
  if (!raw) return "";
  const n = normalizeExpertApi(raw);
  const nameT = (n.name || String(raw.displayName || "").trim()).trim();
  const orgT = (n.organization || String(raw.organization || "").trim()).trim();
  if (!nameT && !orgT) return "";
  return [nameT, orgT].filter(Boolean).join(" | ");
}

function normalizeMemberHumanFields(m) {
  if (!m) return;
  if (!Array.isArray(m.excludedLocalExperts)) m.excludedLocalExperts = [];
  if (!m.humanContact) m.humanContact = { name: "", title: "", phone: "", email: "", website: "" };
  if (m.humanContact.organization === undefined) m.humanContact.organization = "";
}

function getExcludeListForMember(idx) {
  const m = state.members[idx];
  if (!m) return [];
  const list = [...(m.excludedLocalExperts || [])];
  if (m.isHuman) {
    const nm = String(m.humanContact?.name || m.name || m.localExpert?.displayName || "").trim();
    const org = String(m.humanContact?.organization || m.localExpert?.organization || "").trim();
    const humanKey = nm || org ? [nm, org].filter(Boolean).join(" | ") : "";
    if (humanKey && !list.includes(humanKey)) list.push(humanKey);
  }
  return list;
}

function pushExcluded(idx, data) {
  const key = expertDedupeKey(data);
  if (!key) return;
  const m = state.members[idx];
  if (!m.excludedLocalExperts) m.excludedLocalExperts = [];
  if (!m.excludedLocalExperts.includes(key)) m.excludedLocalExperts.push(key);
}

function pickExpertImageUrl(data, name) {
  const raw = (data.imageUrl || "").trim();
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  return uiAvatarsUrl(name);
}

const localExpertModal = { memberIdx: null, data: null };

function setLocalExpertLoadingMessage(isAnother) {
  const p = document.getElementById("lemLoadingMessage");
  if (p) p.textContent = isAnother ? "Finding another contact…" : "Finding a local expert…";
}

function setLocalExpertModalLoading(loading) {
  const loadEl = document.getElementById("localExpertModalLoading");
  const bodyEl = document.getElementById("localExpertModalBody");
  const actions = document.getElementById("localExpertModalActions");
  const prompt = document.getElementById("localExpertModalPrompt");
  const hint = document.getElementById("localExpertModalHint");
  if (loadEl) loadEl.hidden = !loading;
  if (bodyEl) bodyEl.hidden = loading;
  if (prompt) prompt.hidden = loading;
  if (hint) hint.hidden = loading;
  if (actions) actions.hidden = loading;
  ["lemYes", "lemNo", "lemSearchAgain"].forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.disabled = loading;
  });
}

function openLocalExpertModal(idx) {
  const el = document.getElementById("localExpertModal");
  if (el) el.hidden = false;
  localExpertModal.memberIdx = idx;
  localExpertModal.data = null;
  setLocalExpertLoadingMessage(false);
  setLocalExpertModalLoading(true);
}

function closeLocalExpertModal() {
  const el = document.getElementById("localExpertModal");
  if (el) el.hidden = true;
  localExpertModal.memberIdx = null;
  localExpertModal.data = null;
}

function fillLocalExpertModal(data) {
  const n = normalizeExpertApi(data);
  const name = n.name || "—";
  document.getElementById("lemName").textContent = name;
  document.getElementById("lemOrganization").textContent = n.organization || "—";
  document.getElementById("lemTitle").textContent = n.title || "—";
  document.getElementById("lemContact").textContent = n.contact || "—";
  const img = document.getElementById("lemPhoto");
  if (img) {
    const url = pickExpertImageUrl(n, n.name);
    img.onerror = () => {
      img.onerror = null;
      img.src = uiAvatarsUrl(n.name);
    };
    img.src = url;
    img.hidden = false;
  }
}

function applyExpertToMember(idx, data) {
  const n = normalizeExpertApi(data);
  const m = state.members[idx];
  const display = n.name || m.name;
  m.localExpert = {
    displayName: display,
    organization: n.organization,
    title: n.title,
    subtitle: n.title ? "" : "",
    contact: n.contact,
    imageUrl: n.imageUrl,
    regionHint: n.regionHint,
  };
  m.isHuman = true;
  m.portraitGender = null;
  m.name = display;
  m.jobTitle = n.title || n.organization || m.jobTitle;
  m.systemInstruction =
    "Human community advisor. This slot is filled by a real-world contact in the educator’s region. Encourage students to connect professionally and verify contact details before outreach.";
  m.image = pickExpertImageUrl(n, display);
  m.humanContact = {
    name: display,
    title: n.title,
    organization: n.organization,
    phone: "",
    email: "",
    website: "",
  };
  closeLocalExpertModal();
  renderMemberCards();
}

async function fetchLocalExpertIntoModal(idx, excludeCurrentBeforeFetch) {
  const err = document.getElementById("creatorError");
  try {
    if (excludeCurrentBeforeFetch && localExpertModal.data) {
      pushExcluded(idx, localExpertModal.data);
    }
    setLocalExpertLoadingMessage(!!excludeCurrentBeforeFetch);
    setLocalExpertModalLoading(true);
    const title = document.getElementById("projectTitle")?.value?.trim() || "";
    const summary = document.getElementById("projectSummary")?.value?.trim() || "";
    const roleTitle = state.members[idx]?.jobTitle || "Advisor";
    const excludeExperts = getExcludeListForMember(idx);
    const res = await fetch("/api/creator/local-expert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectTitle: title,
        projectSummary: summary,
        essentialQuestion: getEssentialQuestion(),
        roleTitle,
        excludeExperts,
      }),
    });
    const raw = await res.json();
    if (!res.ok) throw new Error(raw.error || "Request failed");
    const data = normalizeExpertApi(raw);
    if (!data.name) throw new Error("Could not parse expert.");
    localExpertModal.memberIdx = idx;
    localExpertModal.data = data;
    fillLocalExpertModal(data);
  } catch (e) {
    if (err) {
      err.textContent = e.message || String(e);
      err.hidden = false;
    }
    closeLocalExpertModal();
  } finally {
    setLocalExpertModalLoading(false);
  }
}

async function localExpertSearchAgain() {
  const idx = localExpertModal.memberIdx;
  if (idx == null) return;
  await fetchLocalExpertIntoModal(idx, true);
}

/** Full-color 90s Captain Planet–style cartoon portrait (Pollinations). Used when roles are generated. */
function captainPlanetPortraitUrl(name, jobTitle, seedNum, portraitGender, memberIndex) {
  const nameSafe = (name || "Council member").slice(0, 65);
  const roleSafe = (jobTitle || "Advisor").slice(0, 85);
  const seed = Number.isFinite(Number(seedNum)) ? Number(seedNum) : Math.floor(Math.random() * 1e9);
  const idx = Number.isFinite(Number(memberIndex)) ? Number(memberIndex) : 0;
  const gender =
    portraitGender === "female" || portraitGender === "male" || portraitGender === "neutral"
      ? portraitGender
      : effectivePortraitGender(null, name);
  const genderCue = portraitGenderPromptCue(gender);
  const palettes = [
    "emerald green gold and earth brown costume accents",
    "sky blue silver and white Planeteer style",
    "sunshine yellow red and blue heroic colors",
    "purple magenta and turquoise cartoon brights",
    "ocean teal coral and sandy gold",
    "fire orange crimson and deep blue contrast",
  ];
  const palette = palettes[Math.abs(seed) % palettes.length];
  const prompt =
    `Full color cartoon illustration, 1990s Saturday morning TV animation, Captain Planet and the Planeteers art style, ` +
    `vibrant saturated colors, thick black outlines, simple cel shading, heroic eco-team character design, ` +
    `colorful costume with ${palette}, friendly expressive mentor face, ` +
    `${genderCue}, ` +
    `character ${nameSafe}, role ${roleSafe}, ` +
    `composition variant ${idx + 1}, ` +
    `head and shoulders portrait, soft gradient background, no text, no letters, no watermark, no logos`;
  const encoded = encodeURIComponent(prompt.slice(0, 1100));
  const nonce = encodeURIComponent(`${idx}-${Math.abs(seed) % 1e9}`);
  return `https://image.pollinations.ai/prompt/${encoded}?width=320&height=320&seed=${seed}&nologo=true&nonce=${nonce}`;
}

function applyCaptainPlanetPortraits() {
  state.useCaptainPlanetPortraits = true;
  state.members.forEach((m, i) => {
    if (!m.isHuman) {
      const g = effectivePortraitGender(m.portraitGender, m.name);
      m.image = captainPlanetPortraitUrl(m.name, m.jobTitle, m.id * 7919 + i * 97, g, i);
    }
  });
}

function syncMemberCount() {
  const n = Math.min(6, Math.max(2, Number(document.getElementById("memberCount")?.value) || 4));
  state.memberCount = n;
  while (state.members.length < n) {
    const id = state.members.length + 1;
    state.members.push({
      id,
      name: "",
      jobTitle: "",
      systemInstruction: "",
      model: "gemini-2.5-flash",
      image: avatarUrl(`id${id}`),
      portraitGender: null,
      phasesEnabled: state.phases.map(() => true),
      isHuman: false,
      humanContact: { name: "", title: "", organization: "", phone: "", email: "", website: "" },
      localExpert: null,
      excludedLocalExperts: [],
    });
  }
  while (state.members.length > n) state.members.pop();
  state.members.forEach(normalizeMemberHumanFields);
  renderMemberCards();
}

function renderObjectives() {
  const el = document.getElementById("objectivesList");
  if (!el) return;
  el.innerHTML = state.objectives
    .map(
      (text, i) => `
    <div class="objective-row">
      <input type="text" class="creator-input" data-obj-idx="${i}" value="${escapeHtml(text)}" placeholder="Objective ${i + 1}" />
      ${state.objectives.length > 1 ? `<button type="button" class="icon-remove-obj" data-remove-obj="${i}" aria-label="Remove">×</button>` : ""}
    </div>`
    )
    .join("");
  el.querySelectorAll("[data-obj-idx]").forEach((inp) => {
    inp.addEventListener("input", () => {
      state.objectives[Number(inp.dataset.objIdx)] = inp.value;
    });
  });
  el.querySelectorAll("[data-remove-obj]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.removeObj);
      state.objectives.splice(i, 1);
      if (state.objectives.length === 0) state.objectives = [""];
      renderObjectives();
    });
  });
}

function renderPhases() {
  const grid = document.getElementById("phasesGrid");
  if (!grid) return;
  grid.innerHTML = state.phases
    .map(
      (p, i) => `
    <div class="phase-row">
      <span class="phase-num">${i + 1}</span>
      <input type="text" class="creator-input" data-phase-title="${i}" value="${escapeHtml(p.title)}" placeholder="Title" />
      <input type="text" class="creator-input" data-phase-desc="${i}" value="${escapeHtml(p.description)}" placeholder="Description / deliverable" />
    </div>`
    )
    .join("");
  grid.querySelectorAll("[data-phase-title]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const i = Number(inp.dataset.phaseTitle);
      state.phases[i].title = inp.value;
    });
  });
  grid.querySelectorAll("[data-phase-desc]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const i = Number(inp.dataset.phaseDesc);
      state.phases[i].description = inp.value;
    });
  });
}

/** Resize each member's phasesEnabled[] to match state.phases (no DOM updates). */
function normalizeMemberPhaseArrays() {
  state.members.forEach((m) => {
    while (m.phasesEnabled.length < state.phases.length) m.phasesEnabled.push(true);
    m.phasesEnabled.length = state.phases.length;
  });
}

function renderMemberCards() {
  const wrap = document.getElementById("memberCards");
  if (!wrap) return;
  normalizeMemberPhaseArrays();
  wrap.innerHTML = state.members
    .map((m, idx) => {
      const phaseChecks = state.phases
        .map(
          (_, pi) => `
        <label class="phase-check">
          <input type="checkbox" data-m="${idx}" data-p="${pi}" ${m.phasesEnabled[pi] ? "checked" : ""} />
          <span>P${pi + 1}</span>
        </label>`
        )
        .join("");
      const orgLine = m.humanContact?.organization || m.localExpert?.organization || "";
      const humanLine = m.isHuman
        ? `<div class="human-advisor-line">
            <span class="human-advisor-badge">Human advisor</span>
            <span class="human-advisor-name">${escapeHtml(m.name || m.humanContact?.name || "")}</span>
            ${orgLine ? `<span class="human-advisor-org">· ${escapeHtml(orgLine)}</span>` : ""}
          </div>`
        : "";
      return `
    <div class="creator-member-card" data-member-idx="${idx}">
      <div class="creator-member-visual">
        <img class="creator-member-img" src="${escapeHtml(m.image)}" alt="" width="80" height="80" />
        <div class="creator-member-actions">
          <button type="button" class="icon-circle icon-refresh" data-action="refresh" data-idx="${idx}" title="Regenerate role" aria-label="Regenerate role">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M23 4v6h-6M1 20v-6h6"/><path stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </button>
          <button type="button" class="icon-circle icon-globe-btn" data-action="globe" data-idx="${idx}" title="Suggest local expert" aria-label="Suggest local expert">🌐</button>
        </div>
      </div>
      <div class="creator-member-fields">
        <input type="text" class="creator-input" data-field="name" data-idx="${idx}" value="${escapeHtml(m.name)}" placeholder="Name" />
        <input type="text" class="creator-input" data-field="jobTitle" data-idx="${idx}" value="${escapeHtml(m.jobTitle)}" placeholder="Role / job title" />
        <textarea class="creator-textarea small" data-field="systemInstruction" data-idx="${idx}" rows="3" placeholder="Instructions for this AI council member">${escapeHtml(m.systemInstruction)}</textarea>
        <div class="creator-phase-checks">${phaseChecks}</div>
        ${humanLine}
      </div>
    </div>`;
    })
    .join("");

  wrap.querySelectorAll("[data-field]").forEach((el) => {
    el.addEventListener("input", () => {
      const i = Number(el.dataset.idx);
      const field = el.dataset.field;
      state.members[i][field] = el.value;
      if (field === "name" || field === "jobTitle") {
        const m = state.members[i];
        if (!m.isHuman) {
          if (field === "name") {
            m.portraitGender = inferPortraitGenderFromName(m.name);
          }
          const g = effectivePortraitGender(m.portraitGender, m.name);
          m.image = state.useCaptainPlanetPortraits
            ? captainPlanetPortraitUrl(m.name, m.jobTitle, m.id * 7919 + i * 97, g, i)
            : avatarUrl((m.name || `member${i}`).slice(0, 40));
          const img = wrap.querySelector(`[data-member-idx="${i}"] .creator-member-img`);
          if (img) img.src = m.image;
        }
      }
    });
  });
  wrap.querySelectorAll(".phase-check input").forEach((cb) => {
    cb.addEventListener("change", () => {
      const i = Number(cb.dataset.m);
      const p = Number(cb.dataset.p);
      state.members[i].phasesEnabled[p] = cb.checked;
    });
  });
  wrap.querySelectorAll("[data-action='refresh']").forEach((btn) => {
    btn.addEventListener("click", () => regenerateMember(Number(btn.dataset.idx)));
  });
  wrap.querySelectorAll("[data-action='globe']").forEach((btn) => {
    btn.addEventListener("click", () => localExpert(Number(btn.dataset.idx)));
  });
  wrap.querySelectorAll(".creator-member-img").forEach((img, i) => {
    img.addEventListener("error", () => {
      const card = img.closest("[data-member-idx]");
      const idx = card ? Number(card.dataset.memberIdx) : i;
      const m = state.members[idx];
      if (!m) return;
      img.src = m.isHuman
        ? uiAvatarsUrl(m.name || m.humanContact?.name || `member${idx}`)
        : avatarUrl((m.name || `member${idx}`).slice(0, 40));
    });
  });
}

async function suggestPhases() {
  const err = document.getElementById("creatorError");
  err.hidden = true;
  const title = document.getElementById("projectTitle")?.value?.trim() || "";
  const summary = document.getElementById("projectSummary")?.value?.trim() || "";
  const objectives = state.objectives.map((o) => o.trim()).filter(Boolean);
  setCreatorLoading(
    true,
    "Analyzing your project…",
    "Reading your title, summary, and objectives to suggest aligned project phases."
  );
  try {
    const res = await fetch("/api/creator/suggest-phases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectTitle: title,
        projectSummary: summary,
        essentialQuestion: getEssentialQuestion(),
        objectives,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    if (data.phases?.length) {
      state.phases = data.phases.map((p) => ({
        title: p.title || "",
        description: p.description || "",
      }));
      renderPhases();
      renderMemberCards();
    }
  } catch (e) {
    err.textContent = e.message || String(e);
    err.hidden = false;
  } finally {
    setCreatorLoading(false);
  }
}

async function suggestMembers() {
  const err = document.getElementById("creatorError");
  err.hidden = true;
  const title = document.getElementById("projectTitle")?.value?.trim() || "";
  const summary = document.getElementById("projectSummary")?.value?.trim() || "";
  const objectives = state.objectives.map((o) => o.trim()).filter(Boolean);
  syncMemberCount();
  setCreatorLoading(
    true,
    "Designing council roles…",
    "Filling suggested names, titles, and coaching instructions for each member card."
  );
  try {
    const res = await fetch("/api/creator/suggest-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectTitle: title,
        projectSummary: summary,
        essentialQuestion: getEssentialQuestion(),
        objectives,
        phases: state.phases,
        memberCount: state.memberCount,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    if (data.members?.length) {
      data.members.forEach((row, i) => {
        if (!state.members[i]) return;
        state.members[i].name = row.name || "";
        state.members[i].jobTitle = row.jobTitle || "";
        state.members[i].systemInstruction = row.systemInstruction || "";
        state.members[i].isHuman = false;
        state.members[i].localExpert = null;
        state.members[i].excludedLocalExperts = [];
        state.members[i].humanContact = {
          name: "",
          title: "",
          organization: "",
          phone: "",
          email: "",
          website: "",
        };
        state.members[i].portraitGender = effectivePortraitGender(row.portraitGender, row.name);
      });
      applyCaptainPlanetPortraits();
      renderMemberCards();
    }
  } catch (e) {
    err.textContent = e.message || String(e);
    err.hidden = false;
  } finally {
    setCreatorLoading(false);
  }
}

async function regenerateMember(idx) {
  const err = document.getElementById("creatorError");
  err.hidden = true;
  const title = document.getElementById("projectTitle")?.value?.trim() || "";
  const summary = document.getElementById("projectSummary")?.value?.trim() || "";
  const objectives = state.objectives.map((o) => o.trim()).filter(Boolean);
  const existingNames = state.members.map((m) => m.name).filter((_, i) => i !== idx);
  setCreatorLoading(
    true,
    "Regenerating this member…",
    "Choosing a role that complements the rest of the council—no duplicate expertise."
  );
  try {
    const otherMembers = state.members
      .filter((_, i) => i !== idx)
      .map((m) => ({ name: m.name || "", jobTitle: m.jobTitle || "" }));

    const res = await fetch("/api/creator/regenerate-member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectTitle: title,
        projectSummary: summary,
        essentialQuestion: getEssentialQuestion(),
        objectives,
        phases: state.phases,
        existingNames,
        otherMembers,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    state.members[idx].name = data.name;
    state.members[idx].jobTitle = data.jobTitle;
    state.members[idx].systemInstruction = data.systemInstruction || "";
    state.members[idx].isHuman = false;
    state.useCaptainPlanetPortraits = true;
    const regenGender = effectivePortraitGender(data.portraitGender, data.name);
    state.members[idx].portraitGender = regenGender;
    state.members[idx].image = captainPlanetPortraitUrl(
      data.name,
      data.jobTitle,
      state.members[idx].id * 7919 + idx * 131 + Date.now() % 10000,
      regenGender,
      idx
    );
    state.members[idx].localExpert = null;
    state.members[idx].excludedLocalExperts = [];
    state.members[idx].humanContact = {
      name: "",
      title: "",
      organization: "",
      phone: "",
      email: "",
      website: "",
    };
    renderMemberCards();
  } catch (e) {
    err.textContent = e.message || String(e);
    err.hidden = false;
  } finally {
    setCreatorLoading(false);
  }
}

async function localExpert(idx) {
  const err = document.getElementById("creatorError");
  if (err) err.hidden = true;
  openLocalExpertModal(idx);
  await fetchLocalExpertIntoModal(idx, false);
}

function renderSettings() {
  const grid = document.getElementById("settingsGrid");
  if (!grid) return;
  const items = [
    { key: "pacingAlerts", label: "Pacing reminders (placeholder)" },
    { key: "reflectionLogs", label: "Student reflection logs (placeholder)" },
    { key: "familyPortal", label: "Family summary emails (placeholder)" },
    { key: "collaborationMode", label: "Structured collaboration (placeholder)" },
  ];
  grid.innerHTML = items
    .map(
      (item) => `
    <label class="setting-row">
      <input type="checkbox" data-setting="${item.key}" ${state.settings[item.key] ? "checked" : ""} />
      <span>${escapeHtml(item.label)}</span>
    </label>`
    )
    .join("");
  grid.querySelectorAll("[data-setting]").forEach((cb) => {
    cb.addEventListener("change", () => {
      state.settings[cb.dataset.setting] = cb.checked;
    });
  });
}

function readFileAsBase64Payload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || "";
      const data = typeof result === "string" && result.includes(",") ? result.split(",")[1] : "";
      resolve({
        name: file.name,
        mimeType: file.type || inferMimeFromFileName(file.name),
        data,
      });
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function inferMimeFromFileName(name) {
  const n = (name || "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".md")) return "text/markdown";
  if (n.endsWith(".txt")) return "text/plain";
  if (n.endsWith(".html") || n.endsWith(".htm")) return "text/html";
  if (n.endsWith(".csv")) return "text/csv";
  return "application/octet-stream";
}

function readBriefFile() {
  return new Promise((resolve) => {
    const inp = document.getElementById("briefFile");
    const f = inp?.files?.[0];
    if (!f) {
      resolve(null);
      return;
    }
    readFileAsBase64Payload(f)
      .then((payload) => resolve(payload))
      .catch(() => resolve(null));
  });
}

function loadDraftRecords() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDraftRecords(list) {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(list.slice(0, 30)));
}

function collectDraftSnapshot() {
  const projectTitle = document.getElementById("projectTitle")?.value?.trim() || "";
  const projectSummary = document.getElementById("projectSummary")?.value?.trim() || "";
  const essentialQuestion = document.getElementById("essentialQuestion")?.value?.trim() || "";
  return {
    projectTitle,
    projectSummary,
    essentialQuestion,
    useCaptainPlanetPortraits: state.useCaptainPlanetPortraits,
    objectives: state.objectives.slice(),
    phases: state.phases.map((p) => ({ title: p.title || "", description: p.description || "" })),
    members: state.members.map((m) => JSON.parse(JSON.stringify(m))),
    memberCount: state.memberCount,
    settings: { ...state.settings },
    supportingMeta: state.supportingMeta.slice(),
  };
}

function updateDraftBriefNote() {
  const note = document.getElementById("draftBriefNote");
  if (note) note.hidden = !state.draftBriefAttachment?.data;
}

function applyDraftSnapshot(snapshot) {
  state.useCaptainPlanetPortraits = !!snapshot.useCaptainPlanetPortraits;
  state.objectives = Array.isArray(snapshot.objectives) && snapshot.objectives.length
    ? snapshot.objectives.slice()
    : ["", ""];
  state.phases =
    Array.isArray(snapshot.phases) && snapshot.phases.length
      ? snapshot.phases.map((p) => ({ title: p.title || "", description: p.description || "" }))
      : [
          { title: "", description: "" },
          { title: "", description: "" },
          { title: "", description: "" },
          { title: "", description: "" },
        ];
  state.members = Array.isArray(snapshot.members)
    ? snapshot.members.map((m) => JSON.parse(JSON.stringify(m)))
    : [];
  state.members.forEach(normalizeMemberHumanFields);
  state.memberCount = Math.min(6, Math.max(2, Number(snapshot.memberCount) || 4));
  state.settings = {
    pacingAlerts: false,
    reflectionLogs: false,
    familyPortal: false,
    collaborationMode: false,
    ...(snapshot.settings || {}),
  };
  state.supportingMeta = Array.isArray(snapshot.supportingMeta) ? snapshot.supportingMeta.slice() : [];
  state.draftBriefAttachment =
    snapshot.briefAttachment && snapshot.briefAttachment.data ? snapshot.briefAttachment : null;

  const pt = document.getElementById("projectTitle");
  const ps = document.getElementById("projectSummary");
  const eq = document.getElementById("essentialQuestion");
  const mc = document.getElementById("memberCount");
  if (pt) pt.value = snapshot.projectTitle || "";
  if (ps) ps.value = snapshot.projectSummary || "";
  if (eq) eq.value = snapshot.essentialQuestion || "";
  if (mc) mc.value = String(state.memberCount);

  const ul = document.getElementById("supportingFileList");
  if (ul) {
    ul.innerHTML = state.supportingMeta.map((f) => `<li>${escapeHtml(f.name)}</li>`).join("");
  }

  updateDraftBriefNote();
  renderObjectives();
  renderPhases();
  renderSettings();
  syncMemberCount();
}

function loadDraftById(id) {
  const drafts = loadDraftRecords();
  const d = drafts.find((x) => x.id === id);
  if (!d || !d.snapshot) return false;
  applyDraftSnapshot(d.snapshot);
  currentDraftId = id;
  return true;
}

async function saveCouncilDraft() {
  syncMemberCount();
  const err = document.getElementById("creatorError");
  const status = document.getElementById("draftStatus");
  if (err) err.hidden = true;
  let briefEmbed = null;
  let briefSkipped = false;
  const fileInput = document.getElementById("briefFile");
  const file = fileInput?.files?.[0];
  if (file) {
    try {
      const p = await readFileAsBase64Payload(file);
      if (p.data && p.data.length <= MAX_EMBEDDED_BRIEF_BASE64_LEN) {
        briefEmbed = { name: p.name, mimeType: p.mimeType, data: p.data };
        state.draftBriefAttachment = briefEmbed;
      } else if (p.data) {
        briefSkipped = true;
        state.draftBriefAttachment = null;
      }
    } catch {
      briefSkipped = true;
    }
  } else if (state.draftBriefAttachment?.data) {
    briefEmbed = state.draftBriefAttachment;
  }

  const snapshot = collectDraftSnapshot();
  snapshot.briefAttachment = briefEmbed;

  const id =
    currentDraftId ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `draft-${Date.now()}`);
  const titleForList =
    (document.getElementById("projectTitle")?.value || "").trim() || "Untitled draft";
  const now = new Date().toISOString();

  let list = loadDraftRecords();
  list = list.filter((x) => x.id !== id);
  list.unshift({
    id,
    title: titleForList,
    updatedAt: now,
    snapshot,
  });
  saveDraftRecords(list);
  currentDraftId = id;

  try {
    history.replaceState(null, "", `${location.pathname}?draft=${encodeURIComponent(id)}`);
  } catch {
    /* ignore */
  }

  let msg = "Draft saved. You can reopen it from the home page.";
  if (briefSkipped) {
    msg += " Project brief was not embedded (file too large)—add it again when you continue, or rely on your summary text.";
  }
  if (status) status.textContent = msg;
  updateDraftBriefNote();
}

function removeDraftById(id) {
  const list = loadDraftRecords().filter((x) => x.id !== id);
  saveDraftRecords(list);
}

async function resolveBriefForLaunch() {
  const f = document.getElementById("briefFile")?.files?.[0];
  if (f) {
    try {
      const p = await readFileAsBase64Payload(f);
      if (p?.data) return p;
    } catch {
      /* fall through */
    }
  }
  if (state.draftBriefAttachment?.data) return state.draftBriefAttachment;
  return null;
}

async function analyzeBriefFile(file) {
  const err = document.getElementById("creatorError");
  if (err) err.hidden = true;
  setCreatorLoading(
    true,
    "Analyzing project brief…",
    "Extracting the project title, essential question, and learning objectives from your document."
  );
  try {
    const payload = await readFileAsBase64Payload(file);
    if (!payload.data) {
      throw new Error("Could not read the file.");
    }
    const res = await fetch("/api/creator/analyze-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief: payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Brief analysis failed");

    const titleInput = document.getElementById("projectTitle");
    const currentTitle = (titleInput?.value || "").trim();
    if (titleInput && !currentTitle && data.title) {
      titleInput.value = data.title;
    }

    const eqInput = document.getElementById("essentialQuestion");
    if (eqInput && data.essentialQuestion) {
      eqInput.value = data.essentialQuestion;
    }

    if (Array.isArray(data.objectives) && data.objectives.length > 0) {
      state.objectives = data.objectives.slice();
      renderObjectives();
    }
  } catch (e) {
    if (err) {
      err.textContent = e.message || String(e);
      err.hidden = false;
    }
  } finally {
    setCreatorLoading(false);
  }
}

function launchCouncil() {
  const err = document.getElementById("creatorError");
  err.hidden = true;
  const title = document.getElementById("projectTitle")?.value?.trim();
  if (!title) {
    err.textContent = "Enter a project title.";
    err.hidden = false;
    return;
  }
  syncMemberCount();
  const filled = state.members.filter((m) => (m.name || "").trim().length > 0);
  if (filled.length < 2) {
    err.textContent = "Add at least two council members with names (use Generate roles or type manually).";
    err.hidden = false;
    return;
  }
  if (!state.phases.some((p) => (p.title || "").trim())) {
    err.textContent = "Add at least one phase title (or use Suggest phases).";
    err.hidden = false;
    return;
  }

  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `council-${Date.now()}`;

  const config = {
    projectTitle: title,
    projectSummary: document.getElementById("projectSummary")?.value?.trim() || "",
    essentialQuestion: document.getElementById("essentialQuestion")?.value?.trim() || "",
    learningObjectives: state.objectives.map((o) => o.trim()).filter(Boolean),
    phases: state.phases.filter((p) => (p.title || "").trim() || (p.description || "").trim()),
    members: state.members.map((m) => ({ ...m })),
    settings: { ...state.settings },
    briefAttachment: null,
    supportingAttachments: [],
  };

  setCreatorLoading(
    true,
    "Preparing your council…",
    "Reading your project brief (if uploaded) and saving your council before opening."
  );
  resolveBriefForLaunch()
    .then((brief) => {
      if (brief?.data) config.briefAttachment = brief;
      try {
        sessionStorage.setItem("aiCouncilActiveProject", JSON.stringify(config));
      } catch (e) {
        err.textContent = "Could not save council data (storage may be full).";
        err.hidden = false;
        return;
      }

      let list = [];
      try {
        list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      } catch {
        list = [];
      }
      list = list.filter((x) => x.id !== id);
      list.unshift({
        id,
        title,
        description: config.phases[0]?.title || "Custom council",
        config,
        updatedAt: new Date().toISOString(),
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 20)));

      if (currentDraftId) {
        removeDraftById(currentDraftId);
        currentDraftId = null;
      }

      window.location.href = `/council.html?saved=${encodeURIComponent(id)}`;
    })
    .finally(() => setCreatorLoading(false));
}

document.getElementById("addObjectiveBtn")?.addEventListener("click", () => {
  state.objectives.push("");
  renderObjectives();
});

document.getElementById("addPhaseBtn")?.addEventListener("click", () => {
  state.phases.push({ title: "", description: "" });
  renderPhases();
  renderMemberCards();
});

document.getElementById("suggestPhasesBtn")?.addEventListener("click", suggestPhases);
document.getElementById("suggestMembersBtn")?.addEventListener("click", suggestMembers);
document.getElementById("memberCount")?.addEventListener("change", () => {
  syncMemberCount();
});
document.getElementById("launchCouncilBtn")?.addEventListener("click", launchCouncil);
document.getElementById("lemYes")?.addEventListener("click", () => {
  const idx = localExpertModal.memberIdx;
  const data = localExpertModal.data;
  if (idx == null || !data) return;
  applyExpertToMember(idx, data);
});
document.getElementById("lemNo")?.addEventListener("click", () => closeLocalExpertModal());
document.getElementById("lemSearchAgain")?.addEventListener("click", () => localExpertSearchAgain());
document.getElementById("localExpertModal")?.addEventListener("click", (e) => {
  if (e.target.closest("[data-close-lem]")) closeLocalExpertModal();
});
document.addEventListener("keydown", (e) => {
  const modal = document.getElementById("localExpertModal");
  if (e.key !== "Escape" || !modal || modal.hidden) return;
  closeLocalExpertModal();
});
document.getElementById("saveDraftBtn")?.addEventListener("click", () => {
  saveCouncilDraft().catch((e) => {
    const err = document.getElementById("creatorError");
    if (err) {
      err.textContent = e.message || String(e);
      err.hidden = false;
    }
  });
});

document.getElementById("briefFile")?.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  state.draftBriefAttachment = null;
  updateDraftBriefNote();
  if (!f) return;
  analyzeBriefFile(f);
});

document.getElementById("supportingFiles")?.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  const ul = document.getElementById("supportingFileList");
  state.supportingMeta = files.map((f) => ({ name: f.name, size: f.size }));
  if (ul) {
    ul.innerHTML = state.supportingMeta.map((f) => `<li>${escapeHtml(f.name)}</li>`).join("");
  }
});

(function initCreateForm() {
  const params = new URLSearchParams(location.search);
  const draftId = params.get("draft");
  if (draftId && loadDraftById(draftId)) {
    const status = document.getElementById("draftStatus");
    if (status) {
      status.textContent = "Draft loaded. Continue editing, save again, or launch when ready.";
    }
    return;
  }
  renderObjectives();
  renderPhases();
  syncMemberCount();
  renderSettings();
})();
