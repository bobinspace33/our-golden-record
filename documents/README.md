# Documents for your Gems

**Put your files here** so your Gems can use them when answering prompts.

## How it works

1. Place your files in this folder (or in subfolders, e.g. `documents/research/`, `documents/gem1/`).
2. In **`server.js`**, give each Gem a `documents` array with paths **relative to this folder**:

   ```js
   { id: 1, name: "Research Gem", model: "gemini-2.5-flash", systemInstruction: "...",
     documents: ["policy.pdf", "faq.txt"] },
   ```

3. When you send a prompt, the server uploads these files to the Gemini API and attaches them to that Gem’s request, so the model can read and use them.

## Supported file types

- **PDF** (`.pdf`)
- **Text** (`.txt`), **Markdown** (`.md`), **CSV** (`.csv`), **HTML** (`.html`)
- **Word** (`.docx`) — if supported by the API

Paths in `documents` are relative to this `documents/` folder. Examples:

- `"guide.pdf"` → `documents/guide.pdf`
- `"gem2/instructions.docx"` → `documents/gem2/instructions.docx`
