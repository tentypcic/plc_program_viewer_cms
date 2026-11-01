import { cp, mkdir } from "node:fs/promises";
for (const name of [
  "images",
  "pdf",
  "default.html",
  "projects.json",
  "404.html",
])
  await cp(name, "dist/" + name, { recursive: true });
await mkdir("dist/src", { recursive: true });
await cp("src/favicon.png", "dist/src/favicon.png");

