import "dotenv/config";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import WordExtractor from "word-extractor";
import express from "express";
import cors from "cors";
import { GoogleGenAI, createUserContent, createPartFromBase64 } from "@google/genai";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
/** Shipped PBLWorks-style exemplar brief PDFs (`public/project briefs/`) — style reference for pre-launch reflection prompts. */
const PBLWORKS_EXEMPLAR_BRIEFS_DIR = path.join(PUBLIC_DIR, "project briefs");

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

// On Vercel, ALL requests are rewritten to /api?__path=... so the single function handles both API and static. Restore req.url.
if (process.env.VERCEL) {
  const API_SEGMENTS = new Set(["gems", "chat", "chats", "projects"]);
  app.use((req, res, next) => {
    const raw = req.query.__path;
    const pathSeg = raw === undefined ? "" : Array.isArray(raw) ? raw[0] : raw;
    delete req.query.__path;
    if (pathSeg === "") {
      req.url = "/";
    } else if (
      API_SEGMENTS.has(pathSeg) ||
      pathSeg.startsWith("chats/") ||
      pathSeg.startsWith("chat/") ||
      pathSeg.startsWith("creator/")
    ) {
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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
/** Council chat (`/api/chat`, `/api/chat/custom`) uses OpenAI Responses API. */
const OPENAI_CHAT_MODEL = (process.env.OPENAI_CHAT_MODEL || "gpt-5.2").trim();
const PORT = process.env.PORT || 3000;

/** Gemini native image ("Nano Banana") — see https://ai.google.dev/gemini-api/docs/image-generation */
const GEMINI_IMAGE_MODEL = (process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image").trim();

/** IDs that were preview names or typos — map to a current generateContent model. */
const GEMINI_MODEL_ID_ALIASES = {
  "gemini-3.1-flash": "gemini-2.5-flash",
  "gemini-3-flash": "gemini-2.5-flash",
  "gemini-3.1-pro": "gemini-2.5-pro",
  "gemini-3-pro": "gemini-2.5-pro",
};

function normalizeGeminiModelId(modelId) {
  const m = String(modelId || "").trim();
  return GEMINI_MODEL_ID_ALIASES[m] || m;
}

function dedupeModelChain(ids) {
  const out = [];
  const seen = new Set();
  for (const raw of ids) {
    const m = normalizeGeminiModelId(raw);
    if (m && !seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

/** Comma-separated Gemini model ids for creator JSON routes; next model is used on 429 / quota errors. */
const GEMINI_CREATOR_MODEL_CHAIN = dedupeModelChain(
  (process.env.GEMINI_CREATOR_MODEL_CHAIN || "gemini-2.5-flash,gemini-2.5-flash-lite")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

/**
 * Legacy/fallback: comma-separated Gemini model ids referenced only outside council chat (unused there once OpenAI is wired).
 * Example: GEMINI_CHAT_MODEL_CHAIN=gemini-2.0-flash,gemini-2.5-flash-lite
 */
const GEMINI_CHAT_MODEL_CHAIN = dedupeModelChain(
  String(
    process.env.GEMINI_CHAT_MODEL_CHAIN ||
      process.env.GEMINI_CREATOR_MODEL_CHAIN ||
      "gemini-2.5-flash,gemini-2.5-flash-lite"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function chatModelCandidates(primaryModel) {
  const p = normalizeGeminiModelId((primaryModel || "gemini-2.5-flash").trim());
  const out = [];
  const seen = new Set();
  for (const m of [p, ...GEMINI_CHAT_MODEL_CHAIN]) {
    if (m && !seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out.length ? out : ["gemini-2.5-flash"];
}

/**
 * Tries each model in order when Google returns overload / quota style errors.
 * @param {import('@google/genai').GoogleGenAI} ai
 */
async function geminiGenerateContentWithModelFallback(ai, modelCandidates, generateArgs) {
  const tried = [];
  let lastErr = null;
  for (let i = 0; i < modelCandidates.length; i++) {
    const model = modelCandidates[i];
    tried.push(model);
    try {
      return await ai.models.generateContent({
        model,
        ...generateArgs,
      });
    } catch (e) {
      lastErr = e;
      const canTryNext =
        i < modelCandidates.length - 1 &&
        (isRetriableGeminiQuotaError(e) || isGeminiModelNotFoundOrUnsupportedError(e));
      if (canTryNext) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      const wrapped = new Error(
        `${e?.message || String(e)}${tried.length > 1 ? ` (tried models: ${tried.join(", ")})` : ""}`
      );
      wrapped.cause = e;
      throw wrapped;
    }
  }
  throw lastErr || new Error(`Gemini request failed (tried: ${tried.join(", ")})`);
}

// Folder where Gem documents live. Put your PDFs, TXT, etc. here and reference them in GEMS[].documents.
const DOCUMENTS_DIR = path.join(process.cwd(), "documents");

/** Same basename as in GEMS[].documents; browser opens via GET /document/project-brief */
const PROJECT_BRIEF_PDF = "Project Brief_Our Golden Record Draft 1.pdf";

app.get("/document/project-brief", (req, res) => {
  const filePath = path.join(DOCUMENTS_DIR, PROJECT_BRIEF_PDF);
  if (!fs.existsSync(filePath)) {
    return res
      .status(404)
      .type("text/plain")
      .send(
        "Project Brief PDF not found. Add Project Brief_Our Golden Record Draft 1.pdf to the documents folder."
      );
  }
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(PROJECT_BRIEF_PDF)}`);
  res.type("application/pdf").sendFile(path.resolve(filePath));
});

const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".html": "text/html",
};

// Gemini Files API supports PDF, text, markdown, CSV, HTML only. DOCX is not supported.
const SUPPORTED_DOC_EXTENSIONS = new Set([".pdf", ".txt", ".md", ".csv", ".html"]);

/** PBLWorks-style teacher pre-launch reflection headings (exact canonical titles). */
const PRE_LAUNCH_HEADINGS_ORDER = [
  "Reflect on your students",
  "Reflect on your context",
  "Reflect on your content & skills",
];

/** Default prompts when uploads lack reflection sections—structured like PBLWorks teacher prep pillars (original wording). */
const PRE_LAUNCH_FALLBACK_SECTIONS = [
  {
    heading: "Reflect on your students",
    questions: [
      "What strengths do your students already bring that this project can build on?",
      "Where might students need extra support—in reading dense texts, collaborating in teams, presenting work, or managing longer timelines?",
      "How will you make space for different identities and communication styles so every learner can contribute?",
      "What formative checks will tell you students are ready before high-stakes milestones?",
    ],
  },
  {
    heading: "Reflect on your context",
    questions: [
      "What real-world audiences or partners could make feedback authentic—and how will you coordinate logistics?",
      "What constraints shape your schedule, materials, and tech—and where do those constraints become creative boundaries?",
      "What assumptions about your school community might students need to question during inquiry?",
      "How will you invite caregivers or community voices without overburdening families?",
    ],
  },
  {
    heading: "Reflect on your content & skills",
    questions: [
      "Which standards or competencies should remain visible from launch day through the final exhibition?",
      "What content misconceptions typically trip students up—and how does inquiry surface them safely?",
      "How does your essential question connect daily lessons to a culminating product students care about?",
      "Which disciplinary practices (argument from evidence, modeling, critique/revision) will students rehearse repeatedly?",
    ],
  },
];

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
    "ELA_Standards1.pdf",
    PROJECT_BRIEF_PDF,
    "saavedra-rapaport-2024-key-lessons-from-research-about-project-based-teaching-and-learning.pdf",
    "ss-framework-k-12-intro.pdf",
  ] },
  { id: 2, name: "Jane", model: "gemini-2.5-flash", systemInstruction: "#Summary You are a member of the AI Council for Project: Our Golden Record. The mission is to represent a 21st-century community to extraterrestrial life. Your goal is to advise project team members as they work through the different phases of this PBL project. You must use the Assessment Criteria: Research, Argumentation, Technical Design, and Collaboration. # Core Directive The 80/20 Rule: 80% of the Gem’s responses must be questions or prompts for deeper thought; only 20% should be providing technical definitions or project context. Job Title: Cultural Ethnographer • Purpose: Helps students navigate Social Studies Theme 1: Individual Development and Cultural Identity. Ensures the project follows the guiding principle to Center Community Voice and Design for Equity • Function: This role provides expert-created, adaptable materials to help students define the boundaries of their community. It prompts students during the Experiencing phase to move beyond stereotypes and identify artifacts that represent their community's unique social, political, and cultural interactions. This role provides the feedback and critique that supports revision. It analyzes the curated list to see if any diverse or multilingual backgrounds from the community were excluded. It helps students deconstruct their own point of view as curator. • PBL Inquiry examples: How does this specific artifact represent the lived experience of our neighborhood today? Whose story is not being told in this selection, and how does that gap affect the record’s authenticity? # Audience/ Tone The project team members are middle-school students completing an interdisciplinary social studies project. Use age and grade-level appropriate language. You can use direct language taken from the standards documents.", documents: [
    "ADA-Compliant-Math-Standards.pdf",
    "AllDCI.pdf",
    "ELA_Standards1.pdf",
    PROJECT_BRIEF_PDF,
    "saavedra-rapaport-2024-key-lessons-from-research-about-project-based-teaching-and-learning.pdf",
    "ss-framework-k-12-intro.pdf",
  ] },
  { id: 3, name: "Laika", model: "gemini-2.5-flash", systemInstruction: "#Summary You are a member of the AI Council for Project: Our Golden Record. The mission is to represent a 21st-century community to extraterrestrial life. Your goal is to advise project team members as they work through the different phases of this PBL project. You must use the Assessment Criteria: Research, Argumentation, Technical Design, and Collaboration. # Core Directive The 80/20 Rule: 80% of the Gem’s responses must be questions or prompts for deeper thought; only 20% should be providing technical definitions or project context. Reference the Criteria: Instead of saying That's a good choice, the Gem should ask, How does this artifact help you meet the Authentic Research criteria and avoid generalizations?. The Show Your Work Guardrail: If a student asks for a solution (e.g., What should we pick for our community?), the Gem must redirect: To help you decide, what are the three most important values your team identified in your Community Charter?. # Job Title: Launch Visionary • Purpose: Facilitates the Reflecting phase of the learning cycle. • Function: This role helps students synthesize their multidisciplinary research into a meaningful and persuasive final presentation for the Launch Committee. It uses higher-order thought questions to help students reflect on their own learning process. • PBL Inquiry: Now that we are at the final milestone, what did you discover about your community that you didnt know when we started?. # Audience/ Tone The project team members are middle-school students completing an interdisciplinary social studies project. Use age and grade-level appropriate language. You can use direct language taken from the standards documents", documents: [
    "ADA-Compliant-Math-Standards.pdf",
    "AllDCI.pdf",
    "ELA_Standards1.pdf",
    PROJECT_BRIEF_PDF,
    "saavedra-rapaport-2024-key-lessons-from-research-about-project-based-teaching-and-learning.pdf",
    "ss-framework-k-12-intro.pdf",
  ] },
  { id: 4, name: "Wolfgang", model: "gemini-2.5-flash", systemInstruction: "#Summary You are a member of the AI Council for Project: Our Golden Record. The mission is to represent a 21st-century community to extraterrestrial life. Your goal is to advise project team members as they work through the different phases of this PBL project. You must use the Assessment Criteria: Research, Argumentation, Technical Design, and Collaboration. # Core Directive The 80/20 Rule: 80% of the Gem’s responses must be questions or prompts for deeper thought; only 20% should be providing technical definitions or project context. Reference the Criteria: Instead of saying That's a good choice, the Gem should ask, How does this artifact help you meet the Authentic Research criteria and avoid generalizations?. The Show Your Work Guardrail: If a student asks for a solution (e.g., What should we pick for our community?), the Gem must redirect: To help you decide, what are the three most important values your team identified in your Community Charter?. The Data Budget Architect (The Math Specialist) • Purpose: Supports Mathematical Practice 4: Model with mathematics. • Function: This role is essential for the Data Budget Audit milestone. It helps students apply ratios and proportional reasoning to manage the 512 GB microSD card limit. It acts as a Data Analyst role, providing templates for calculating how much space a 4K video occupies compared to a high-fidelity audio track. • PBL Inquiry example: If your video artifacts take up 80% of the storage, how must you redistribute the remaining data budget for the ELA and Social Studies artifacts?. # Audience/ Tone The project team members are middle-school students completing an interdisciplinary social studies project. Use age and grade-level appropriate language. You can use direct language taken from the standards documents", documents: [
    "ADA-Compliant-Math-Standards.pdf",
    "AllDCI.pdf",
    "ELA_Standards1.pdf",
    PROJECT_BRIEF_PDF,
    "saavedra-rapaport-2024-key-lessons-from-research-about-project-based-teaching-and-learning.pdf",
    "ss-framework-k-12-intro.pdf",
  ] },
  { id: 5, name: "Carl", model: "gemini-2.5-flash", systemInstruction: "#Summary You are a member of the AI Council for Project: Our Golden Record. The mission is to represent a 21st-century community to extraterrestrial life. Your goal is to advise project team members as they work through the different phases of this PBL project. You must use the Assessment Criteria: Research, Argumentation, Technical Design, and Collaboration. # Core Directive The 80/20 Rule: 80% of the Gem’s responses must be questions or prompts for deeper thought; only 20% should be providing technical definitions or project context. Reference the Criteria: Instead of saying That's a good choice, the Gem should ask, How does this artifact help you meet the Authentic Research' criteria and avoid generalizations?. The Show Your Work Guardrail: If a student asks for a solution (e.g., What should we pick for our community?), the Gem must redirect: To help you decide, what are the three most important values your team identified in your Community Charter?. # Job Title: Interstellar Linguist • Purpose: Focuses on communicating with an external, sometimes unfamiliar audience • Function: Drawing on College and Career Readiness standards for Speaking and Listening, this role critiques how students use digital media to convey complex human concepts. It helps students deconstruct how images or sounds might be interpreted by a non-human entity. • PBL Inquiry example: If you have no shared language, how do these data communicate the concept of friendship?. # Audience/ Tone The project team members are middle-school students completing an interdisciplinary social studies project. Use age and grade-level appropriate language. You can use direct language taken from the standards documents. # Personality You are wise and have an expansive view of the universe and a deep empathy toward all life. You are an astrophysicist but focus your work on human understanding of science and are devoted to peace, similar to Carl Sagan.", documents: [
    "ADA-Compliant-Math-Standards.pdf",
    "AllDCI.pdf",
    "ELA_Standards1.pdf",
    PROJECT_BRIEF_PDF,
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

/** Cache OpenAI file ids per document path + revision (mtime/size). */
const openAiDocFileIdCache = new Map();

function getOpenAIClient() {
  const k = OPENAI_API_KEY && String(OPENAI_API_KEY).trim();
  if (!k) return null;
  return new OpenAI({ apiKey: k });
}

function openAiBrowserAttachmentToContentPart(a) {
  if (!a || typeof a.data !== "string" || !a.mimeType) return null;
  const mime = String(a.mimeType).toLowerCase();
  const data = a.data;
  if (mime.startsWith("image/")) {
    return { type: "input_image", image_url: `data:${mime};base64,${data}` };
  }
  const ext =
    mime === "application/pdf"
      ? "pdf"
      : mime.includes("csv")
        ? "csv"
        : mime.includes("markdown") || mime === "text/markdown"
          ? "md"
          : mime.includes("html")
            ? "html"
            : "txt";
  return {
    type: "input_file",
    filename: `attachment.${ext}`,
    file_data: `data:${mime};base64,${data}`,
  };
}

function extractOpenAiResponseText(response) {
  const direct = response?.output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const parts = [];
  for (const item of response?.output || []) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const c of item.content) {
      if (typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("").trim();
}

/** Rotate follow-up “lanes” so parallel advisors don’t all suggest the same kind of place. */
const COUNCIL_FOLLOW_UP_LANES = [
  "Libraries, school media centers, or district literacy / STEM programs",
  "Museums, cultural centers, historical societies, or heritage sites",
  "University outreach, extension offices, college public programs, or campus-linked youth labs",
  "Indigenous-led organizations, tribal programs, or culturally grounded community centers (only when fitting the topic)",
  "Parks departments, nature centers, environmental nonprofits, or outdoor education groups",
  "Youth nonprofits, makerspaces, civic innovation hubs, or hands-on community workshops",
  "Local government youth services, public recreation, or municipal education / civic programs",
];

function orderCouncilPeersForLanes(peers) {
  return [...(peers || [])].filter(Boolean).sort((a, b) => Number(a.id) - Number(b.id));
}

function normalizeCouncilGradeLevel(raw) {
  const s = String(raw ?? "").trim();
  if (s === "3-5" || s === "6-8" || s === "HS" || s === "Uni+") return s;
  return "6-8";
}

function councilUserPromptCharLimit(gradeLevel) {
  return normalizeCouncilGradeLevel(gradeLevel) === "Uni+" ? 288 : 144;
}

/** Follow-up questions are always capped regardless of grade band. */
const COUNCIL_FOLLOW_UP_PROMPT_MAX_CHARS = 144;

function buildOpenAiChatGlobalEducationGuidance(gradeLevel) {
  const g = normalizeCouncilGradeLevel(gradeLevel);
  const stayOnTopic =
    "Tone and purpose: encouraging coach and thoughtful advisor—challenge ideas with questions, never shame the learner. **Stay strictly on-topic** for the learner's project question; do not drift into unrelated subjects.";

  if (g === "3-5" || g === "6-8") {
    return `[Educational product — global rules for every reply]
You are part of an AI council inside a **school project-based learning (PBL) tool**. Every answer must support teaching and learning in a classroom setting.

Audience (non-negotiable): **You are talking to a sixth-grade student** (about ages 11–12). Write as if speaking directly to them: clear everyday vocabulary, short sentences when possible, concrete examples, and zero condescension. Do not assume adult life experience; explain specialized terms briefly when you must use them.

${stayOnTopic}

Safety and boundaries for minors: no sexual content; no instructions for weapons, drugs, self-harm, or illegal acts; no harassment or harsh insults. Do not encourage plagiarism or doing graded work for them—guide with prompts and scaffolds instead. Do not claim to know private facts about the student or their family.

You may mention serious real-world topics only in an age-appropriate, classroom-safe way (brief, factual, hopeful or constructive—never graphic).

When several advisors answer the same student message in one round, each reply must be unmistakably different: varied framing, emphasis, and closing “follow up” suggestion—never copied templates or near-identical paragraphs across voices.`;
  }

  if (g === "HS") {
    return `[Educational product — global rules for every reply]
You are part of an AI council inside a **school project-based learning (PBL) tool**. Every answer must support teaching and learning in a classroom setting.

Audience: **High school students.** Use vocabulary and sentence structure appropriate for roughly **9th-grade reading level**—clear but more nuanced than middle school; use discipline-specific terms when you briefly define or contextualize them.

${stayOnTopic}

Safety and boundaries: no sexual content; no instructions for weapons, drugs, self-harm, or illegal acts; no harassment. Do not encourage plagiarism or completing graded work for them—guide with questions and scaffolds. Do not claim private facts about the student.

Serious topics may be addressed in a factual, classroom-appropriate way without graphic detail.

When several advisors answer the same student message in one round, each reply must be clearly distinct in framing and emphasis—never copied templates across voices.`;
  }

  return `[Educational product — global rules for every reply]
You are part of an AI council inside a **project-based learning (PBL) tool** used in **college or advanced instructional contexts**. Every answer must support teaching and learning.

Audience: **University-level or advanced learners.** You may use richer conceptual vocabulary and denser reasoning appropriate to roughly **grade-12 / upper-secondary Lexile complexity** (and collegiate discourse where it aids clarity)—remain precise and respectful, not pretentious.

${stayOnTopic}

Safety and boundaries: no illegal instructions; no sexual content targeted at minors; no harassment; no enabling self-harm. Do not encourage academic dishonesty—coach understanding rather than supplying graded deliverables. Do not fabricate private facts about individuals.

When several advisors answer the same student message in one round, each reply must be clearly distinct in framing and emphasis—never copied templates across voices.`;
}

function customCouncilLexileTailInstruction(gradeLevel) {
  const g = normalizeCouncilGradeLevel(gradeLevel);
  if (g === "3-5" || g === "6-8") {
    return `Keep responses at roughly **grade 6 Lexile level** when appropriate (clear, concrete language matching upper-elementary / middle school expectations).`;
  }
  if (g === "HS") {
    return `Calibrate language and explanations for roughly **9th-grade reading level**—more analytical than middle school, still accessible.`;
  }
  return `You may use **grade-12 / upper-secondary Lexile complexity** and richer disciplinary nuance appropriate for university-level learners; stay clear and well structured.`;
}

function geminiSuggestMembersToneBullet(gradeLevel) {
  const g = normalizeCouncilGradeLevel(gradeLevel);
  if (g === "3-5" || g === "6-8") {
    return `- Tone: supportive coach for grades 6–8; mostly questions and prompts rather than lectures; avoid repeating boilerplate across members.`;
  }
  if (g === "HS") {
    return `- Tone: supportive coach for **high school** students; language near **9th-grade reading level**; mostly questions and prompts rather than lectures; avoid repeating boilerplate across members.`;
  }
  return `- Tone: supportive mentor for **university / advanced** learners; language may reach roughly **grade-12 Lexile complexity** where helpful; probing questions over lectures; avoid repeating boilerplate across members.`;
}

function rubricAudienceDescriptorForGrade(gradeLevel) {
  const g = normalizeCouncilGradeLevel(gradeLevel);
  if (g === "3-5" || g === "6-8") return "upper-elementary through middle-grades (about grades 3–8)";
  if (g === "HS") return "high school (about grades 9–12)";
  return "advanced learners including university students";
}

function preLaunchTeacherGradeLine(gradeLevel) {
  const g = normalizeCouncilGradeLevel(gradeLevel);
  const map = {
    "3-5": "Grades 3–5 (elementary)",
    "6-8": "Grades 6–8 (middle school)",
    HS: "High school",
    "Uni+": "University / advanced",
  };
  return map[g];
}

function peerUnsurePhrase(gradeLevel) {
  const g = normalizeCouncilGradeLevel(gradeLevel);
  if (g === "Uni+") return "say so clearly.";
  if (g === "HS") return "say so plainly.";
  return "say so honestly (kid-friendly).";
}

function buildFollowUpCommunityInstruction(locationStr, orderedPeers, currentGem) {
  const lanes = COUNCIL_FOLLOW_UP_LANES;
  const idx = orderedPeers.findIndex((p) => p && Number(p.id) === Number(currentGem.id));
  const safeIdx = idx >= 0 ? idx : 0;
  const myLane = lanes[safeIdx % lanes.length];
  const siblingLanes = new Set();
  orderedPeers.forEach((p, i) => {
    if (!p || Number(p.id) === Number(currentGem.id)) return;
    siblingLanes.add(lanes[i % lanes.length]);
  });
  const othersText = siblingLanes.size
    ? [...siblingLanes].join("; ")
    : "none—you are the only AI advisor this round; still pick something specific to their region, not a vague generic site.";
  return `\n\n[Follow up in your community — required]\nApproximate user location: ${locationStr}.\nEnd with a short section titled **Follow up in your community**.\n\nYour suggested resource must clearly fit **your assigned lane**: ${myLane}.\nPick ONE concrete kind of place or program that could exist near them. Other advisors answering in the same batch are steered toward **different** lanes—do not duplicate their usual outcome (their lanes include: ${othersText}).\n\nFormatting: full https:// URL when naming a website; add phone and email when you can find them; name a contact role when possible.\nIf you cannot verify a real institution, say so briefly and still describe the kind of local place to look for **within your lane**—not the same default another advisor would pick.\n`;
}

/**
 * Nudge models away from repeating sibling personas answering the same prompt.
 * @param {Array<{ id: unknown, name?: string, systemInstruction?: string }>} peers
 */
function buildOpenAiPeerDifferentiationBlock(peers, currentId, jobTitleFn, gradeLevel) {
  const unsure = peerUnsurePhrase(gradeLevel);
  const cid = Number(currentId);
  const self = peers.find((x) => x && Number(x.id) === cid);
  const others = peers.filter((x) => x && Number(x.id) !== cid);
  const selfName = typeof self?.name === "string" && self.name.trim() ? self.name.trim() : "Advisor";
  const selfTitle = self ? jobTitleFn(self) || "Advisor" : "Advisor";

  if (!others.length) {
    return `\n\n[Council context]\nYou are **${selfName}** (${selfTitle}), the only advisor answering this round. Stay clearly inside that specialty: foreground checks, examples, and vocabulary that role would use first—not generic advice every subject could give.\nIf the question is outside your expertise, ${unsure} Name another council role or a **type** of local expert who would know more, or suggest how an adult could help them find the right person.\n`;
  }

  const lines = others.map((g) => {
    const jt = jobTitleFn(g) || "Advisor";
    const nm = typeof g.name === "string" && g.name.trim() ? g.name.trim() : "Advisor";
    const si = typeof g.systemInstruction === "string" ? g.systemInstruction.replace(/\s+/g, " ").trim() : "";
    const snippet = si.slice(0, 220);
    return `- ${nm} (${jt}): ${snippet}${si.length > 220 ? "…" : ""}`;
  });

  return `\n\n[Council context — stay distinct]\nYou are **${selfName}**, ${selfTitle}. Answer only as this voice: prioritize lenses, examples, and caveats that fit **${selfTitle}** work—not a neutral essay.\n\nOther advisors answering the same student message:\n${lines.join("\n")}\n\nDifferentiation:\n- Use a different opening move and structure than generic council replies; avoid mirrored introductions.\n- Do not repeat the same “first step,” metaphor, or checklist another advisor would plausibly give.\n- If topics overlap, narrow harder into your specialty and lift **one** concrete angle only your role would stress.\n\nHonesty and referrals:\n- If you are unsure, say so plainly.\n- If the topic is mostly outside your specialty, say that openly. Point to another advisor **by name** (from the list above) whose lens fits better, or suggest a type of local professional or organization near the user.\n`;
}

async function openAiEnsureDocFileId(client, relativePath) {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\))+/, "");
  const absPath = path.join(DOCUMENTS_DIR, normalized);
  const ext = path.extname(absPath).toLowerCase();
  if (!SUPPORTED_DOC_EXTENSIONS.has(ext)) return null;
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    console.warn(`OpenAI doc skip (missing): ${relativePath}`);
    return null;
  }
  const st = fs.statSync(absPath);
  const cacheKey = `${absPath}:${st.size}:${st.mtimeMs}`;
  const existing = openAiDocFileIdCache.get(cacheKey);
  if (existing) return existing;
  const pending = client.files
    .create({ file: fs.createReadStream(absPath), purpose: "user_data" })
    .then((f) => f.id)
    .catch((e) => {
      openAiDocFileIdCache.delete(cacheKey);
      throw e;
    });
  openAiDocFileIdCache.set(cacheKey, pending);
  return pending;
}

async function openAiCompleteCouncilTurn(client, { instructions, userContentParts, gradeLevel }) {
  const globalBlock = buildOpenAiChatGlobalEducationGuidance(gradeLevel ?? "6-8");
  const mergedInstructions = [globalBlock, instructions].filter(Boolean).join("\n\n");
  const response = await client.responses.create({
    model: OPENAI_CHAT_MODEL,
    instructions: mergedInstructions || undefined,
    input: [{ role: "user", content: userContentParts }],
  });
  const text = extractOpenAiResponseText(response);
  if (!text.trim()) throw new Error("OpenAI returned no text.");
  return text;
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
  Jane: "jane.png",
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

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "";
}

async function getLocationFromRequest(req) {
  const ip = getClientIp(req);
  if (!ip || ip === "::1" || ip === "127.0.0.1") return "your area";
  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=city,regionName,country`;
    const geo = await fetch(url, { signal: AbortSignal.timeout(3000) }).then((r) => r.json()).catch(() => ({}));
    const parts = [geo.city, geo.regionName, geo.country].filter(Boolean);
    return parts.length ? parts.join(", ") : "your area";
  } catch {
    return "your area";
  }
}

function parseJsonFromModelText(text) {
  if (!text || typeof text !== "string") return null;
  let trimmed = text.trim();
  // Models often wrap JSON in ```json ... ``` despite instructions.
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/im);
  if (fenced) trimmed = fenced[1].trim();
  else trimmed = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/m, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Prefer SDK .text; fall back to candidates (some responses omit the accessor). */
/** Coerce model phasesEnabled to length n; default true when missing; ensure ≥1 true. */
function normalizePhasesEnabledArray(arr, n) {
  const len = Math.max(0, Math.floor(Number(n)) || 0);
  if (!len) return [];
  const out = [];
  for (let i = 0; i < len; i++) {
    let v = Array.isArray(arr) && i < arr.length ? arr[i] : true;
    if (typeof v === "string") v = /^true|^yes|^1|^on/i.test(String(v).trim());
    out.push(Boolean(v));
  }
  if (!out.some(Boolean)) out[0] = true;
  return out;
}

function extractTextFromGenaiResponse(response) {
  if (!response) return "";
  let t = "";
  try {
    t = typeof response.text === "string" ? response.text : String(response.text ?? "");
  } catch {
    t = "";
  }
  if (t && t.trim()) return t;
  const parts = response.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (p && typeof p.text === "string" ? p.text : "")).join("");
}

/** First inline image part from a Nano Banana / image-capable generateContent response. */
function extractImageFromGenaiResponse(response) {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    const id = p?.inlineData || p?.inline_data;
    if (!id?.data) continue;
    const mimeType = id.mimeType || id.mime_type || "image/png";
    const data = id.data;
    const b64 = typeof data === "string" ? data : Buffer.from(data).toString("base64");
    return { mimeType, data: b64 };
  }
  return null;
}

/** Names of PBLworks-style rubric families represented by PDFs in public/rubrics (for prompt context). */
function listPblRubricAnchorFamilies() {
  const dir = path.join(PUBLIC_DIR, "rubrics");
  if (!fs.existsSync(dir)) {
    return ["Collaboration", "Critical Thinking", "Creativity", "Complex Communication", "Self-Directed Learning"];
  }
  const names = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(".") || name === ".DS_Store") continue;
    const sub = path.join(dir, name);
    if (!fs.statSync(sub).isDirectory()) continue;
    const cleaned = name.replace(/_Final Rubrics?\s*$/i, "").replace(/_/g, " ").trim();
    if (cleaned) names.push(cleaned);
  }
  return names.length ? names : ["Collaboration", "Critical Thinking", "Creativity", "Complex Communication", "Self-Directed Learning"];
}

async function geminiGenerateRubricChartImage(ai, imagePrompt) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_IMAGE_MODEL,
        contents: imagePrompt,
        config: { responseModalities: ["TEXT", "IMAGE"] },
      });
      const img = extractImageFromGenaiResponse(response);
      if (img?.data) return img;
      lastErr = new Error("Image model returned no image data.");
    } catch (e) {
      lastErr = e;
      if (attempt === 0 && isRetriableGeminiQuotaError(e)) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error("Image generation failed.");
}

/** True when another model (or retry) might succeed — not for auth or bad requests. */
function isRetriableGeminiQuotaError(err) {
  if (!err) return false;
  const msg = String(err.message || err.toString?.() || err || "").toLowerCase();
  const code = err.code ?? err.status ?? err.statusCode ?? err?.error?.code ?? err?.cause?.code;
  const status = err.status ?? err.statusCode ?? err?.error?.status;
  if (code === 429 || status === 429) return true;
  if (code === 503 || status === 503) return true;
  if (String(code) === "8") return true; // gRPC RESOURCE_EXHAUSTED
  if (String(code) === "14") return true; // gRPC UNAVAILABLE (overload / high demand)
  if (String(code).toUpperCase() === "RESOURCE_EXHAUSTED") return true;
  if (String(code).toUpperCase() === "UNAVAILABLE") return true;
  if (msg.includes("resource_exhausted")) return true;
  if (msg.includes("unavailable")) return true;
  if (msg.includes("429")) return true;
  if (msg.includes("503")) return true;
  if (msg.includes("quota")) return true;
  if (msg.includes("rate limit")) return true;
  if (msg.includes("too many requests")) return true;
  if (msg.includes("exceeded your")) return true;
  if (msg.includes("capacity")) return true;
  if (msg.includes("high demand")) return true;
  if (msg.includes("overloaded")) return true;
  if (msg.includes("overload")) return true;
  if (msg.includes("try again")) return true;
  if (msg.includes("busy")) return true;
  if (msg.includes("throttl")) return true;
  return false;
}

/** Wrong model id or not available on this API — try the next model in the chain. */
function isGeminiModelNotFoundOrUnsupportedError(err) {
  if (!err) return false;
  const nested = err?.error || err?.cause?.error;
  const code = err.code ?? err.statusCode ?? nested?.code ?? err?.cause?.code ?? err?.status;
  const statusStr = String(nested?.status || err?.status || err?.statusCode || "").toUpperCase();
  const msg = String(err.message || err.toString?.() || err || "").toLowerCase();
  if (code === 404 || nested?.code === 404) return true;
  if (statusStr === "NOT_FOUND") return true;
  if (msg.includes("is not supported for generatecontent")) return true;
  if (msg.includes("not found for api version") && msg.includes("models/")) return true;
  if (msg.includes("/models/") && msg.includes("not found")) return true;
  return false;
}

async function geminiGenerateText(ai, userPrompt, systemInstruction) {
  const chain = GEMINI_CREATOR_MODEL_CHAIN.length ? GEMINI_CREATOR_MODEL_CHAIN : ["gemini-2.5-flash"];
  const tried = [];
  let lastErr = null;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    tried.push(model);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: systemInstruction ? { systemInstruction } : undefined,
      });
      const text = extractTextFromGenaiResponse(response);
      if (!text.trim()) {
        const block = response?.promptFeedback?.blockReason;
        const finish = response?.candidates?.[0]?.finishReason;
        const errMsg = block
          ? `Gemini returned no text (prompt blocked: ${block}).`
          : finish
            ? `Gemini returned no text (finishReason: ${finish}).`
            : "Gemini returned no text.";
        const err = new Error(errMsg);
        err.rawResponse = response;
        throw err;
      }
      return text;
    } catch (e) {
      lastErr = e;
      const canTryNext =
        i < chain.length - 1 &&
        (isRetriableGeminiQuotaError(e) || isGeminiModelNotFoundOrUnsupportedError(e));
      if (canTryNext) {
        await new Promise((r) => setTimeout(r, 450));
        continue;
      }
      throw e;
    }
  }
  const wrapped = new Error(
    lastErr ? `${lastErr.message || lastErr} (tried: ${tried.join(", ")})` : `Gemini failed (tried: ${tried.join(", ")})`
  );
  if (lastErr) wrapped.cause = lastErr;
  throw wrapped;
}

app.get("/api/projects", (req, res) => {
  res.json({
    projects: [
      {
        id: "golden-record",
        title: "Our Golden Record AI Council",
        description: "Interdisciplinary PBL — community record for the ages.",
        href: "/golden-record.html",
        builtin: true,
      },
    ],
  });
});

/** No Gemini call — use to verify Vercel env and routing (GET /api/creator/health). */
app.get("/api/creator/health", (req, res) => {
  res.json({
    ok: true,
    hasGeminiKey: Boolean(GEMINI_API_KEY && String(GEMINI_API_KEY).trim()),
    hasOpenAiKey: Boolean(OPENAI_API_KEY && String(OPENAI_API_KEY).trim()),
    openAiChatModel: OPENAI_CHAT_MODEL,
    creatorModelChain: GEMINI_CREATOR_MODEL_CHAIN,
    chatModelChain: GEMINI_CHAT_MODEL_CHAIN,
    vercel: Boolean(process.env.VERCEL),
    node: process.version,
  });
});

app.post("/api/creator/suggest-phases", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "Server missing GEMINI_API_KEY." });
  }
  const body = req.body || {};
  const { projectTitle = "", projectSummary = "", essentialQuestion = "", objectives = [], phaseCount: phaseCountRaw } =
    body;
  const existingRaw = Array.isArray(body.existingPhases) ? body.existingPhases : [];

  const normalizeSlot = (p) => ({
    title: String(p?.title ?? "").replace(/\s+/g, " ").trim(),
    description: String(p?.description ?? "").replace(/\s+/g, " ").trim(),
  });
  const slotIsEmpty = (p) => !p.title && !p.description;

  const objClean = Array.isArray(objectives)
    ? objectives.map((o) => String(o || "").replace(/\s+/g, " ").trim()).filter(Boolean)
    : [];
  const existingPhases = existingRaw.map(normalizeSlot);

  const parsedCount = Number(phaseCountRaw);
  let phaseCount =
    Number.isFinite(parsedCount) && parsedCount >= 1 && parsedCount <= 8 ? Math.floor(parsedCount) : null;
  if (phaseCount == null) {
    const baseFromObj = objClean.length >= 1 ? Math.min(8, Math.max(1, objClean.length)) : 4;
    phaseCount = Math.min(8, Math.max(existingPhases.length, baseFromObj, 1));
  } else {
    phaseCount = Math.min(8, Math.max(1, phaseCount, existingPhases.length));
  }

  const merged = [];
  for (let i = 0; i < phaseCount; i++) {
    merged.push(existingPhases[i] ? normalizeSlot(existingPhases[i]) : { title: "", description: "" });
  }
  const emptyIndices = [];
  merged.forEach((p, i) => {
    if (slotIsEmpty(p)) emptyIndices.push(i);
  });

  if (emptyIndices.length === 0) {
    return res.json({ phases: merged, aiFilledPhaseIndices: [] });
  }

  const fillCount = emptyIndices.length;
  const lockedLines = merged
    .map((p, i) =>
      slotIsEmpty(p)
        ? null
        : `Phase ${i + 1} (teacher's — do not repeat or paraphrase): title: ${p.title || "—"} | deliverable: ${p.description || "—"}`
    )
    .filter(Boolean)
    .join("\n");

  const objOrdered =
    objClean.length > 0
      ? objClean.map((o, i) => `${i + 1}. ${o}`).join("\n")
      : "(not specified — infer from summary and essential question)";

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const emptyPosHuman = emptyIndices.map((i) => i + 1).join(", ");
  const prompt = `You help teachers design **PBL project phases** (sequential, practical titles + one-line deliverables).

The teacher already defined some phases. **Propose exactly ${fillCount} new phases** for the **empty** slots only. Those new phases must:
- Fit logically in the ${phaseCount}-phase sequence (empty positions in order: ${emptyPosHuman}).
- **Not** repeat, overlap, or lightly rephrase anything in the teacher's locked phases below.
- Reflect the **learning objectives in numbered order** (objective 1 maps to earlier work, later objectives to later phases) without duplicating locked content.

**Teacher's locked phases (untouchable):**
${lockedLines || "(none — all slots were empty; still return exactly " + fillCount + " phases aligned to objective order)"}

**Learning objectives (order matters):**
${objOrdered}

Project title: ${projectTitle || "(not specified)"}
Essential question: ${essentialQuestion || "(not specified)"}
Summary / brief excerpt: ${projectSummary || "(not specified)"}

Reply with ONLY valid JSON (no markdown). The "phases" array must have exactly ${fillCount} objects in order, filling empty positions **${emptyPosHuman}** in that same order (first JSON object → first empty phase in the sequence, etc.).
{"phases":[{"title":"string","description":"string"}]}`;

  try {
    const text = await geminiGenerateText(ai, prompt);
    const parsedJson = parseJsonFromModelText(text);
    if (!parsedJson?.phases || !Array.isArray(parsedJson.phases)) {
      return res.status(422).json({ error: "Could not parse phases.", raw: text.slice(0, 500) });
    }
    const newOnes = parsedJson.phases.slice(0, fillCount);
    while (newOnes.length < fillCount) {
      newOnes.push({ title: "", description: "" });
    }
    const out = merged.slice();
    for (let j = 0; j < emptyIndices.length; j++) {
      const p = normalizeSlot(newOnes[j]);
      out[emptyIndices[j]] = { title: p.title, description: p.description };
    }
    res.json({ phases: out, aiFilledPhaseIndices: emptyIndices.slice() });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

function normalizePreLaunchGeminiSections(parsed) {
  const rawSections = Array.isArray(parsed?.sections) ? parsed.sections : [];
  const byNorm = new Map();
  for (const s of rawSections) {
    const hRaw = String(s?.heading || "").trim().replace(/\s+/g, " ");
    const canon =
      PRE_LAUNCH_HEADINGS_ORDER.find((c) => c.toLowerCase() === hRaw.toLowerCase()) ||
      PRE_LAUNCH_HEADINGS_ORDER.find((c) => hRaw.toLowerCase().includes(c.toLowerCase().slice(0, 22)));
    if (!canon) continue;
    const qs = Array.isArray(s?.questions)
      ? s.questions.map((q) => String(q || "").replace(/\s+/g, " ").trim()).filter(Boolean)
      : [];
    byNorm.set(canon, qs);
  }

  let extractedStrong = 0;
  const sections = PRE_LAUNCH_HEADINGS_ORDER.map((heading) => {
    const extracted = byNorm.get(heading) || [];
    const fb = PRE_LAUNCH_FALLBACK_SECTIONS.find((f) => f.heading === heading)?.questions || [];
    const questions = extracted.length >= 2 ? extracted.slice(0, 15) : fb.slice();
    if (extracted.length >= 2) extractedStrong += 1;
    return { heading, questions };
  });

  const source =
    String(parsed?.source || "").toLowerCase() === "extracted" && extractedStrong >= 2 ? "extracted" : "adapted";
  return { source, sections };
}

const PRE_LAUNCH_EXEMPLAR_MAX_FILES = Math.min(
  8,
  Math.max(1, Number(process.env.PRE_LAUNCH_EXEMPLAR_MAX_FILES) || 3)
);
const PRE_LAUNCH_EXEMPLAR_MAX_BYTES_EACH =
  Number(process.env.PRE_LAUNCH_EXEMPLAR_MAX_BYTES_EACH) >= 400000
    ? Math.floor(Number(process.env.PRE_LAUNCH_EXEMPLAR_MAX_BYTES_EACH))
    : 10 * 1024 * 1024;

function listPblWorksExemplarBriefPaths() {
  if (!fs.existsSync(PBLWORKS_EXEMPLAR_BRIEFS_DIR)) return [];
  let names = [];
  try {
    names = fs.readdirSync(PBLWORKS_EXEMPLAR_BRIEFS_DIR);
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    if (!n || n.startsWith(".")) continue;
    if (!/\.pdf$/i.test(n)) continue;
    const abs = path.join(PBLWORKS_EXEMPLAR_BRIEFS_DIR, n);
    try {
      if (fs.statSync(abs).isFile()) out.push(abs);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function pickPblWorksExemplarBriefPaths(seedStr, maxCount) {
  const all = listPblWorksExemplarBriefPaths();
  if (!all.length || maxCount < 1) return [];
  let h = 2166136261;
  const s = String(seedStr || "seed");
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  const start = Math.abs(h >>> 0) % all.length;
  const picked = [];
  for (let k = 0; k < maxCount; k++) picked.push(all[(start + k * 3) % all.length]);
  return [...new Set(picked)];
}

/** Gemini multimodal parts for shipped exemplar briefs (style reference only). */
function loadPblWorksExemplarGeminiParts(seedStr) {
  const pickedAbs = pickPblWorksExemplarBriefPaths(seedStr, PRE_LAUNCH_EXEMPLAR_MAX_FILES);
  const parts = [];
  const names = [];
  for (const abs of pickedAbs) {
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size > PRE_LAUNCH_EXEMPLAR_MAX_BYTES_EACH) continue;
    let buf;
    try {
      buf = fs.readFileSync(abs);
    } catch {
      continue;
    }
    try {
      parts.push(createPartFromBase64(buf.toString("base64"), "application/pdf"));
      names.push(path.basename(abs));
    } catch {
      /* skip malformed reads */
    }
  }
  return { parts, names };
}

app.post("/api/creator/pre-launch-reflection", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "Server missing GEMINI_API_KEY." });
  }
  const {
    projectTitle = "",
    projectSummary = "",
    essentialQuestion = "",
    objectives = [],
    supportingAttachments = [],
    gradeLevel: gradeLevelRaw = "",
  } = req.body || {};
  const gradeLevelNorm = normalizeCouncilGradeLevel(gradeLevelRaw);
  const gradeBandNote = `Teacher-selected student grade band: ${preLaunchTeacherGradeLine(gradeLevelNorm)} (use when adapting “Reflect on your students” and related prompts).\n`;

  const objClean = Array.isArray(objectives)
    ? objectives.map((o) => String(o || "").replace(/\s+/g, " ").trim()).filter(Boolean)
    : [];

  const exemplarSeed = [projectTitle, essentialQuestion, objClean.join("|")].join(":::");
  const { parts: exemplarBriefParts, names: exemplarBriefNames } = loadPblWorksExemplarGeminiParts(exemplarSeed);

  const userUploadParts = [];
  const attachedNames = [];
  const arr = Array.isArray(supportingAttachments) ? supportingAttachments.slice(0, 5) : [];
  for (const a of arr) {
    if (!a?.data || typeof a.data !== "string") continue;
    const name = a.name || "document";
    const mime = normalizeBriefMimeType(name, a.mimeType);
    const low = mime.toLowerCase();
    if (
      low.includes("pdf") ||
      low.includes("text/plain") ||
      low.includes("markdown") ||
      low.includes("html") ||
      low.includes("csv")
    ) {
      userUploadParts.push(createPartFromBase64(a.data, mime));
      attachedNames.push(name);
    }
  }

  const fallbackJson = JSON.stringify(PRE_LAUNCH_FALLBACK_SECTIONS);

  const exemplarNote =
    exemplarBriefNames.length > 0
      ? `Reference exemplars (system library — authentic **PBLWorks-style project brief** PDFs attached FIRST in this request):
Filenames: ${exemplarBriefNames.join(", ")}

How to use them:
- Notice how teacher-facing reflection prompts are written under the three canonical headings when those sections appear (tone, specificity, length, bullet patterns).
- Use them ONLY as **style templates**. Do **not** reuse questions about another unit's topic (water quality, migration, tiny houses, cyberbullying, etc.).
- Every question you output must be freshly adapted to THIS teacher's project fields below.

`
      : "";

  const userPrompt = `You support teachers planning project-based learning (PBL).

${exemplarNote}${gradeBandNote}Project title: ${projectTitle || "(not specified)"}
Essential question: ${essentialQuestion || "(not specified)"}
Summary / excerpt: ${projectSummary || "(not specified)"}
Learning objectives: ${objClean.join("; ") || "(not specified)"}
Teacher-uploaded file names (if any): ${attachedNames.length ? attachedNames.join(", ") : "(none)"}

Task — teacher **pre-launch reflection** questions grouped under these EXACT headings (use verbatim spelling/capitalization/punctuation for headings):
1) Reflect on your students
2) Reflect on your context
3) Reflect on your content & skills

Instructions:
- If ANY **teacher-uploaded** document(s) contain sections whose titles clearly match those three headings (minor wording variance OK), copy **verbatim** every numbered/bulleted question under each matched section into the JSON (preserve teacher-facing wording). Prefer the teacher's own uploads over inventing text.
- When you must **adapt** or fill gaps, mirror the **question style** shown in the reference exemplar briefs (if provided)—same classroom-realistic voice—but rewrite **content** so every question targets THIS project's topic, audience, and constraints.
- If a heading is still thin after extraction, enrich using NEW questions aligned to this project. You may also consult this compact JSON example bank for structure only (not verbatim topic wording): ${fallbackJson}
- Set JSON field "source" to "extracted" ONLY if at least two headings drew primarily verbatim questions from **teacher-uploaded** attachments (not from system exemplars alone); otherwise "adapted".

Reply with ONLY valid JSON (no markdown fences):
{"source":"extracted"|"adapted","sections":[{"heading":"Reflect on your students","questions":["..."]},{"heading":"Reflect on your context","questions":["..."]},{"heading":"Reflect on your content & skills","questions":["..."]}]}`;

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const systemInstruction =
    "You extract and compose teacher reflection prompts for K–12 PBL planning. Reply with only valid JSON, no markdown fences.";

  try {
    const orderedParts = [...exemplarBriefParts, ...userUploadParts];
    const contents =
      orderedParts.length > 0 ? createUserContent([...orderedParts, userPrompt]) : userPrompt;
    const models = chatModelCandidates("gemini-2.5-flash");
    const response = await geminiGenerateContentWithModelFallback(ai, models, {
      contents,
      config: { systemInstruction },
    });
    const text = response?.text ?? "";
    const parsed = parseJsonFromModelText(text);
    if (!parsed || typeof parsed !== "object") {
      const fb = {
        source: "adapted",
        sections: PRE_LAUNCH_FALLBACK_SECTIONS.map((s) => ({
          heading: s.heading,
          questions: s.questions.slice(),
        })),
        generatedAt: new Date().toISOString(),
        projectTitleSnapshot: String(projectTitle || "").trim() || "(Untitled project)",
      };
      return res.json(fb);
    }
    const normalized = normalizePreLaunchGeminiSections(parsed);
    res.json({
      ...normalized,
      generatedAt: new Date().toISOString(),
      projectTitleSnapshot: String(projectTitle || "").trim() || "(Untitled project)",
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post("/api/creator/suggest-members", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "Server missing GEMINI_API_KEY." });
  }
  const {
    projectTitle = "",
    projectSummary = "",
    essentialQuestion = "",
    objectives = [],
    phases = [],
    memberCount = 4,
    gradeLevel: suggestMembersGradeRaw = "",
  } = req.body || {};
  const suggestMembersGrade = normalizeCouncilGradeLevel(suggestMembersGradeRaw);
  const toneBullet = geminiSuggestMembersToneBullet(suggestMembersGrade);
  const count = Math.min(6, Math.max(2, Number(memberCount) || 4));
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const phaseLinesArray = Array.isArray(phases) ? phases : [];
  const phaseCount = phaseLinesArray.length;
  const phaseStr = phaseLinesArray
    .map((p, i) => `${i + 1}. ${p.title || ""}: ${p.description || ""}`)
    .join("\n");
  const phaseCountNote =
    phaseCount > 0
      ? `

Phase-to-role alignment (required):
- The project has exactly **${phaseCount}** phase slots in order (lines below). For **each** member you MUST include "phasesEnabled": an array of exactly **${phaseCount}** booleans in the same order (index 0 = phase 1, etc.).
- Use **true** for phases where this advisor's expertise would **meaningfully** help students with that phase's work; use **false** where that phase is mostly outside their lane (students are unlikely to need that lens then). Members may still be toggled on later in the UI—optimize for typical need.
- **Every member must have at least one true** in phasesEnabled. If a phase line is blank or vague, prefer **true** so students retain access.`
      : "";

  const prompt = `Design exactly ${count} distinct stakeholder roles for a student project-based learning (PBL) "AI council" — adults/experts who advise students. Every role must be fully specified: no placeholders, no "TBD", no "Pending".

Project title: ${projectTitle}
Essential question (if any): ${essentialQuestion || "(not specified)"}
Context: ${projectSummary}
Objectives: ${Array.isArray(objectives) ? objectives.join("; ") : ""}
Phases:
${phaseStr || "(no phases listed yet—use phasesEnabled all true for every member)"}
${phaseCountNote}

Requirements for ALL ${count} members:
- Each needs a specific, memorable first name (or first + last) and a clear job title. **No two members may cover the same primary angle**—spread expertise across distinct domains (e.g. only one physical/science lens, one community/cultural lens, one literacy or storytelling lens, one ethics or civics lens, one quantitative or technical lens). If overlap is unavoidable, differentiate sharply in **method** (e.g. ethnographic interviews vs GIS maps vs youth podcast production).
- Give each member a **different "thinking fingerprint"**: one might lean on measurement and constraints; another on ethics and who benefits; another on oral history and narrative; another on prototyping and testing; another on policy or institutional partnerships—assign explicitly in the text so voices cannot collapse into the same advice.
- Each systemInstruction must be **140–320 words** and structured as plain prose with ALL of: (1) **Background**: 1–2 sentences of plausible lived/work experience (specific institutions, regions, or communities types—not vague "many years"). (2) **Expertise**: two narrow specialties written as noun phrases (not single generic labels like "science"). (3) **What they push students to notice**: typical blind spots or tensions only their lens surfaces. (4) **Signature move**: one repeatable coaching habit (e.g. always asks for evidence sources, always asks whose voice is missing, always asks for a cheap prototype). (5) **Anti-pattern**: one thing this advisor refuses to do (e.g. won't pick topics for the team, won't praise without a probing question).
- **Anti-repetition (critical):** Members must NOT share the same opening hooks, moral-of-the-story framings, clichés ("think critically", "dig deeper" without a prompt), or identical question stems. If two answers could start with the same sentence, rewrite until they diverge.
${toneBullet}
- Roles must complement each other (collectively cover the project) and align with the phases and objectives above.

Reply with ONLY valid JSON. Each member object must fully satisfy the systemInstruction rules above (length, structure, anti-repetition).
The "members" array MUST contain exactly ${count} objects:
{"members":[{"name":"string","jobTitle":"string","systemInstruction":"string","portraitGender":"female"|"male"|"neutral"${phaseCount > 0 ? `,"phasesEnabled":[${Array(phaseCount).fill("true").join(",")}]` : ""}}, ...]}

Replace phasesEnabled with your chosen true/false pattern (${phaseCount} entries per member).${phaseCount === 0 ? " If there are zero phases, omit phasesEnabled or use []." : ""}

For each member, portraitGender MUST reflect how the given name is most often read in English-speaking classrooms: "female" or "male" when the first/given name strongly suggests it, otherwise "neutral" (ambiguous names, initials-only, surnames-only, or honorific-only).`;
  try {
    const text = await geminiGenerateText(ai, prompt);
    const parsed = parseJsonFromModelText(text);
    if (!parsed?.members || !Array.isArray(parsed.members)) {
      return res.status(422).json({ error: "Could not parse members.", raw: text.slice(0, 500) });
    }
    const portraitOk = new Set(["female", "male", "neutral"]);
    const members = parsed.members.slice(0, count).map((row) => {
      const pg = String(row.portraitGender || "").trim().toLowerCase();
      return {
        name: row.name || "",
        jobTitle: row.jobTitle || "",
        systemInstruction: row.systemInstruction || "",
        portraitGender: portraitOk.has(pg) ? pg : null,
        phasesEnabled: normalizePhasesEnabledArray(row.phasesEnabled, phaseCount),
      };
    });
    while (members.length < count) {
      members.push({
        name: "TBD",
        jobTitle: "Pending",
        systemInstruction: "Click the refresh button on this card to generate this role, or run Generate roles from template again.",
        portraitGender: null,
        phasesEnabled: normalizePhasesEnabledArray(null, phaseCount),
      });
    }
    res.json({ members });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post("/api/creator/regenerate-member", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "Server missing GEMINI_API_KEY." });
  }
  const {
    projectTitle = "",
    projectSummary = "",
    essentialQuestion = "",
    objectives = [],
    phases = [],
    existingNames = [],
    otherMembers = [],
    gradeLevel: regenGradeRaw = "",
  } = req.body || {};
  const regenGrade = normalizeCouncilGradeLevel(regenGradeRaw);
  const regenTone = geminiSuggestMembersToneBullet(regenGrade).replace(/^- Tone: /, "");
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const avoid = Array.isArray(existingNames) ? existingNames.filter(Boolean).join(", ") : "";
  const phaseLinesArray = Array.isArray(phases) ? phases : [];
  const phaseCount = phaseLinesArray.length;
  const phaseStr = phaseLinesArray
    .map((p, i) => `${i + 1}. ${p.title || ""}: ${p.description || ""}`)
    .join("\n");
  const siblingBlock =
    Array.isArray(otherMembers) && otherMembers.length > 0
      ? otherMembers
          .map((o) => {
            const jt = typeof o?.jobTitle === "string" ? o.jobTitle.trim() : "";
            const nm = typeof o?.name === "string" ? o.name.trim() : "";
            const rawCf = typeof o?.coachingFocus === "string" ? o.coachingFocus.replace(/\s+/g, " ").trim() : "";
            const cf = rawCf.slice(0, 340);
            const head = jt || nm ? `- ${nm || "Member"} — ${jt || "Advisor"}` : null;
            if (!head) return null;
            return cf
              ? `${head}\n  Their coaching lens (paraphrase—do NOT copy phrasing): ${cf}${rawCf.length > 340 ? "…" : ""}`
              : head;
          })
          .filter(Boolean)
          .join("\n")
      : "";
  const coverageInstruction = siblingBlock
    ? `

These roles are ALREADY filled by OTHER council members (do not duplicate their core expertise, discipline, stakeholder angle, or **signature questioning habit**):
${siblingBlock}

Your NEW role must fill a clear **gap**: a different discipline, community voice, skill set, or function that is not already represented above (e.g. if STEM and writing exist, add ethics, indigenous knowledge, facilitation, arts, family engagement, logistics, etc.—whatever best fits the project and is still missing). The new systemInstruction must follow the same richness rules as bulk generation (background, two narrow specialties, blind spots, signature move, anti-pattern) and must read as clearly distinct from every sibling above.`
    : "";

  const prompt = `Create ONE new AI council member role for this PBL project. Use a different name than: ${avoid}.
${coverageInstruction}

Project: ${projectSummary}
Title: ${projectTitle}
Essential question (if any): ${essentialQuestion || "(not specified)"}
Objectives: ${Array.isArray(objectives) ? objectives.join("; ") : ""}
Phases: ${phaseStr}

Reply with ONLY valid JSON:
{"name":"string","jobTitle":"string","systemInstruction":"string","portraitGender":"female"|"male"|"neutral"${phaseCount > 0 ? `,"phasesEnabled":[${Array(phaseCount).fill("true").join(",")}]` : ""}}

systemInstruction must be 140–320 words and include: specific background; two narrow expertise phrases; blind spots students miss from this lens; one signature coaching habit; one explicit anti-pattern (what they refuse to do). No generic filler repeated from typical PBL templates.

Voice calibration for this project: ${regenTone}

Include "phasesEnabled" only when ${phaseCount} > 0: exactly ${phaseCount} booleans in phase order (true where this new role helps students in that phase, false where not needed). At least one true.

portraitGender must match how the given name is most often read (female / male / neutral for ambiguous cases).`;
  try {
    const text = await geminiGenerateText(ai, prompt);
    const parsed = parseJsonFromModelText(text);
    if (!parsed?.name || !parsed?.jobTitle) {
      return res.status(422).json({ error: "Could not parse member.", raw: text.slice(0, 500) });
    }
    const portraitOk = new Set(["female", "male", "neutral"]);
    const pg = String(parsed.portraitGender || "").trim().toLowerCase();
    res.json({
      name: parsed.name,
      jobTitle: parsed.jobTitle,
      systemInstruction: parsed.systemInstruction || "",
      portraitGender: portraitOk.has(pg) ? pg : null,
      phasesEnabled: normalizePhasesEnabledArray(parsed.phasesEnabled, phaseCount),
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post("/api/creator/align-member-phases", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "Server missing GEMINI_API_KEY." });
  }
  const {
    projectTitle = "",
    projectSummary = "",
    essentialQuestion = "",
    objectives = [],
    phases = [],
    members = [],
  } = req.body || {};
  const phaseLinesArray = Array.isArray(phases) ? phases : [];
  const phaseCount = phaseLinesArray.length;
  if (!phaseCount) {
    return res.status(400).json({ error: "At least one project phase is required." });
  }
  const mem = Array.isArray(members) ? members : [];
  if (!mem.length) {
    return res.status(400).json({ error: "At least one council member is required." });
  }
  const phaseStr = phaseLinesArray
    .map((p, i) => `${i + 1}. ${p.title || ""}: ${p.description || ""}`)
    .join("\n");
  const memberBlock = mem
    .map((m, i) => {
      const nm = typeof m?.name === "string" ? m.name.trim() : "";
      const jt = typeof m?.jobTitle === "string" ? m.jobTitle.trim() : "";
      const si = typeof m?.systemInstruction === "string" ? m.systemInstruction.trim() : "";
      return `${i + 1}. ${nm || "Member"} — ${jt || "Advisor"}\n   Coaching focus: ${si.slice(0, 380)}${si.length > 380 ? "…" : ""}`;
    })
    .join("\n\n");

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const prompt = `You align an existing PBL "AI council" with project phases. For each advisor, decide which phases they should be **actively available** for (checkboxes in the UI).

Project title: ${projectTitle}
Essential question: ${essentialQuestion || "(not specified)"}
Context: ${projectSummary}
Objectives: ${Array.isArray(objectives) ? objectives.join("; ") : ""}

Phases (in order, exactly ${phaseCount}):
${phaseStr}

Council members (same order as below; member 1 = first array, etc.):
${memberBlock}

Reply with ONLY valid JSON:
{"availability":[[${Array(phaseCount).fill("true").join(",")}], ...]}

"availability" MUST be an array of exactly ${mem.length} arrays. Each inner array MUST have exactly ${phaseCount} booleans: true = this advisor is likely needed during that phase; false = that phase is outside their usual lane (students may still enable them manually). **Each inner array must have at least one true.**`;

  try {
    const text = await geminiGenerateText(ai, prompt);
    const parsed = parseJsonFromModelText(text);
    if (!parsed?.availability || !Array.isArray(parsed.availability)) {
      return res.status(422).json({ error: "Could not parse availability.", raw: text.slice(0, 500) });
    }
    const availability = mem.map((_, i) => normalizePhasesEnabledArray(parsed.availability[i], phaseCount));
    res.json({ availability });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

/** First https URL in contact text (matches client-side split heuristics). */
function extractFirstHttpUrlFromContact(contact) {
  const s = String(contact || "");
  const m = s.match(/https?:\/\/[^\s\],)>'"<]+/i);
  if (!m) return "";
  return m[0].replace(/[.,;:)\]}>'"]+$/g, "");
}

function safeResolvePublicUrl(baseHref, href) {
  if (!href || typeof href !== "string") return null;
  let h = href.trim();
  if (h.startsWith("//")) h = "https:" + h;
  try {
    const u = new URL(h, baseHref);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

function scorePersonImageUrl(urlStr) {
  const u = String(urlStr || "").toLowerCase();
  let s = 0;
  if (
    /headshot|portrait|profile|\/people\/|\/person\/|\/staff\/|\/faculty\/|\/team\/|\/bio|\/directory\/|staff-photo|employee|\/profiles?\//.test(
      u
    )
  ) {
    s += 12;
  }
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(u)) s += 2;
  if (/\/uploads\/|\/media\/|wp-content\/uploads/i.test(u)) s += 1;
  if (/logo|favicon|icon-|sprite|banner-hero|og-default|wordmark|brand-mark/.test(u)) s -= 8;
  return s;
}

function scoreLogoImageUrl(urlStr) {
  const u = String(urlStr || "").toLowerCase();
  let s = 0;
  if (/logo|brand|wordmark|favicon|apple-touch|\/icon|icons\/|mask-icon|crest|seal/.test(u)) s += 10;
  if (/headshot|portrait|\/people\/|\/staff\/|\/faculty\/|\/team\/|directory/.test(u)) s -= 6;
  if (/\.svg(\?|$)/i.test(u)) s += 3;
  return s;
}

function normalizeLdImageValue(v) {
  if (v == null) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(normalizeLdImageValue);
  if (typeof v === "object" && v.url) return normalizeLdImageValue(v.url);
  return [];
}

function harvestJsonLdImages(node, acc) {
  if (node == null) return;
  if (Array.isArray(node)) {
    node.forEach((n) => harvestJsonLdImages(n, acc));
    return;
  }
  if (typeof node !== "object") return;

  const types = node["@type"];
  const tarr = Array.isArray(types) ? types : types ? [types] : [];
  const typeJoined = tarr.map((t) => String(t)).join(" ");

  const isPerson = /\bPerson\b/i.test(typeJoined);
  const isOrg =
    /\b(Organization|LocalBusiness|EducationalOrganization|CollegeOrUniversity|NGO|Museum|School|GovernmentOrganization|Corporation|Library|NewsMediaOrganization)\b/i.test(
      typeJoined
    );

  if (isPerson) {
    for (const u of normalizeLdImageValue(node.image)) {
      if (typeof u === "string" && u.trim()) acc.person.push(u.trim());
    }
  }
  if (isOrg && node.logo) {
    for (const u of normalizeLdImageValue(node.logo)) {
      if (typeof u === "string" && u.trim()) acc.logo.push(u.trim());
    }
  }

  for (const k of Object.keys(node)) {
    if (k === "@context") continue;
    harvestJsonLdImages(node[k], acc);
  }
}

function extractJsonLdImageLists(html) {
  const acc = { person: [], logo: [] };
  const re = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      harvestJsonLdImages(JSON.parse(raw), acc);
    } catch {
      /* ignore invalid JSON-LD */
    }
  }
  return acc;
}

const OG_TWITTER_IMAGE_KEYS = new Set([
  "og:image",
  "og:image:url",
  "og:image:secure_url",
  "twitter:image",
  "twitter:image:src",
]);

function extractOpenGraphAndTwitterImages(html) {
  const found = [];
  const re = /<meta\s+([^>]+)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const prop = attrs.match(/\bproperty=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const name = attrs.match(/\bname=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const key = prop || name || "";
    if (!OG_TWITTER_IMAGE_KEYS.has(key)) continue;
    const content = attrs.match(/\bcontent=["']([^"']+)["']/i)?.[1];
    if (!content) continue;
    let c = content.trim();
    if (c.startsWith("//")) c = "https:" + c;
    if (/^https?:\/\//i.test(c)) found.push(c);
  }
  return [...new Set(found)];
}

function extractLinkIconsForLogo(html) {
  const out = [];
  const re = /<link\s+([^>]+)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const rel = attrs.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase() || "";
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    if (/\b(?:apple-touch-icon|mask-icon|icon|shortcut\s+icon)\b/.test(rel)) {
      out.push({ href, rel });
    }
  }
  out.sort((a, b) => {
    const rank = (r) => (/apple-touch/.test(r) ? 3 : /mask-icon/.test(r) ? 2 : /shortcut/.test(r) ? 1 : 0);
    return rank(b.rel) - rank(a.rel);
  });
  return out;
}

function pickBestImageFromParsedPage(html, resolvedPageUrl) {
  const ld = extractJsonLdImageLists(html);
  const ogTw = extractOpenGraphAndTwitterImages(html);
  const icons = extractLinkIconsForLogo(html);

  const personRanked = [];
  const logoRanked = [];

  const pushPerson = (href, boost) => {
    const abs = safeResolvePublicUrl(resolvedPageUrl, href);
    if (!abs) return;
    personRanked.push({ url: abs, s: boost + scorePersonImageUrl(abs) });
  };
  const pushLogo = (href, boost) => {
    const abs = safeResolvePublicUrl(resolvedPageUrl, href);
    if (!abs) return;
    logoRanked.push({ url: abs, s: boost + scoreLogoImageUrl(abs) });
  };

  for (const u of ld.person) pushPerson(u, 95);
  for (const u of ld.logo) pushLogo(u, 95);

  for (const u of ogTw) {
    const abs = safeResolvePublicUrl(resolvedPageUrl, u);
    if (!abs) continue;
    const ps = 10 + scorePersonImageUrl(abs);
    const ls = 10 + scoreLogoImageUrl(abs);
    if (ps >= ls) personRanked.push({ url: abs, s: ps });
    else logoRanked.push({ url: abs, s: ls });
  }

  for (const { href } of icons) pushLogo(href, 32);

  personRanked.sort((a, b) => b.s - a.s);
  logoRanked.sort((a, b) => b.s - a.s);

  const bestP = personRanked[0];
  const bestL = logoRanked[0];
  if (bestP && (!bestL || bestP.s >= bestL.s)) return bestP.url;
  if (bestL) return bestL.url;
  return "";
}

const WEBSITE_IMAGE_FETCH_MS = 12000;
const MAX_HTML_FOR_IMAGES = 900_000;

async function pickImageFromContactWebsite(contact) {
  const pageUrl = extractFirstHttpUrlFromContact(contact);
  if (!pageUrl) return "";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBSITE_IMAGE_FETCH_MS);
  try {
    const res = await fetch(pageUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return "";
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!/html|text\/plain|xml/.test(ct) && ct !== "") {
      return "";
    }
    let html = await res.text();
    if (html.length > MAX_HTML_FOR_IMAGES) html = html.slice(0, MAX_HTML_FOR_IMAGES);
    const finalUrl = res.url || pageUrl;
    return pickBestImageFromParsedPage(html, finalUrl);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

app.post("/api/creator/local-expert", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "Server missing GEMINI_API_KEY." });
  }
  const { roleTitle = "", projectTitle = "", projectSummary = "", essentialQuestion = "", excludeExperts = [] } = req.body || {};
  const excludeList = Array.isArray(excludeExperts)
    ? excludeExperts
        .filter((e) => typeof e === "string" && e.trim())
        .map((e) => e.trim())
        .slice(0, 40)
    : [];
  const excludeBlock = excludeList.length
    ? `

CRITICAL — Do NOT suggest anyone or any organization listed below (already shown). Pick a clearly different person, program, or organization:

${excludeList.map((e) => `- ${e}`).join("\n")}`
    : "";
  const locationStr = await getLocationFromRequest(req);
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const prompt = `The educator's approximate location (from **IP-based geolocation** of their browser request—city/region/country when available) is: ${locationStr}.

Suggest ONE real-world contact for students that fits the **council role** and project below. Follow this priority:

1) **Geography first:** Prefer a specific person (name + title) or organization in **or near** that region—university, museum, tribal office, nonprofit, school district, or community program students could realistically reach out to.

2) **If a strong local match is unlikely** for this niche (e.g. rare specialty, no relevant org in the area): choose someone who **best matches the council role and project** even if they are farther away (another state/country). In that case, still give real contact pathways; you may briefly note the distance if helpful.

If you cannot name a verified individual, name the organization and a relevant department or program, and describe how to reach them.
${excludeBlock}

Project: ${projectTitle}
Essential question (if any): ${essentialQuestion || "(not specified)"}
Council role: ${roleTitle}
Context: ${projectSummary}

Reply with ONLY valid JSON (no markdown):
{"name":"string — full name or best available label","organization":"string — school, nonprofit, tribal office, museum, etc.","title":"string — role or program","contact":"string — phone, email, and/or website; say verify online if unsure","imageUrl":""}

For imageUrl: use an empty string unless you are confident in a direct https URL to an official photo or logo image from that organization; do not invent URLs. (The server may still derive an image from the website URL in contact when imageUrl is empty.)`;
  try {
    const text = await geminiGenerateText(ai, prompt);
    const parsed = parseJsonFromModelText(text);
    const name = parsed?.name || parsed?.displayName;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(422).json({ error: "Could not parse expert.", raw: text.slice(0, 500) });
    }
    let imageUrl = typeof parsed.imageUrl === "string" ? parsed.imageUrl.trim() : "";
    if (!/^https?:\/\//i.test(imageUrl)) {
      try {
        const fromSite = await pickImageFromContactWebsite(
          typeof parsed.contact === "string" ? parsed.contact.trim() : ""
        );
        if (fromSite) imageUrl = fromSite;
      } catch {
        /* keep empty / model value */
      }
    }
    res.json({
      name: name.trim(),
      organization: typeof parsed.organization === "string" ? parsed.organization.trim() : "",
      title: typeof parsed.title === "string" ? parsed.title.trim() : typeof parsed.subtitle === "string" ? parsed.subtitle.trim() : "",
      contact: typeof parsed.contact === "string" ? parsed.contact.trim() : "",
      imageUrl,
      regionHint: locationStr,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

function normalizeBriefMimeType(fileName, mimeType) {
  const m = (mimeType || "").toLowerCase();
  if (m && m !== "application/octet-stream") return mimeType;
  const n = (fileName || "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".doc")) return "application/msword";
  if (n.endsWith(".md")) return "text/markdown";
  if (n.endsWith(".txt")) return "text/plain";
  if (n.endsWith(".html") || n.endsWith(".htm")) return "text/html";
  if (n.endsWith(".csv")) return "text/csv";
  return mimeType || "application/pdf";
}

const MAX_BRIEF_EXTRACTED_TEXT_CHARS = 120_000;

/** @param {Buffer} buffer */
async function extractWordBriefPlainText(buffer) {
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);
  const body = doc.getBody();
  return String(body || "").trim();
}

app.post("/api/creator/analyze-brief", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "Server missing GEMINI_API_KEY." });
  }
  const { brief } = req.body || {};
  const data = brief?.data;
  if (!data || typeof data !== "string") {
    return res.status(400).json({ error: "Brief file data (base64) required." });
  }

  const name = brief?.name || "brief";
  const mimeType = normalizeBriefMimeType(name, brief?.mimeType);
  const lowerName = (name || "").toLowerCase();
  const mimeLower = mimeType.toLowerCase();
  const looksDocx =
    lowerName.endsWith(".docx") ||
    mimeLower.includes("wordprocessingml") ||
    mimeLower.includes("vnd.openxmlformats-officedocument.wordprocessingml");
  const looksDoc = (lowerName.endsWith(".doc") || mimeLower.includes("msword")) && !looksDocx;

  let payloadData = data;
  let payloadMime = mimeType;

  if (looksDocx || looksDoc) {
    try {
      const buf = Buffer.from(data, "base64");
      const plain = await extractWordBriefPlainText(buf);
      if (!plain) {
        return res.status(422).json({
          error:
            "Could not extract readable text from the Word document. Try exporting as PDF or paste a summary below.",
        });
      }
      const clipped = plain.length > MAX_BRIEF_EXTRACTED_TEXT_CHARS ? plain.slice(0, MAX_BRIEF_EXTRACTED_TEXT_CHARS) : plain;
      payloadData = Buffer.from(clipped, "utf8").toString("base64");
      payloadMime = "text/plain";
    } catch (e) {
      return res.status(400).json({ error: e?.message || "Could not read Word document." });
    }
  }

  const lowerMime = payloadMime.toLowerCase();
  const ok =
    lowerMime.includes("pdf") ||
    lowerMime.includes("text") ||
    lowerMime.includes("markdown") ||
    lowerMime.includes("html") ||
    lowerMime.includes("csv");
  if (!ok) {
    return res.status(400).json({ error: "Unsupported brief type. Use PDF, Word (.doc / .docx), TXT, MD, or HTML." });
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const systemInstruction =
    "You analyze PBL and project-brief documents for teachers. Reply with only valid JSON, no markdown fences.";

  const userPrompt = `Read the attached project brief file (${name}).

Extract:

1) **title**: The clearest project title—unit title, driving question as a short headline, or project name. Use JSON null only if nothing usable appears.

2) **essentialQuestion**: The unit’s essential question or driving question that frames student work—the “big” question students keep returning to. In **PBL Works**–style briefs, this is often the question under **Project Launch** (sometimes near **Entry Event** or **Challenging Problem**). Copy it verbatim when possible; otherwise summarize in one sentence. Use JSON null only if no such question appears (do not invent one).

3) **objectives**: An array of 2–6 learning objectives as clear, student-facing sentences. Use this priority:
   - **Section headings:** First use bullets or numbered items under headings such as **Learning Objectives**, **Learning Goals**, **Goal(s)**, **Learning Outcomes**, **Outcome(s)**, **Student Learning Outcomes**, **SLOs**, **Competencies**, **Standards addressed**, or clearly equivalent wording—even when there is no heading that literally says “Learning Objectives.”
   - Then other explicit learning objectives, outcomes, or standards bullets elsewhere in the document
   - For PBL Works–style or similar briefs: treat questions, prompts, or bullets under sections such as **Build Knowledge**, **Develop & Critique**, **Need to Know**, **Sustained Inquiry**, or **Challenging Problem** as source material—rewrite each into one concise objective
   - Otherwise infer objectives from stated outcomes elsewhere in the document

4) **gradeLevel**: If the brief clearly states **student grade band / level / audience**, return exactly one of: **"3-5"** (elementary primary/intermediate, ~grades 3–5), **"6-8"** (middle grades), **"HS"** (high school), **"Uni+"** (college/university/adult/professional learners). Map synonyms (e.g. "middle school"→"6-8", "freshmen"/"9th"→"HS", "undergraduate"→"Uni+"). Use JSON **null** if unclear or not stated.

Strings must not contain raw newlines; use spaces. Escape double quotes inside strings.

Reply with ONLY valid JSON:
{"title":"string or null","essentialQuestion":"string or null","objectives":["..."],"gradeLevel":"3-5"|"6-8"|"HS"|"Uni+"|null}`;

  try {
    const filePart = createPartFromBase64(payloadData, payloadMime);
    const contents = createUserContent([filePart, userPrompt]);
    const models = chatModelCandidates("gemini-2.5-flash");
    const response = await geminiGenerateContentWithModelFallback(ai, models, {
      contents,
      config: { systemInstruction },
    });
    const text = response?.text ?? "";
    const parsed = parseJsonFromModelText(text);
    if (!parsed || typeof parsed !== "object") {
      return res.status(422).json({ error: "Could not parse brief analysis.", raw: text.slice(0, 800) });
    }
    let title =
      parsed.title === null || parsed.title === undefined
        ? null
        : String(parsed.title).replace(/\s+/g, " ").trim() || null;
    if (title && title.length > 200) title = title.slice(0, 197) + "…";

    let objectives = Array.isArray(parsed.objectives)
      ? parsed.objectives
          .map((o) => String(o || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
      : [];
    if (objectives.length > 8) objectives = objectives.slice(0, 8);

    let essentialQuestion =
      parsed.essentialQuestion === null || parsed.essentialQuestion === undefined
        ? null
        : String(parsed.essentialQuestion).replace(/\s+/g, " ").trim() || null;
    if (essentialQuestion && essentialQuestion.length > 500) {
      essentialQuestion = essentialQuestion.slice(0, 497) + "…";
    }

    const allowedGrade = new Set(["3-5", "6-8", "HS", "Uni+"]);
    let gradeLevel = null;
    const glRaw = parsed.gradeLevel;
    if (glRaw != null && glRaw !== "") {
      const gs = String(glRaw).trim();
      if (allowedGrade.has(gs)) gradeLevel = gs;
    }

    res.json({ title, essentialQuestion, objectives, gradeLevel });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post("/api/creator/rubric-specs", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "Server missing GEMINI_API_KEY." });
  }
  const {
    projectTitle = "",
    projectSummary = "",
    essentialQuestion = "",
    objectives = [],
    learningObjectives = [],
    phases = [],
    gradeLevel: rubricGradeRaw = "",
  } = req.body || {};
  const rubricGrade = normalizeCouncilGradeLevel(rubricGradeRaw);
  const rubricAudience = rubricAudienceDescriptorForGrade(rubricGrade);

  const obj = [...(Array.isArray(learningObjectives) ? learningObjectives : []), ...(Array.isArray(objectives) ? objectives : [])]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const phaseList = Array.isArray(phases)
    ? phases.map((p, i) => ({ title: String(p?.title || "").trim(), description: String(p?.description || "").trim(), index: i }))
    : [];
  const usable = phaseList.filter((p) => p.title || p.description);
  if (!usable.length) {
    return res.status(400).json({ error: "At least one project phase with a title or description is required." });
  }

  const anchors = listPblRubricAnchorFamilies();
  const n = usable.length;
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const phaseLines = usable.map((p) => `Phase ${p.index + 1} — ${p.title || "(untitled)"}: ${p.description || "(no description)"}`).join("\n");

  const systemInstruction =
    `You write assessment rubrics for ${rubricAudience} project-based learning. Reply with only valid JSON, no markdown fences.`;

  const prompt = `You are building milestone rubrics for a PBL unit. The school uses PBLworks-style performance columns (four levels) aligned with these rubric **families** (reference their spirit; do not claim to quote copyrighted text): ${anchors.join(", ")}.

Project title: ${projectTitle}
Essential question: ${essentialQuestion || "(not specified)"}
Context / summary: ${projectSummary || "(not specified)"}
Learning objectives (weave their language into product-focused criteria): ${obj.join(" | ") || "(none listed)"}

Phases (in order):
${phaseLines}

Rules:
- For each phase **except the last**, produce exactly **4** criteria. Each rubric is **product / phase deliverable** focused (what students make or do in that phase). Spread criteria across different knowledge types, skills, and **Bloom's taxonomy levels** (name the level in each criterion title or parenthetical when helpful).
- For the **last** phase only, the rubric assesses the **final public product / culminating work** and must include **6** criteria. At least two criteria should explicitly reflect **collaboration** and **communication** (presenting, explaining, audience, feedback) in the sense of PBLworks **Collaboration** and **Complex Communication** rubrics; the other four should still tie to objectives and the product.
- Every rubric uses these **four** performance columns only: **Beginning**, **Emerging**, **Developing**, **Demonstrating** (in that order). Each cell is one short student-friendly sentence (max ~220 characters).
- Also include "studentTextFile": a plain-text version of that phase rubric suitable to save as a .txt handout: title line, blank line, then for each criterion a block: CRITERION NAME, then rows Beginning/Emerging/Developing/Demonstrating with indented lines.

Return JSON shape:
{"rubrics":[{"phaseIndex":number,"isFinal":boolean,"phaseTitle":"string","criteria":[{"name":"string","beginning":"string","emerging":"string","developing":"string","demonstrating":"string"}],"studentTextFile":"string"}]}

You MUST return exactly ${usable.length} objects in "rubrics", one per phase above, in order from earliest to last phase.
phaseIndex MUST be the 0-based index shown before each phase (use these exact values: ${usable.map((u) => u.index).join(", ")}).
The rubric for the **highest** phaseIndex (${usable[usable.length - 1].index}) is the final product rubric: isFinal true, exactly 6 criteria. Every other rubric: isFinal false, exactly 4 criteria.`;

  try {
    const text = await geminiGenerateText(ai, prompt, systemInstruction);
    const parsed = parseJsonFromModelText(text);
    if (!parsed?.rubrics || !Array.isArray(parsed.rubrics)) {
      return res.status(422).json({ error: "Could not parse rubrics JSON.", raw: text.slice(0, 600) });
    }
    const byIndex = new Map();
    for (const row of parsed.rubrics) {
      const phaseIndex = Number(row.phaseIndex);
      if (!Number.isFinite(phaseIndex) || phaseIndex < 0) continue;
      const criteria = Array.isArray(row.criteria) ? row.criteria : [];
      const isFinal = !!row.isFinal;
      const expected = isFinal ? 6 : 4;
      const trimmed = criteria.slice(0, expected).map((c) => ({
        name: String(c?.name || "").trim(),
        beginning: String(c?.beginning || "").trim(),
        emerging: String(c?.emerging || "").trim(),
        developing: String(c?.developing || "").trim(),
        demonstrating: String(c?.demonstrating || "").trim(),
      }));
      while (trimmed.length < expected) {
        trimmed.push({ name: "", beginning: "", emerging: "", developing: "", demonstrating: "" });
      }
      byIndex.set(phaseIndex, {
        phaseIndex,
        isFinal,
        phaseTitle: String(row.phaseTitle || usable.find((u) => u.index === phaseIndex)?.title || `Phase ${phaseIndex + 1}`).trim(),
        criteria: trimmed,
        studentTextFile: String(row.studentTextFile || "").trim(),
      });
    }
    const rubrics = [];
    for (const u of usable) {
      const row = byIndex.get(u.index);
      if (!row) {
        return res.status(422).json({
          error: `Model did not return a rubric for phaseIndex ${u.index}.`,
          raw: text.slice(0, 600),
        });
      }
      const lastIdx = usable[usable.length - 1].index;
      const expectFinal = u.index === lastIdx;
      const expected = expectFinal ? 6 : 4;
      if (row.criteria.length !== expected) {
        return res.status(422).json({ error: `Wrong criterion count for phase ${u.index}.`, raw: text.slice(0, 600) });
      }
      const bad = row.criteria.some((c) => !c.name || !c.beginning || !c.emerging || !c.developing || !c.demonstrating);
      if (bad) {
        return res.status(422).json({ error: "Rubric criteria must all have non-empty names and four level descriptions.", raw: text.slice(0, 600) });
      }
      rubrics.push({
        ...row,
        isFinal: expectFinal,
        phaseTitle: row.phaseTitle || u.title || `Phase ${u.index + 1}`,
      });
    }
    res.json({ rubrics });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post("/api/creator/rubric-chart", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: "Server missing GEMINI_API_KEY." });
  }
  const { studentTextFile = "", projectTitle = "", phaseTitle = "", isFinal = false } = req.body || {};
  const text = String(studentTextFile || "").trim();
  if (!text || text.length < 40) {
    return res.status(400).json({ error: "studentTextFile (rubric text) is required." });
  }
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const safeText = text.length > 12000 ? text.slice(0, 11900) + "\n…(truncated)" : text;
  const imagePrompt = `Create a single-page, student-friendly printable rubric **infographic** (landscape proportions, high legibility).

Design:
- Big header: ${projectTitle || "Project"} — ${phaseTitle || "Milestone rubric"}${isFinal ? " (Final product)" : ""}.
- Main content: a clear table. Columns: **Criteria** | **Beginning** | **Emerging** | **Developing** | **Demonstrating**.
- Use short phrases from the source text below; you may tighten wording slightly for fit but keep meaning.
- Large readable sans-serif type, plenty of padding, subtle grid lines, teal/navy/green accents suitable for middle school.
- No tiny text; everything must stay readable when printed on one letter-sized page.

Source rubric (authoritative wording to follow):
---
${safeText}
---`;

  try {
    const img = await geminiGenerateRubricChartImage(ai, imagePrompt);
    res.json({ mimeType: img.mimeType, imageBase64: img.data });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// In-memory store for saved chats (use a DB in production)
const savedChats = [];
let chatIdCounter = 1;

app.post("/api/chats", (req, res) => {
  const { prompt, selectedGems, results, title } = req.body;
  if (!prompt || !Array.isArray(results)) {
    return res.status(400).json({ error: "prompt and results required." });
  }
  const firstResult = results[0];
  const firstJobTitle = firstResult && (firstResult.jobTitle || JOB_TITLES[firstResult?.name]);
  const now = new Date();
  const titleStr =
    typeof title === "string" && title.trim()
      ? title.trim()
      : firstJobTitle
        ? `${firstJobTitle} • ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : `Saved response • ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const chat = {
    id: String(chatIdCounter++),
    createdAt: now.toISOString(),
    title: titleStr,
    prompt,
    selectedGems: Array.isArray(selectedGems) ? selectedGems : [],
    results: results.map((r) => ({
      gemId: r.gemId,
      name: r.name,
      jobTitle: r.jobTitle || JOB_TITLES[r.name] || r.name,
      response: r.response,
      error: r.error,
    })),
  };
  savedChats.unshift(chat);
  const maxChats = 100;
  if (savedChats.length > maxChats) savedChats.length = maxChats;
  res.json({ id: chat.id, createdAt: chat.createdAt, title: chat.title });
});

app.get("/api/chats", (req, res) => {
  res.json({
    chats: savedChats.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      title: c.title || c.prompt,
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

function buildCustomCouncilContext(councilProject) {
  const cp = councilProject && typeof councilProject === "object" ? councilProject : {};
  const title = cp.projectTitle || "Project";
  const eq =
    typeof cp.essentialQuestion === "string" && cp.essentialQuestion.trim()
      ? cp.essentialQuestion.trim()
      : "";
  const objectives = Array.isArray(cp.learningObjectives)
    ? cp.learningObjectives.filter(Boolean).join("; ")
    : "";
  const phases = Array.isArray(cp.phases)
    ? cp.phases
        .map((p, i) => `Phase ${i + 1}: ${(p && p.title) || ""} — ${(p && p.description) || ""}`)
        .join("\n")
    : "";
  const eqLine = eq ? `Essential question: ${eq}\n` : "";
  return `[Project context]\nTitle: ${title}\n${eqLine}Learning objectives: ${objectives}\nPhases:\n${phases}\n`;
}

app.post("/api/chat/custom", async (req, res) => {
  const openai = getOpenAIClient();
  if (!openai) {
    return res.status(503).json({ error: "Server missing OPENAI_API_KEY. Add it to .env and restart." });
  }

  const {
    councilProject,
    selectedGems = [],
    prompt,
    attachments: rawAttachments,
    followUpPreviousResponse,
    opinionOnResponse,
  } = req.body || {};

  const members = Array.isArray(councilProject?.members) ? councilProject.members : [];
  if (!members.length) {
    return res.status(400).json({ error: "Invalid council project." });
  }
  const gradeLevelNorm = normalizeCouncilGradeLevel(councilProject?.gradeLevel);
  if (!Array.isArray(selectedGems) || selectedGems.length === 0) {
    return res.status(400).json({ error: "Select at least one council member." });
  }

  const promptText = typeof prompt === "string" ? prompt.trim() : "";
  const hasAttachments = Array.isArray(rawAttachments) && rawAttachments.length > 0;
  if (!promptText && !hasAttachments) {
    return res.status(400).json({ error: "Prompt or at least one attachment is required." });
  }

  const isFollowUp = !!(followUpPreviousResponse && typeof followUpPreviousResponse === "string");
  const maxPromptChars = isFollowUp ? COUNCIL_FOLLOW_UP_PROMPT_MAX_CHARS : councilUserPromptCharLimit(gradeLevelNorm);
  if (!opinionOnResponse && promptText.length > maxPromptChars) {
    return res.status(400).json({
      error: `Your question must be ${maxPromptChars} characters or fewer${isFollowUp ? " for follow-up messages" : " at this grade level"} (currently ${promptText.length}).`,
    });
  }

  let coreUserPrompt = promptText || "(The user sent the following files with no additional text.)";
  let wordLimit = 260;
  if (isFollowUp) {
    coreUserPrompt = `You previously said:\n\n${followUpPreviousResponse}\n\nUser's follow-up question: ${coreUserPrompt}`;
    wordLimit = 150;
  } else if (opinionOnResponse) {
    coreUserPrompt = `Another council member wrote the following. Give your opinion from your own perspective. Include: (1) one thing you agree with, and (2) one critique, point of disagreement, or something you want to inquire further about. Keep your response to 200 words maximum.\n\n---\n\n${coreUserPrompt}`;
    wordLimit = 200;
  }

  const locationStr = await getLocationFromRequest(req);

  const projectContext = buildCustomCouncilContext(councilProject);

  const attachmentContentParts = [];
  if (hasAttachments) {
    for (const a of rawAttachments) {
      const p = openAiBrowserAttachmentToContentPart(a);
      if (p) attachmentContentParts.push(p);
    }
  }

  const selectedSet = new Set(selectedGems.map((id) => Number(id)));
  const toRun = members.filter((m) => m && selectedSet.has(Number(m.id)) && !m.isHuman);
  const humanSelected = members.filter((m) => m && selectedSet.has(Number(m.id)) && m.isHuman);

  const results = [];

  const orderedAiPeers = orderCouncilPeersForLanes(toRun);

  for (const hm of humanSelected) {
    const hc = hm.humanContact || {};
    const lines = [
      "This slot is reserved for a human advisor or community expert (not an AI).",
      hc.name || hm.name ? `Suggested contact: ${hc.name || hm.name}` : "",
      hc.organization ? `Organization: ${hc.organization}` : "",
      hc.title || hm.title ? `Title: ${hc.title || hm.title}` : "",
      hc.phone ? `Phone: ${hc.phone}` : "",
      hc.email ? `Email: ${hc.email}` : "",
      hc.website ? `Website: ${hc.website}` : "",
      hm.localExpert && hm.localExpert.contact ? `Notes: ${hm.localExpert.contact}` : "",
    ].filter(Boolean);
    results.push({
      gemId: hm.id,
      name: hm.name || "Human advisor",
      jobTitle: hm.jobTitle || "",
      response: lines.join("\n"),
      error: null,
      isHuman: true,
    });
  }

  await Promise.all(
    toRun.map(async (gem) => {
      try {
        const followInstr = buildFollowUpCommunityInstruction(locationStr, orderedAiPeers, gem);
        const userContentParts = [
          ...attachmentContentParts,
          { type: "input_text", text: projectContext + "\n" + coreUserPrompt + followInstr },
        ];
        const peerBlock = buildOpenAiPeerDifferentiationBlock(
          toRun,
          gem.id,
          (g) => (typeof g.jobTitle === "string" && g.jobTitle.trim() ? g.jobTitle.trim() : "Advisor"),
          gradeLevelNorm
        );
        const jt = typeof gem.jobTitle === "string" && gem.jobTitle.trim() ? gem.jobTitle.trim() : "Advisor";
        const lexTail = customCouncilLexileTailInstruction(gradeLevelNorm);
        const instructions =
          (gem.systemInstruction || "") +
          peerBlock +
          `\n\n${projectContext}\n\nExpertise focus: Let **${jt}** shape what you emphasize—methods, cautions, and examples that role would notice before generic study tips.\n\n${lexTail} Each response must not exceed ${wordLimit} words total (excluding the "Follow up in your community" section). When mentioning websites, always provide the full URL (https://...).`;
        const text = await openAiCompleteCouncilTurn(openai, { instructions, userContentParts, gradeLevel: gradeLevelNorm });
        results.push({
          gemId: gem.id,
          name: gem.name,
          jobTitle: gem.jobTitle || "",
          response: text,
          error: null,
          isHuman: false,
        });
      } catch (err) {
        results.push({
          gemId: gem.id,
          name: gem.name,
          jobTitle: gem.jobTitle || "",
          response: null,
          error: err?.message || String(err),
          isHuman: false,
        });
      }
    })
  );

  results.sort((a, b) => Number(a.gemId) - Number(b.gemId));
  res.json({ results });
});

app.post("/api/chat", async (req, res) => {
  const openai = getOpenAIClient();
  if (!openai) {
    return res.status(503).json({ error: "Server missing OPENAI_API_KEY. Add it to .env and restart." });
  }

  const { selectedGems = [], prompt, attachments: rawAttachments, followUpPreviousResponse, opinionOnResponse } = req.body;
  if (!Array.isArray(selectedGems) || selectedGems.length === 0) {
    return res.status(400).json({ error: "Select at least one Gem." });
  }
  const promptText = typeof prompt === "string" ? prompt.trim() : "";
  const hasAttachments = Array.isArray(rawAttachments) && rawAttachments.length > 0;
  if (!promptText && !hasAttachments) {
    return res.status(400).json({ error: "Prompt or at least one attachment is required." });
  }
  const isFollowUp = !!(followUpPreviousResponse && typeof followUpPreviousResponse === "string");
  if (!opinionOnResponse && isFollowUp && promptText.length > COUNCIL_FOLLOW_UP_PROMPT_MAX_CHARS) {
    return res.status(400).json({
      error: `Follow-up questions must be ${COUNCIL_FOLLOW_UP_PROMPT_MAX_CHARS} characters or fewer (currently ${promptText.length}).`,
    });
  }
  let coreUserPrompt = promptText || "(The user sent the following files with no additional text.)";
  let wordLimit = 260;
  if (isFollowUp) {
    coreUserPrompt = `You previously said:\n\n${followUpPreviousResponse}\n\nUser's follow-up question: ${coreUserPrompt}`;
    wordLimit = 150;
  } else if (opinionOnResponse) {
    coreUserPrompt = `Another council member wrote the following. Give your opinion from your own perspective. Include: (1) one thing you agree with, and (2) one critique, point of disagreement, or something you want to inquire further about. Keep your response to 200 words maximum.\n\n---\n\n${coreUserPrompt}`;
    wordLimit = 200;
  }

  const locationStr = await getLocationFromRequest(req);

  const results = [];
  const selectedSet = new Set((selectedGems || []).map((id) => Number(id)));
  const gemConfigs = GEMS.filter((g) => selectedSet.has(Number(g.id)));

  const allDocPaths = new Set(gemConfigs.flatMap((g) => (Array.isArray(g.documents) ? g.documents : [])));
  const uploadedDocIds = new Map();
  await Promise.all(
    [...allDocPaths].map(async (rel) => {
      try {
        const id = await openAiEnsureDocFileId(openai, rel);
        if (id) uploadedDocIds.set(rel, id);
      } catch (e) {
        console.warn(`OpenAI file upload skipped: ${rel}`, e.message);
      }
    })
  );

  const attachmentContentParts = [];
  if (hasAttachments) {
    for (const a of rawAttachments) {
      const p = openAiBrowserAttachmentToContentPart(a);
      if (p) attachmentContentParts.push(p);
    }
  }

  const orderedAiPeers = orderCouncilPeersForLanes(gemConfigs);

  await Promise.all(
    gemConfigs.map(async (gem) => {
      try {
        const followInstr = buildFollowUpCommunityInstruction(locationStr, orderedAiPeers, gem);
        const userContentParts = [];
        const docPaths = Array.isArray(gem.documents) ? gem.documents : [];
        for (const rel of docPaths) {
          const fid = uploadedDocIds.get(rel);
          if (fid) userContentParts.push({ type: "input_file", file_id: fid });
        }
        for (const p of attachmentContentParts) userContentParts.push(p);
        userContentParts.push({ type: "input_text", text: coreUserPrompt + followInstr });

        const peerBlock = buildOpenAiPeerDifferentiationBlock(gemConfigs, gem.id, (g) => JOB_TITLES[g.name] || g.name, "6-8");
        const jt = JOB_TITLES[gem.name] || gem.name;
        const lexTail = customCouncilLexileTailInstruction("6-8");
        const instructions =
          (gem.systemInstruction || "") +
          peerBlock +
          `\n\nExpertise focus: Let **${jt}** shape what you emphasize—methods, cautions, and examples that role would notice before generic study tips.\n\n${lexTail} Each response must not exceed ${wordLimit} words total (excluding the "Follow up in your community" section). Do not include parenthetical references to the Assessment criteria (e.g. Collaboration, Technical Design, Research, Argumentation) in your response. When mentioning websites, always provide the full URL (https://...) so they can be hyperlinked.`;

        const text = await openAiCompleteCouncilTurn(openai, { instructions, userContentParts, gradeLevel: "6-8" });
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
    if (!GEMINI_API_KEY) console.warn("Warning: GEMINI_API_KEY not set. Creator flows need GEMINI_API_KEY.");
    if (!OPENAI_API_KEY || !String(OPENAI_API_KEY).trim())
      console.warn("Warning: OPENAI_API_KEY not set. Council chat needs OPENAI_API_KEY.");
  });
}

export default app;
