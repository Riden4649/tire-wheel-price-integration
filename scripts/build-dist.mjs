import { cp, mkdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'app'), destination = path.join(root, 'dist');
await mkdir(destination, {recursive:true});
// Copy only the app's public surface, never private test fixtures or the repository.
for (const name of ['index.html','manifest.json','sw.js','css','js','data','icons','vendor','wheel_images','assets']) {
  await cp(path.join(source,name), path.join(destination,name), {recursive:true});
}
const worker = await readFile(path.join(destination,'sw.js'),'utf8');
for (const match of worker.matchAll(/"\.\/([^"?]*)"/g)) {
  if (match[1]) await access(path.join(destination,match[1]));
}
console.log('Static app built: dist/ (service-worker assets verified)');
