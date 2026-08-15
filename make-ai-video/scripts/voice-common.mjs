import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

export const parseArgs = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) options[key] = true;
    else {
      options[key] = next;
      index += 1;
    }
  }
  return options;
};

export const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

export const writeJson = async (file, value, {overwrite = true} = {}) => {
  if (!overwrite && existsSync(file)) throw new Error(`refusing to overwrite existing file: ${file}`);
  await mkdir(path.dirname(file), {recursive: true});
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

export const sha256 = async (file) => {
  const hash = createHash('sha256');
  hash.update(await readFile(file));
  return hash.digest('hex');
};

export const stableSeed = (profileVersion, scriptHash, chapterId, take) => {
  const digest = createHash('sha256')
    .update(`${profileVersion}\0${scriptHash}\0${chapterId}\0${take}`)
    .digest();
  return 1_000_000_000 + (digest.readUInt32BE(0) % 1_000_000_000);
};

export const resolveInside = (root, value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a relative path`);
  if (path.isAbsolute(value)) throw new Error(`${label} must be relative to the package root`);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, value);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} escapes the package root`);
  }
  return resolved;
};

export const relativePath = (root, file) => path.relative(path.resolve(root), path.resolve(file));

export const assertPrivatePath = (value, label) => {
  const segments = String(value).split(/[\\/]+/).map((item) => item.toLowerCase());
  if (!segments.includes('private')) {
    throw new Error(`${label} must be stored under the package private directory`);
  }
  if (segments.some((item) => ['public', 'assets', 'static', 'dist', 'build'].includes(item))) {
    throw new Error(`${label} must stay outside public, assets, static, dist, and build directories`);
  }
};

export const inspectWavHeader = async (file) => {
  const buffer = await readFile(file);
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`reference audio is not a RIFF/WAVE file: ${file}`);
  }
  return {
    format: 'wav',
    bytes: buffer.length,
    channels: buffer.readUInt16LE(22),
    sampleRateHz: buffer.readUInt32LE(24),
    bitsPerSample: buffer.readUInt16LE(34),
  };
};

export const validateConsent = async (root, consentPath) => {
  const absolute = resolveInside(root, consentPath, 'consent path');
  const consent = await readJson(absolute);
  const ownerType = consent.voiceOwner?.type;
  if (!['self', 'authorized-speaker'].includes(ownerType)) {
    throw new Error('voiceOwner.type must be self or authorized-speaker');
  }
  if (consent.authorized !== true || !consent.authorizedAt) {
    throw new Error('voice consent requires authorized=true and authorizedAt');
  }
  if (consent.localOnly !== true || consent.remoteUploadAuthorized !== false) {
    throw new Error('open-source voice cloning defaults to localOnly=true and remoteUploadAuthorized=false');
  }
  if (!Array.isArray(consent.purposes) || !consent.purposes.includes('local-video-narration')) {
    throw new Error('voice consent purposes must include local-video-narration');
  }
  assertPrivatePath(consentPath, 'consent path');
  const evidencePath = resolveInside(root, consent.evidencePath, 'consent evidence path');
  assertPrivatePath(consent.evidencePath, 'consent evidence path');
  if (!existsSync(evidencePath)) throw new Error(`consent evidence does not exist: ${consent.evidencePath}`);
  return {
    value: consent,
    path: consentPath,
    sha256: await sha256(absolute),
    evidencePath: consent.evidencePath,
    evidenceSha256: await sha256(evidencePath),
  };
};

export const validateProvider = async (root, providerPath) => {
  const absolute = resolveInside(root, providerPath, 'provider path');
  const provider = await readJson(absolute);
  if (provider.confirmed !== true) throw new Error('voice provider must be explicitly confirmed');
  if (provider.kind !== 'qwen3-tts-mlx') throw new Error(`unsupported local provider: ${provider.kind}`);
  if (provider.localOnly !== true || provider.allowNetwork !== false || provider.remoteUploadAuthorized !== false) {
    throw new Error('provider must be local-only, offline, and not authorized for remote upload');
  }
  if (!provider.modelId || !provider.modelLicense || !provider.modelSource) {
    throw new Error('provider must record modelId, modelLicense, and modelSource');
  }
  for (const field of ['python', 'mlxAudio', 'mlxWhisper', 'numpy']) {
    if (typeof provider.runtime?.[field] !== 'string' || !provider.runtime[field]) {
      throw new Error(`provider.runtime.${field} must lock a version`);
    }
  }
  const modelPath = resolveInside(root, provider.modelPath, 'provider modelPath');
  if (!existsSync(modelPath)) throw new Error(`local model does not exist: ${provider.modelPath}`);
  const fingerprints = [];
  if (!Array.isArray(provider.fingerprintFiles) || provider.fingerprintFiles.length === 0) {
    throw new Error('provider.fingerprintFiles must not be empty');
  }
  for (const item of provider.fingerprintFiles) {
    const file = resolveInside(modelPath, item, 'provider fingerprint file');
    if (!existsSync(file)) throw new Error(`model fingerprint file does not exist: ${path.join(provider.modelPath, item)}`);
    fingerprints.push({path: path.posix.join(provider.modelPath, item), sha256: await sha256(file)});
  }
  const takeCount = provider.generation?.takeCount;
  if (!Number.isInteger(takeCount) || takeCount < 2 || takeCount > 5) {
    throw new Error('provider.generation.takeCount must be an integer from 2 to 5');
  }
  const qaPolicy = provider.qaPolicy || {};
  if (!qaPolicy.asrModelId || !qaPolicy.asrModelLicense || !qaPolicy.asrModelSource) {
    throw new Error('provider.qaPolicy must record asrModelId, asrModelLicense, and asrModelSource');
  }
  const asrModelPath = resolveInside(root, qaPolicy.asrModelPath, 'ASR model path');
  if (!existsSync(asrModelPath)) throw new Error(`local ASR model does not exist: ${qaPolicy.asrModelPath}`);
  if (!Array.isArray(qaPolicy.asrFingerprintFiles) || qaPolicy.asrFingerprintFiles.length === 0) {
    throw new Error('provider.qaPolicy.asrFingerprintFiles must not be empty');
  }
  const asrFingerprints = [];
  for (const item of qaPolicy.asrFingerprintFiles) {
    const file = resolveInside(asrModelPath, item, 'ASR fingerprint file');
    if (!existsSync(file)) throw new Error(`ASR fingerprint file does not exist: ${path.join(qaPolicy.asrModelPath, item)}`);
    asrFingerprints.push({path: path.posix.join(qaPolicy.asrModelPath, item), sha256: await sha256(file)});
  }
  return {
    value: provider,
    path: providerPath,
    sha256: await sha256(absolute),
    fingerprints,
    asrFingerprints,
  };
};

export const verifyHash = async (root, spec, label) => {
  const file = resolveInside(root, spec?.path, `${label} path`);
  if (!existsSync(file)) throw new Error(`${label} does not exist: ${spec?.path}`);
  const actual = await sha256(file);
  if (actual !== spec.sha256) throw new Error(`${label} hash drifted`);
  return file;
};
