import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('public/', root);
const assets = ['index.html','assets/care.css','assets/care.js'];
await mkdir(new URL('assets/',output), { recursive:true });
for (const [folder, allowed] of [['',new Set(['assets','index.html'])],['assets/',new Set(['care.css','care.js'])]]) {
  for (const existing of await readdir(new URL(folder,output), {withFileTypes:true})) {
    if (!allowed.has(existing.name) || (existing.name==='assets' ? !existing.isDirectory() : !existing.isFile())) {
      throw Error('Unexpected item in public output: '+folder+existing.name);
    }
  }
}
for (const name of assets) await writeFile(new URL(name,output),await readFile(new URL(name,root)));
console.log('Static assets prepared. Server code, schema and tests are not in public output.');
