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
  return r ? r.value : "4";
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = "status " + type;
}

function setSubmitState() {
  const hasSelection = selectedIds.size > 0;
  const hasPrompt = promptInput.value.trim().length > 0;
  submitBtn.disabled = !hasSelection || !hasPrompt;
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
  const prompt = sendToSource.response;
  sendToConfirm.disabled = true;
  closeSendToOverlay();
  setStatus("");
  startCouncilLoading();
  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      selectedGems: Array.from(sendToSelectedIds),
    }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (!data.results) throw new Error(data.error || "No results");
      const jobTitleMap = {};
      gems.forEach((g) => { jobTitleMap[g.name] = g.jobTitle; });
      const followUpsByGemId = {};
      const withTitles = data.results.map((r) => ({ ...r, jobTitle: jobTitleMap[r.name] || r.jobTitle }));
      followUpsByGemId[sendToSource.gemId] = withTitles;
      renderResults(lastResults, {
        showSaveButton: true,
        jobTitleMap,
        followUpsByGemId,
      });
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

// Ensure overlay is hidden on load (only show when user clicks "Send Response to…")
if (sendToOverlay) sendToOverlay.hidden = true;

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
              renderResults(c.results || [], { showSaveButton: false, jobTitleMap });
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
  if (!prompt || selectedIds.size === 0) return;

  submitBtn.classList.add("loading");
  submitBtn.disabled = true;
  setStatus("");
  resultsSection.hidden = true;
  startCouncilLoading();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedGems: Array.from(selectedIds),
        prompt,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus(data.error || "Request failed", "error");
      return;
    }

    lastPrompt = prompt;
    lastSelectedGems = Array.from(selectedIds);
    lastResults = data.results || [];
    const jobTitleMap = {};
    gems.forEach((g) => { jobTitleMap[g.name] = g.jobTitle; });
    lastResults.forEach((r) => { r.jobTitle = jobTitleMap[r.name] || r.jobTitle; });
    renderResults(lastResults, { showSaveButton: true, jobTitleMap });
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

promptInput.addEventListener("input", setSubmitState);
promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
});
submitBtn.addEventListener("click", submit);

loadGems();
