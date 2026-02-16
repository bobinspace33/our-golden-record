# Gemini Gems Chat

Simple web app to select 1–5 Gemini “Gems” (custom-style assistants), send one prompt, and get separate responses from each selected Gem.

## What you need

- **Node.js** 18+
- A **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey)

## Setup

1. Clone or copy this project, then install dependencies:

   ```bash
   npm install
   ```

2. Copy the example env file and add your API key:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set:

   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

3. Start the server:

   ```bash
   npm start
   ```

4. Open **http://localhost:3000** in your browser.

## Deploy to Vercel

1. Push this project to GitHub (or connect another Git provider to Vercel).

2. In [Vercel](https://vercel.com), click **Add New** → **Project**, import the repo, and leave the default build settings (no custom build command).

3. In **Environment Variables**, add:
   - **Name:** `GEMINI_API_KEY`  
   - **Value:** your Gemini API key  
   (Optionally add `GOOGLE_API_KEY` if you use that name.)

4. Deploy. Vercel will serve the `public/` folder at the root and run the API from `api/index.js`. Your `documents/` folder is included in the deployment so the council can use the uploaded files.

**Note:** Recent Chats are stored in memory and will not persist across serverless invocations. For persistent saved chats you’d add a small database (e.g. Vercel KV). The free plan may limit function duration to 10 seconds; if requests time out with many documents, consider the Pro plan or reducing the number of documents per request.

## How to use

- **Select Gems:** Click 1–5 Gem cards to select which assistants should answer.
- **Prompt:** Type your question or instruction in the text area.
- **Send:** Click “Send to selected Gems” (or Ctrl/Cmd + Enter in the text area).
- **Responses:** Each selected Gem’s reply appears in its own card below.

## Linking your existing 5 Gems

You can wire the interface to Gems you’ve already created in two ways.

### Option A – Gems from the Gemini app (gemini.google)

Gems you create in the Gemini app don’t have an API ID. You link them by **copying each Gem’s instructions** into this app:

1. Go to [gemini.google.com](https://gemini.google.com) and open **your Gems** (or “Gemini Apps”).
2. Open a Gem → **Edit** → select and **copy the full “Instructions”** text.
3. In **`server.js`**, find the `GEMS` array and the slot (1–5) for that Gem.
4. Set **`name`** to match your Gem (e.g. `"My Research Gem"`).
5. Paste the instructions into **`systemInstruction`** for that entry. Keep **`model`** as e.g. `"gemini-2.5-flash"`.
6. Repeat for your other Gems.

The app will then call the same base model with each Gem’s instructions, so behavior matches what you see in the Gemini app.

### Option B – Tuned model IDs (AI Studio / API)

If your “Gems” are **tuned models** (e.g. from Google AI Studio or the tuning API) and you have a model ID:

1. In **`server.js`**, set **`model`** to `"tunedModels/YOUR_MODEL_ID"` for that Gem.
2. Set **`name`** to whatever you want in the UI.
3. You can leave **`systemInstruction`** empty if the tuned model already defines the behavior.

To find tuned model IDs: in [AI Studio](https://aistudio.google.com) check your tuned models, or use the API (e.g. list tuned models) and use the ID in the `tunedModels/...` format.

---

## Customizing the 5 Gems

The five Gems are defined in **`server.js`** in the `GEMS` array. Each entry has:

- **`id`** — 1–5 (used for selection).
- **`name`** — Label shown in the UI.
- **`model`** — Base model (e.g. `gemini-2.5-flash`) or tuned model (e.g. `tunedModels/your-gem-id`).
- **`systemInstruction`** — Optional. Use this to paste in instructions from a Gemini-app Gem, or leave empty when using a tuned model that already has the right behavior.

## Giving your Gems access to documents

If your Gems use PDFs, text files, or other documents (like in the Gemini app):

1. **Put the files in the `documents/` folder** in this project. You can use subfolders (e.g. `documents/research/`, `documents/gem1/`).
2. **In `server.js`**, add a `documents` array to each Gem that should see those files. Paths are relative to `documents/`:

   ```js
   { id: 1, name: "Research Gem", model: "gemini-2.5-flash", systemInstruction: "...",
     documents: ["policy.pdf", "faq.txt"] },
   ```

3. When you send a prompt, the server uploads those files to the Gemini API and attaches them to that Gem’s request, so the model can read and use them.

Supported types include PDF (`.pdf`), text (`.txt`), Markdown (`.md`), CSV (`.csv`), and HTML (`.html`). See `documents/README.md` for more detail.

## Project layout

- **`server.js`** — Express server; defines Gems, calls Gemini API, serves `public/`.
- **`documents/`** — Folder for Gem documents; reference paths in `GEMS[].documents`.
- **`public/index.html`** — Single-page UI.
- **`public/styles.css`** — Styles for the app.
- **`public/app.js`** — Gem selection, prompt submit, and results display.

## Security note

The API key is read from the server environment (e.g. `.env`). Do not put your API key in frontend code or commit `.env` to version control.
