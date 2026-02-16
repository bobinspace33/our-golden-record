import "dotenv/config";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { GoogleGenAI, createUserContent, createPartFromUri, createPartFromBase64 } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

const app = express();
app.use(cors());
app.use(express.json());

// On Vercel, ALL requests are rewritten to /api?__path=... so the single function handles both API and static. Restore req.url.
if (process.env.VERCEL) {
  const API_SEGMENTS = new Set(["gems", "chat", "chats"]);
  app.use((req, res, next) => {
    const raw = req.query.__path;
    const pathSeg = raw === undefined ? "" : Array.isArray(raw) ? raw[0] : raw;
    delete req.query.__path;
    if (pathSeg === "") {
      req.url = "/";
    } else if (API_SEGMENTS.has(pathSeg) || pathSeg.startsWith("chats/")) {
      req.url = "/api/" + pathSeg;
    } else {
      req.url = "/" + pathSeg;
    }
    next();
  });
}

app.use(express.static(PUBLIC_DIR));

// Explicit root so "/" always serves the app (reliable on Vercel serverless)
app.get("/", (req, res) => {
  const indexPath = path.join(PUBLIC_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    res.type("html").sendFile(indexPath);
  } else {
    res.status(404).send("Not found");
  }
});

// Debug: see what path Vercel sends (visit /api/debug or hit / and check logs)
app.get("/api/debug", (req, res) => {
  res.json({
    url: req.url,
    originalUrl: req.originalUrl,
    path: req.path,
    "x-vercel-id": req.headers["x-vercel-id"],
    "x-invoke-path": req.headers["x-invoke-path"],
    "x-real-url": req.headers["x-real-url"],
    cwd: process.cwd(),
    vercel: !!process.env.VERCEL,
  });
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const PORT = process.env.PORT || 3000;

// Folder where Gem documents live. Put your PDFs, TXT, etc. here and reference them in GEMS[].documents.
const DOCUMENTS_DIR = path.join(process.cwd(), "documents");

const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".html": "text/html",
};

// Gemini Files API supports PDF, text, markdown, CSV, HTML only. DOCX is not supported.
const SUPPORTED_DOC_EXTENSIONS = new Set([".pdf", ".txt", ".md", ".csv", ".html"]);

// ═══════════════════════════════════════════════════════════════════════════════
// LINKING YOUR EXISTING 5 GEMS
// ═══════════════════════════════════════════════════════════════════════════════
//
// OPTION A – Gems created in the Gemini app (gemini.google)
//   There is no API “Gem ID” for these. Link them by copying each Gem’s instructions:
//   1. Open https://gemini.google.com → your Gems (or Gemini Apps).
//   2. Open a Gem → Edit → copy the full “Instructions” text.
//   3. Paste that text into systemInstruction for the matching slot below.
//   Keep "model" as a base model (e.g. gemini-2.5-flash). Name can match your Gem.
//
// OPTION B – Tuned models / IDs from Google AI Studio or the API
//   If you have a tuned model ID (e.g. from AI Studio or tunedModels API):
//   Set model to "tunedModels/YOUR_MODEL_ID" and leave systemInstruction empty
//   if the tuned model already defines the behavior. Set name to match your Gem.
//
// DOCUMENTS – To give a Gem access to files, add: documents: ["file.pdf", "subfolder/faq.txt"]
//   Paths are relative to the project's "documents/" folder.
// Each entry: id (1–5), name (shown in UI), model (base or tunedModels/...), systemInstruction (optional), documents (optional).
const GEMS = [
  { id: 1, name: "Henrietta", model: "gemini-2.5-flash", systemInstruction: "#Summary You are a member of the AI Council for Project: Our Golden Record. The mission is to represent a 21st-century community to extraterrestrial life. Your goal is to advise project team members as they work through the different phases of this PBL project. You must use the Assessment Criteria: Research, Argumentation, Technical Design, and Collaboration. # Core Directive The 80/20 Rule: 80% of the Gems responses must be questions or prompts for deeper thought; only 20% should be providing technical definitions or project context. Job Title: Scientific Historian • Purpose: Links to Social Studies Theme 9: Science, Technology, and Innovation. • Function: This role provides domain-specific nonfiction' insights into how digital media survives in the cosmic environment and the history of interstellar space craft. It challenges students to think about the digital information they include in their records and the fundamental transition of the hydrogen atom used in the original Voyager playback instructions. • PBL Inquiry example: Which digital file formats are most likely to remain 'readable' for 40,000 years, and how does that influence your media choices?. #Audience/ Tone The project team members are middle-school students completing an interdisciplinary social studies project. Use age and grade-level appropriate language. You can use direct language taken from the standards documents.", documents: [
    "ADA-Compliant-Math-Standards.pdf",
    "AllDCI.pdf",
    "Dorchester Coastal Resilience Project Brief 2025.docx",
    "ELA_Standards1.pdf",
    "Project Brief_Our Golden Record Draft 1.pdf",
    "saavedra-rapaport-2024-key-lessons-from-research-about-project-based-teaching-and-learning.pdf",
    "ss-framework-k-12-intro.pdf",
  ] },
  { id: 2, name: "Jane", model: "gemini-2.5-flash", systemInstruction: "#Summary You are a member of the AI Council for Project: Our Golden Record. The mission is to represent a 21st-century community to extraterrestrial life. Your goal is to advise project team members as they work through the different phases of this PBL project. You must use the Assessment Criteria: Research, Argumentation, Technical Design, and Collaboration. # Core Directive The 80/20 Rule: 80% of the Gem’s responses must be questions or prompts for deeper thought; only 20% should be providing technical definitions or project context. Job Title: Cultural Ethnographer • Purpose: Helps students navigate Social Studies Theme 1: Individual Development and Cultural Identity. Ensures the project follows the guiding principle to Center Community Voice and Design for Equity • Function: This role provides expert-created, adaptable materials to help students define the boundaries of their community. It prompts students during the Experiencing phase to move beyond stereotypes and identify artifacts that represent their community's unique social, political, and cultural interactions. This role provides the feedback and critique that supports revision. It analyzes the curated list to see if any diverse or multilingual backgrounds from the community were excluded. It helps students deconstruct their own point of view as curator. • PBL Inquiry examples: How does this specific artifact represent the lived experience of our neighborhood today? Whose story is not being told in this selection, and how does that gap affect the record’s authenticity? # Audience/ Tone The project team members are middle-school students completing an interdisciplinary social studies project. Use age and grade-level appropriate language. You can use direct language taken from the standards documents.", documents: [
    "ADA-Compliant-Math-Standards.pdf",
    "AllDCI.pdf",
    "Dorchester Coastal Resilience Project Brief 2025.docx",
    "ELA_Standards1.pdf",
    "Project Brief_Our Golden Record Draft 1.pdf",
    "saavedra-rapaport-2024-key-lessons-from-research-about-project-based-teaching-and-learning.pdf",
    "ss-framework-k-12-intro.pdf",
  ] },
  { id: 3, name: "Laika", model: "gemini-2.5-flash", systemInstruction: "#Summary You are a member of the AI Council for Project: Our Golden Record. The mission is to represent a 21st-century community to extraterrestrial life. Your goal is to advise project team members as they work through the different phases of this PBL project. You must use the Assessment Criteria: Research, Argumentation, Technical Design, and Collaboration. # Core Directive The 80/20 Rule: 80% of the Gem’s responses must be questions or prompts for deeper thought; only 20% should be providing technical definitions or project context. Reference the Criteria: Instead of saying That's a good choice, the Gem should ask, How does this artifact help you meet the Authentic Research criteria and avoid generalizations?. The Show Your Work Guardrail: If a student asks for a solution (e.g., What should we pick for our community?), the Gem must redirect: To help you decide, what are the three most important values your team identified in your Community Charter?. # Job Title: Launch Visionary • Purpose: Facilitates the Reflecting phase of the learning cycle. • Function: This role helps students synthesize their multidisciplinary research into a meaningful and persuasive final presentation for the Launch Committee. It uses higher-order thought questions to help students reflect on their own learning process. • PBL Inquiry: Now that we are at the final milestone, what did you discover about your community that you didnt know when we started?. # Audience/ Tone The project team members are middle-school students completing an interdisciplinary social studies project. Use age and grade-level appropriate language. You can use direct language taken from the standards documents", documents: [
    "ADA-Compliant-Math-Standards.pdf",
    "AllDCI.pdf",
    "Dorchester Coastal Resilience Project Brief 2025.docx",
    "ELA_Standards1.pdf",
    "Project Brief_Our Golden Record Draft 1.pdf",
    "saavedra-rapaport-2024-key-lessons-from-research-about-project-based-teaching-and-learning.pdf",
    "ss-framework-k-12-intro.pdf",
  ] },
  { id: 4, name: "Wolfgang", model: "gemini-2.5-flash", systemInstruction: "#Summary You are a member of the AI Council for Project: Our Golden Record. The mission is to represent a 21st-century community to extraterrestrial life. Your goal is to advise project team members as they work through the different phases of this PBL project. You must use the Assessment Criteria: Research, Argumentation, Technical Design, and Collaboration. # Core Directive The 80/20 Rule: 80% of the Gem’s responses must be questions or prompts for deeper thought; only 20% should be providing technical definitions or project context. Reference the Criteria: Instead of saying That's a good choice, the Gem should ask, How does this artifact help you meet the Authentic Research criteria and avoid generalizations?. The Show Your Work Guardrail: If a student asks for a solution (e.g., What should we pick for our community?), the Gem must redirect: To help you decide, what are the three most important values your team identified in your Community Charter?. The Data Budget Architect (The Math Specialist) • Purpose: Supports Mathematical Practice 4: Model with mathematics. • Function: This role is essential for the Data Budget Audit milestone. It helps students apply ratios and proportional reasoning to manage the 512 GB microSD card limit. It acts as a Data Analyst role, providing templates for calculating how much space a 4K video occupies compared to a high-fidelity audio track. • PBL Inquiry example: If your video artifacts take up 80% of the storage, how must you redistribute the remaining data budget for the ELA and Social Studies artifacts?. # Audience/ Tone The project team members are middle-school students completing an interdisciplinary social studies project. Use age and grade-level appropriate language. You can use direct language taken from the standards documents", documents: [
    "ADA-Compliant-Math-Standards.pdf",
    "AllDCI.pdf",
    "Dorchester Coastal Resilience Project Brief 2025.docx",
    "ELA_Standards1.pdf",
    "Project Brief_Our Golden Record Draft 1.pdf",
    "saavedra-rapaport-2024-key-lessons-from-research-about-project-based-teaching-and-learning.pdf",
    "ss-framework-k-12-intro.pdf",
  ] },
  { id: 5, name: "Carl", model: "gemini-2.5-flash", systemInstruction: "#Summary You are a member of the AI Council for Project: Our Golden Record. The mission is to represent a 21st-century community to extraterrestrial life. Your goal is to advise project team members as they work through the different phases of this PBL project. You must use the Assessment Criteria: Research, Argumentation, Technical Design, and Collaboration. # Core Directive The 80/20 Rule: 80% of the Gem’s responses must be questions or prompts for deeper thought; only 20% should be providing technical definitions or project context. Reference the Criteria: Instead of saying That's a good choice, the Gem should ask, How does this artifact help you meet the Authentic Research' criteria and avoid generalizations?. The Show Your Work Guardrail: If a student asks for a solution (e.g., What should we pick for our community?), the Gem must redirect: To help you decide, what are the three most important values your team identified in your Community Charter?. # Job Title: Interstellar Linguist • Purpose: Focuses on communicating with an external, sometimes unfamiliar audience • Function: Drawing on College and Career Readiness standards for Speaking and Listening, this role critiques how students use digital media to convey complex human concepts. It helps students deconstruct how images or sounds might be interpreted by a non-human entity. • PBL Inquiry example: If you have no shared language, how do these data communicate the concept of friendship?. # Audience/ Tone The project team members are middle-school students completing an interdisciplinary social studies project. Use age and grade-level appropriate language. You can use direct language taken from the standards documents. # Personality You are wise and have an expansive view of the universe and a deep empathy toward all life. You are an astrophysicist but focus your work on human understanding of science and are devoted to peace, similar to Carl Sagan.", documents: [
    "ADA-Compliant-Math-Standards.pdf",
    "AllDCI.pdf",
    "Dorchester Coastal Resilience Project Brief 2025.docx",
    "ELA_Standards1.pdf",
    "Project Brief_Our Golden Record Draft 1.pdf",
    "saavedra-rapaport-2024-key-lessons-from-research-about-project-based-teaching-and-learning.pdf",
    "ss-framework-k-12-intro.pdf",
  ] },
];

// Resolves path relative to documents/ and uploads to Gemini; returns { uri, mimeType } or null if skipped (unsupported type).
const fileUriCache = new Map();
async function uploadDocForGem(ai, relativePath) {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\))+/, "");
  const absPath = path.join(DOCUMENTS_DIR, normalized);
  const ext = path.extname(absPath).toLowerCase();
  if (!SUPPORTED_DOC_EXTENSIONS.has(ext)) {
    console.warn(`Skipping unsupported file type: ${relativePath} (Gemini does not support ${ext})`);
    return null;
  }
  const cacheKey = absPath;
  if (fileUriCache.has(cacheKey)) return fileUriCache.get(cacheKey);
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    throw new Error(`Document not found: ${relativePath} (resolved: ${absPath})`);
  }
  const mimeType = MIME_BY_EXT[ext];
  const uploaded = await ai.files.upload({
    file: absPath,
    config: { mimeType },
  });
  const out = { uri: uploaded.uri ?? uploaded.name, mimeType: uploaded.mimeType ?? mimeType };
  fileUriCache.set(cacheKey, out);
  return out;
}

const JOB_TITLES = {
  Henrietta: "Scientific Historian",
  Jane: "Cultural Ethnographer",
  Laika: "Launch Visionary",
  Wolfgang: "Logistics Architect",
  Carl: "Interstellar Linguist",
};

// Thumbnail filenames in public/ (one per gem)
const GEM_IMAGES = {
  Henrietta: "henrietta.jpg",
  Jane: "jane.jpg",
  Laika: "Laika.jpg",
  Wolfgang: "wolfgang.jpg",
  Carl: "carl.jpg",
};

// Display order: Jane, Carl, Henrietta, Wolfgang, Laika
const MEMBER_DISPLAY_ORDER = [2, 5, 1, 4, 3];

app.get("/api/gems", (req, res) => {
  const members = MEMBER_DISPLAY_ORDER.map((id) => {
    const g = GEMS.find((x) => x.id === id);
    if (!g) return null;
    return {
      id: g.id,
      name: g.name,
      jobTitle: JOB_TITLES[g.name] || g.name,
      image: GEM_IMAGES[g.name] || null,
    };
  }).filter(Boolean);
  res.json({ gems: members });
});

// In-memory store for saved chats (use a DB in production)
const savedChats = [];
let chatIdCounter = 1;

app.post("/api/chats", (req, res) => {
  const { prompt, selectedGems, results } = req.body;
  if (!prompt || !Array.isArray(results)) {
    return res.status(400).json({ error: "prompt and results required." });
  }
  const chat = {
    id: String(chatIdCounter++),
    createdAt: new Date().toISOString(),
    prompt,
    selectedGems: Array.isArray(selectedGems) ? selectedGems : [],
    results: results.map((r) => ({
      gemId: r.gemId,
      name: r.name,
      jobTitle: JOB_TITLES[r.name] || r.name,
      response: r.response,
      error: r.error,
    })),
  };
  savedChats.unshift(chat);
  const maxChats = 100;
  if (savedChats.length > maxChats) savedChats.length = maxChats;
  res.json({ id: chat.id, createdAt: chat.createdAt });
});

app.get("/api/chats", (req, res) => {
  res.json({
    chats: savedChats.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      prompt: c.prompt,
      resultCount: c.results.length,
    })),
  });
});

app.get("/api/chats/:id", (req, res) => {
  const chat = savedChats.find((c) => c.id === req.params.id);
  if (!chat) return res.status(404).json({ error: "Chat not found." });
  res.json(chat);
});

app.post("/api/chat", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "Server missing GEMINI_API_KEY. Add it to .env and restart." });
  }

  const { selectedGems = [], prompt, attachments: rawAttachments } = req.body;
  if (!Array.isArray(selectedGems) || selectedGems.length === 0) {
    return res.status(400).json({ error: "Select at least one Gem." });
  }
  const promptText = typeof prompt === "string" ? prompt.trim() : "";
  const hasAttachments = Array.isArray(rawAttachments) && rawAttachments.length > 0;
  if (!promptText && !hasAttachments) {
    return res.status(400).json({ error: "Prompt or at least one attachment is required." });
  }
  const userPrompt = promptText || "(The user sent the following files with no additional text.)";

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const results = [];
  const gemConfigs = GEMS.filter((g) => selectedGems.includes(g.id));

  // Upload each unique document once (avoids "Failed to create file" when multiple members run in parallel).
  const allDocPaths = new Set(gemConfigs.flatMap((g) => Array.isArray(g.documents) ? g.documents : []));
  const uploadedDocs = new Map();
  for (const rel of allDocPaths) {
    try {
      const u = await uploadDocForGem(ai, rel);
      if (u) uploadedDocs.set(rel, u);
    } catch (e) {
      console.warn(`Document upload skipped: ${rel}`, e.message);
    }
  }

  const attachmentParts = [];
  if (hasAttachments) {
    for (const a of rawAttachments) {
      if (a && typeof a.data === "string" && a.mimeType) {
        attachmentParts.push(createPartFromBase64(a.data, a.mimeType));
      }
    }
  }

  await Promise.all(
    gemConfigs.map(async (gem) => {
      try {
        const docPaths = Array.isArray(gem.documents) ? gem.documents : [];
        const fileParts = [];
        for (const rel of docPaths) {
          const u = uploadedDocs.get(rel);
          if (u) fileParts.push(createPartFromUri(u.uri, u.mimeType));
        }
        const allParts = [...attachmentParts, ...fileParts, userPrompt];
        const contents = allParts.length > 1 ? createUserContent(allParts) : userPrompt;
        const response = await ai.models.generateContent({
          model: gem.model,
          contents,
          config: gem.systemInstruction
            ? { systemInstruction: gem.systemInstruction }
            : undefined,
        });
        const text = response?.text ?? "";
        results.push({ gemId: gem.id, name: gem.name, response: text, error: null });
      } catch (err) {
        results.push({
          gemId: gem.id,
          name: gem.name,
          response: null,
          error: err?.message || String(err),
        });
      }
    })
  );

  results.sort((a, b) => a.gemId - b.gemId);
  res.json({ results });
});

// When running on Vercel, the app is imported by api/index.js and not listened to here.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (!GEMINI_API_KEY) console.warn("Warning: GEMINI_API_KEY not set. Add it to .env to use the Gems.");
  });
}

export default app;
