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

const COUNCIL_LOADING_PHRASES = [
  "Council members are thinking…",
  "Consulting the documents…",
  "Organizing their thoughts…",
  "Discussing your question…",
  "Preparing their responses…",
  "Considering different perspectives…",
];

let councilLoadingInterval = null;

function startCouncilLoading() {
  if (!councilLoading || !councilLoadingMessage) return;
  councilLoading.hidden = false;
  let i = 0;
  councilLoadingMessage.textContent = COUNCIL_LOADING_PHRASES[0];
  councilLoadingInterval = setInterval(() => {
    i = (i + 1) % COUNCIL_LOADING_PHRASES.length;
    councilLoadingMessage.textContent = COUNCIL_LOADING_PHRASES[i];
  }, 2200);
}

function stopCouncilLoading() {
  if (councilLoadingInterval) {
    clearInterval(councilLoadingInterval);
    councilLoadingInterval = null;
  }
  if (councilLoading) councilLoading.hidden = true;
}

let gems = [];
let selectedIds = new Set();
let lastPrompt = "";
let lastSelectedGems = [];
let lastResults = [];
let sendToSource = null; // { gemId, name, response } when overlay is open
let sendToSelectedIds = new Set();
let attachments = []; // { name, mimeType, data (base64) }

// Phase 1: Jane only. 2: Jane, Carl, Henrietta. 3: + Wolfgang. 4: all.
function getEnabledMemberIds(phase) {
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
    card.className = "gem-card" + (selectedIds.has(gem.id) ? " selected" : "") + (enabled ? "" : " disabled");
    card.dataset.colorIndex = String(gem.id);
    card.setAttribute("role", "button");
    card.tabIndex = enabled ? 0 : -1;
    const imgHtml = gem.image
      ? `<img class="gem-card-thumb" src="/${escapeHtml(gem.image)}" alt="" loading="lazy" />`
      : "";
    card.innerHTML = `
      ${imgHtml}
      <span class="gem-name">${escapeHtml(gem.name)}</span>
      <span class="gem-job-title">${escapeHtml(gem.jobTitle || "")}</span>
    `;
    if (enabled) {
      card.addEventListener("click", () => {
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
    gemsGrid.appendChild(card);
  });
}

function escapeHtml(s) {
  if (s == null) return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

const ALLOWED_MIME_PREFIXES = ["image/", "text/", "application/pdf"];
function isAllowedFile(file) {
  return ALLOWED_MIME_PREFIXES.some((p) => file.type && file.type.startsWith(p)) || /\.(pdf|txt|md)$/i.test(file.name);
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
      tokens.push({ type: "word", text: seg.slice(1, -1), bold: false, italic: true });
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
  const match = text.match(/^(https?:\/\/[^\s]+?)([.,;:)\]]*)$/);
  if (match) return { href: match[1], suffix: match[2] };
  if (/^https?:\/\/[^\s]+$/.test(text)) return { href: text, suffix: "" };
  return null;
}

function isFollowUpCommunityHeader(text) {
  return /follow\s*up\s*in\s*your\s*community/i.test((text || "").trim());
}

function getWordDelayMs(wpm, lastToken) {
  if (lastToken && lastToken.type === "word" && /[.!?]$/.test(lastToken.text)) {
    return 2000 + Math.round(Math.random() * 200);
  }
  const wpmVaried = 180 + Math.random() * 60;
  const baseMs = (60 * 1000) / wpmVaried;
  const variation = (Math.random() - 0.5) * 80;
  return Math.max(150, Math.round(baseMs + variation));
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
      p.textContent = t.text;
      container.appendChild(p);
      container.appendChild(document.createElement("br"));
      lastWasFollowUpHeader = isFollowUpCommunityHeader(t.text);
      scrollToBottom();
      if (i < tokens.length) scheduleNext();
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
      if (i < tokens.length) scheduleNext();
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
      } else {
        const span = document.createElement("span");
        span.className = "response-word-appear";
        span.textContent = t.text;
        if (t.bold) span.classList.add("response-word-bold");
        if (t.italic) span.classList.add("response-word-italic");
        container.appendChild(span);
      }
      needSpace = true;
      if (/[?]$/.test(t.text)) bulletNext = true;
      previousWordEndedWithQuestion = /[?]$/.test(t.text);
      scrollToBottom();
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
      p.textContent = t.text;
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
        const span = document.createElement("span");
        span.textContent = t.text;
        if (t.bold) span.classList.add("response-word-bold");
        if (t.italic) span.classList.add("response-word-italic");
        container.appendChild(span);
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
    const colors = MEMBER_COLORS[gemId] || MEMBER_COLORS[2];
    const title = jobTitle || jobTitleMap[name] || "";
    const card = document.createElement("div");
    card.className = "response-overlay-card";
    card.dataset.gemId = String(gemId);
    card.style.setProperty("--member-border", colors.border);
    card.style.setProperty("--member-bg", colors.bg);
    card.style.setProperty("--member-fg", colors.fg);
    card.style.setProperty("--member-card", colors.card);
    const imgSrc = gems.find((g) => g.id === gemId)?.image;
    const imgHtml = imgSrc ? `<img class="response-overlay-thumb" src="/${escapeHtml(imgSrc)}" alt="" />` : "";
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
    if (!error && response) {
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
        <p class="response-text">${escapeHtml(response || "")}</p>
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
      if (!error && response) {
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
          <p class="response-text">${escapeHtml(r.response || "")}</p>
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

function saveCurrentChat() {
  if (!lastResults.length) return;
  fetch("/api/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: lastPrompt,
      selectedGems: lastSelectedGems,
      results: lastResults,
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
  const others = gems.filter((g) => g.id !== source.gemId);
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
  const selectedIdsForRequest = Array.from(sendToSelectedIds);
  sendToConfirm.disabled = true;
  closeSendToOverlay();
  setStatus("");
  startCouncilLoading();
  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      selectedGems: selectedIdsForRequest,
      opinionOnResponse: true,
    }),
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
    followUpSend.disabled = true;
    setStatus("");
    startCouncilLoading();
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedGems: [currentFollowUp.gemId],
        prompt: question,
        followUpPreviousResponse: currentFollowUp.response,
      }),
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
        const dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        btn.innerHTML = `
          <span class="recent-chat-prompt">${escapeHtml(chat.prompt)}</span>
          <span class="recent-chat-meta">${dateStr} · ${chat.resultCount} response(s)</span>
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
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
  try {
    const res = await fetch("/api/gems");
    const data = await res.json();
    gems = data.gems || [];
  } catch {
    gems = [
      { id: 1, name: "Henrietta", jobTitle: "Scientific Historian", image: "henrietta.jpg" },
      { id: 2, name: "Jane", jobTitle: "Cultural Ethnographer", image: "jane.jpg" },
      { id: 3, name: "Laika", jobTitle: "Launch Visionary", image: "Laika.jpg" },
      { id: 4, name: "Wolfgang", jobTitle: "Logistics Architect", image: "wolfgang.jpg" },
      { id: 5, name: "Carl", jobTitle: "Interstellar Linguist", image: "carl.jpg" },
    ];
  }
  renderGems();
  setSubmitState();
}

function onPhaseChange() {
  const phase = getProjectPhase();
  const enabledIds = getEnabledMemberIds(phase);
  selectedIds.forEach((id) => {
    if (!enabledIds.has(id)) selectedIds.delete(id);
  });
  renderGems();
  setSubmitState();
}

document.querySelectorAll('input[name="projectPhase"]').forEach((radio) => {
  radio.addEventListener("change", onPhaseChange);
});

uploadBtn.addEventListener("click", () => fileInput.click());
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
