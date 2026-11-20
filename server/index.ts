import path from "path";
import { fileURLToPath } from "url";
import { createApp } from "./app.js";
import { startNewsletterSchedule } from "./lib/newsletterDigest.js";

// Verzeichnis des Entry-Points. import.meta.url bleibt hier, damit gebündelt
// (dist/index.js) und ungebündelt (server/index.ts) dieselbe Basis wie zuvor
// herauskommt — statische Dateien und Ebook-Kandidaten hängen daran.
const serverDir = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const { server } = createApp(serverDir);
  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    startNewsletterSchedule();
  });
}

startServer().catch(console.error);
