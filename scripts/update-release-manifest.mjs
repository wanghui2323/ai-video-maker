#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignored = new Set(['.git', 'release-manifest.json', '.DS_Store']);

const walk = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
};

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const files = (await walk(root))
  .map((absolute) => ({
    path: path.relative(root, absolute).split(path.sep).join('/'),
    absolute,
  }))
  .sort((left, right) => left.path.localeCompare(right.path));

const manifest = {
  schemaVersion: 1,
  name: 'ai-video-maker',
  version: packageJson.version,
  artifactState: 'local-open-source-candidate',
  publicAssetsIncluded: false,
  files: await Promise.all(files.map(async (file) => ({
    path: file.path,
    sha256: createHash('sha256').update(await readFile(file.absolute)).digest('hex'),
  }))),
};

await writeFile(path.join(root, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({status: 'updated', version: manifest.version, fileCount: manifest.files.length}, null, 2));
