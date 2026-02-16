// Copy public/* to project root so Vercel serves index.html and assets at /
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");

if (!fs.existsSync(publicDir)) {
  console.warn("No public/ folder found");
  process.exit(0);
}

for (const name of fs.readdirSync(publicDir)) {
  const src = path.join(publicDir, name);
  const dest = path.join(root, name);
  if (fs.statSync(src).isDirectory()) {
    fs.cpSync(src, dest, { recursive: true });
  } else {
    fs.copyFileSync(src, dest);
  }
}
console.log("Copied public/* to root for Vercel static serving.");
