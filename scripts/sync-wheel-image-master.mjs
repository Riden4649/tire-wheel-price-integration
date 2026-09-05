import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "app/data/wheels/image_master.json");
const outputPath = path.join(root, "app/data/wheel_image_master.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));

const images = source.items.map(item => {
  const combinedName = [item.brand, item.model]
    .filter(Boolean)
    .filter((value, index, values) => index === 0 || value !== values[index - 1])
    .join(" ");
  const localPath = String(item.local_path || "").replace(/^app\//, "");
  const approved = item.collection_status === "approved" && item.image_status === "verified";
  return {
    patternName: item.model,
    brandName: item.brand,
    color: item.color_code || "",
    colorDescription: item.color_name || "",
    aliases: [...new Set([combinedName, item.image_key].filter(Boolean))],
    status: approved ? "registered" : "unresolved",
    imageFile: approved ? (localPath || item.image_url || "") : "",
    sourceUrl: item.product_url || item.image_url || "",
    sourceType: item.source_type || "official_manufacturer",
    updatedAt: source.updated_at || ""
  };
});

await writeFile(outputPath, `${JSON.stringify(images, null, 2)}\n`, "utf8");
console.log(`Synced ${images.length} wheel image variants to ${path.relative(root, outputPath)}`);
