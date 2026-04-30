import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const outputDir = path.join(appRoot, ".e2e-web");
const port = Number(process.env.PLAYWRIGHT_WEB_PORT || 19006);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function runExport() {
  return new Promise((resolve, reject) => {
    const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(
      npxCommand,
      ["expo", "export", "--platform", "web", "--output-dir", ".e2e-web"],
      {
        cwd: appRoot,
        env: {
          ...process.env,
          CI: "1",
        },
        stdio: "inherit",
      },
    );

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Expo web export failed with exit code ${code}.`));
    });

    child.on("error", reject);
  });
}

function resolveFilePath(requestPath) {
  const normalizedPath = decodeURIComponent(requestPath.split("?")[0]);
  const trimmedPath = normalizedPath.replace(/^\/+/, "");
  const directFile = path.join(outputDir, trimmedPath);

  if (normalizedPath === "/" || trimmedPath === "") {
    return path.join(outputDir, "index.html");
  }

  if (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) {
    return directFile;
  }

  if (!path.extname(trimmedPath)) {
    const htmlFile = path.join(outputDir, `${trimmedPath}.html`);
    if (fs.existsSync(htmlFile)) {
      return htmlFile;
    }
  }

  return path.join(outputDir, "+not-found.html");
}

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const filePath = resolveFilePath(request.url || "/");

    fs.readFile(filePath, (error, buffer) => {
      if (error) {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Unable to load the E2E web bundle.");
        return;
      }

      const extname = path.extname(filePath);
      response.writeHead(200, {
        "Content-Type":
          mimeTypes[extname] || "application/octet-stream",
      });
      response.end(buffer);
    });
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`E2E web bundle available at http://127.0.0.1:${port}`);
  });
}

try {
  await runExport();
  startStaticServer();
} catch (error) {
  console.error(error);
  process.exit(1);
}
