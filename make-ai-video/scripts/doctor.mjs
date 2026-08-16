#!/usr/bin/env node

import {access} from 'node:fs/promises';
import {arch, platform} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, '..');

const runVersion = (command, args = ['--version']) => {
  const result = spawnSync(command, args, {encoding: 'utf8'});
  if (result.error || result.status !== 0) return {available: false, version: null};
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  return {available: true, version: output.split(/\r?\n/)[0] || 'available'};
};

const exists = async (relative) => {
  try {
    await access(path.join(skillDir, relative));
    return true;
  } catch {
    return false;
  }
};

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
const host = {platform: platform(), arch: arch()};
const commands = {
  node: {available: nodeMajor >= 20, version: process.version},
  git: runVersion('git'),
  python3: runVersion('python3'),
  python312: runVersion('python3.12'),
  ffmpeg: runVersion('ffmpeg'),
  ffprobe: runVersion('ffprobe'),
};
const files = {
  skill: await exists('SKILL.md'),
  examplePackage: await exists('assets/example-package/video-brief.json'),
  packageValidator: await exists('scripts/validate-package.mjs'),
  voiceProvider: await exists('scripts/providers/qwen3-tts-mlx.py'),
  voiceRequirements: await exists('requirements-voice-mlx.txt'),
};

const baseReady = commands.node.available && files.skill && files.examplePackage && files.packageValidator;
const appleSilicon = host.platform === 'darwin' && host.arch === 'arm64';
const voiceStatus = !appleSilicon
  ? 'provider-required'
  : commands.python312.available
    ? 'setup-required'
    : 'python-3.12-required';
const renderingStatus = commands.ffmpeg.available && commands.ffprobe.available
  ? 'adapter-required'
  : 'adapter-and-ffmpeg-required';

const report = {
  schemaVersion: 1,
  status: baseReady ? 'ready' : 'blocked',
  host,
  commands,
  files,
  capabilities: {
    contentPlanning: baseReady ? 'ready' : 'blocked',
    packageValidation: baseReady ? 'ready' : 'blocked',
    localVoiceCloning: voiceStatus,
    deterministicRendering: renderingStatus,
  },
  notes: [
    '内容规划与生产包校验只要求 Node.js 20+。',
    '参考声音 Provider 面向 Apple Silicon；模型与 Python 环境需要单独准备。',
    '公开仓库暂未内置通用成片渲染器；需要接入 Remotion、现有剪辑工程或自定义适配器。',
  ],
};

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  const mark = (ready) => ready ? '✓' : '○';
  console.log('AI Video Maker 环境检查');
  console.log(`${mark(commands.node.available)} Node.js ${commands.node.version}（要求 20+）`);
  console.log(`${mark(files.skill && files.packageValidator)} Skill 与生产包校验器`);
  console.log(`${mark(commands.python312.available)} Python 3.12（仅本地声音克隆需要）`);
  console.log(`${mark(commands.ffmpeg.available && commands.ffprobe.available)} FFmpeg / FFprobe（渲染适配器通常需要）`);
  console.log('');
  console.log(`内容规划：${report.capabilities.contentPlanning}`);
  console.log(`本地声音克隆：${report.capabilities.localVoiceCloning}`);
  console.log(`确定性成片渲染：${report.capabilities.deterministicRendering}`);
  console.log('');
  for (const note of report.notes) console.log(`- ${note}`);
}

process.exitCode = baseReady ? 0 : 1;
