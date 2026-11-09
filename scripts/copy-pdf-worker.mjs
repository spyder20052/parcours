// Copie le worker de pdf.js dans public/ : il est servi par l'application elle-même (CSP worker-src 'self').
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
