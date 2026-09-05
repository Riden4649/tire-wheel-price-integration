import http from "node:http";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.resolve(process.env.APP_ROOT || path.join(projectRoot, "app"));
const host = process.env.APP_HOST || "127.0.0.1";
const port = Number(process.env.APP_PORT || process.argv[2] || 4184);
const maxBodyBytes = 12 * 1024 * 1024;
const mimeTypes = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".ico": "image/x-icon",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".xml": "application/xml; charset=utf-8"
};

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  response.end(body);
}

function normalized(value) {
  return String(value || "").normalize("NFKC").toUpperCase().replace(/[\s　_＿\-‐‑‒–—―ーｰ・･/／\\.,，。:：;；()（）[\]【】"'“”‘’]/g, "");
}

function safeBase(value) {
  const ascii = String(value || "wheel").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (ascii || "wheel").slice(0, 80);
}

async function atomicJson(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}

async function parseBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("画像が大きすぎます（上限12MB）。");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function saveWheelImage(payload) {
  const patternName = String(payload.patternName || "").trim();
  const brandName = String(payload.brandName || "").trim();
  const color = String(payload.color || "S").trim() || "S";
  const colorDescription = String(payload.colorDescription || "").trim();
  if (!patternName || patternName.length > 120 || brandName.length > 120 || color.length > 40) throw new Error("型式またはカラーが不正です。");
  if (payload.mimeType !== "image/webp" || typeof payload.dataBase64 !== "string") throw new Error("WebP画像が必要です。");
  const image = Buffer.from(payload.dataBase64, "base64");
  if (image.length < 20 || image.length > 8 * 1024 * 1024 || image.subarray(0, 4).toString() !== "RIFF" || image.subarray(8, 12).toString() !== "WEBP") throw new Error("画像データを確認できません。");

  const sha256 = createHash("sha256").update(image).digest("hex");
  const base = safeBase([brandName, patternName, color].filter(Boolean).join("_"));
  const fileName = `${base}_${sha256.slice(0, 10)}.webp`;
  const assetDir = path.join(appRoot, "assets/wheels");
  const assetPath = path.join(assetDir, fileName);
  await mkdir(assetDir, { recursive: true });
  await writeFile(assetPath, image, { flag: "wx" }).catch(async error => {
    if (error.code !== "EEXIST") throw error;
  });

  const appMasterPath = path.join(appRoot, "data/wheel_image_master.json");
  const appMaster = JSON.parse(await readFile(appMasterPath, "utf8"));
  const entry = appMaster.find(item => normalized(item.patternName) === normalized(patternName) && normalized(item.color) === normalized(color));
  if (!entry) throw new Error("画像DBに該当する型式・カラーがありません。先に価格表を読み込んでください。");
  const oldImageFile = entry.imageFile || "";
  Object.assign(entry, {
    imageFile: `assets/wheels/${fileName}`,
    status: "registered",
    sourceType: "user_uploaded_from_app",
    updatedAt: new Date().toISOString()
  });

  const researchPath = path.join(appRoot, "data/wheels/image_master.json");
  const research = JSON.parse(await readFile(researchPath, "utf8"));
  const researchEntry = research.items?.find(item => normalized(item.model) === normalized(patternName) && normalized(item.color_code) === normalized(color));
  if (researchEntry) {
    Object.assign(researchEntry, {
      image_status: "verified", active: true,
      notes: "Uploaded from the local image-management screen and assigned by model/color.",
      offline_cache_allowed: true,
      local_path: `app/assets/wheels/${fileName}`,
      local_format: "webp", local_bytes: image.length, local_sha256: sha256,
      source_type: "user_provided_official_asset", source_file: `app/assets/wheels/${fileName}`,
      collection_status: "approved", collection_stage: "U1"
    });
    if (Number.isFinite(Number(payload.width))) researchEntry.local_width = Number(payload.width);
    if (Number.isFinite(Number(payload.height))) researchEntry.local_height = Number(payload.height);
  }

  const historyDir = path.join(appRoot, "assets/wheels/.upload-backups");
  if (oldImageFile.startsWith("assets/wheels/") && !oldImageFile.includes("..")) {
    const oldPath = path.join(appRoot, oldImageFile);
    try {
      await stat(oldPath); await mkdir(historyDir, { recursive: true });
      await copyFile(oldPath, path.join(historyDir, `${Date.now()}-${path.basename(oldPath)}`));
    } catch {}
  }
  await atomicJson(appMasterPath, appMaster);
  if (researchEntry) await atomicJson(researchPath, research);
  return { ok: true, patternName, brandName, color, colorDescription, imageFile: entry.imageFile, sha256, bytes: image.length, entry };
}

async function serveStatic(request, response, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.resolve(appRoot, `.${pathname}`);
  if (file !== appRoot && !file.startsWith(`${appRoot}${path.sep}`)) return json(response, 403, { error: "Forbidden" });
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": body.length, "Cache-Control": pathname.startsWith("/assets/wheels/") ? "no-cache" : "no-store" });
    if (request.method === "HEAD") response.end(); else response.end(body);
  } catch { json(response, 404, { error: "Not found" }); }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/wheel-images/status") return json(response, 200, { enabled: true, storage: "local" });
    if (request.method === "POST" && url.pathname === "/api/wheel-images") return json(response, 201, await saveWheelImage(await parseBody(request)));
    if (!["GET", "HEAD"].includes(request.method || "")) return json(response, 405, { error: "Method not allowed" });
    await serveStatic(request, response, url);
  } catch (error) { json(response, 400, { error: error.message || "Upload failed" }); }
});

server.listen(port, host, () => console.log(`Wheel image upload server: http://${host}:${port}/`));
