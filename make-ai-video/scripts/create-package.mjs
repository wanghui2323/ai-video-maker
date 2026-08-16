#!/usr/bin/env node

import {access, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const options = {};
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];
  if (token === '--help' || token === '-h') options.help = true;
  else if (token.startsWith('--')) {
    const value = process.argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${token} 缺少参数`);
    options[token.slice(2)] = value;
    index += 1;
  } else {
    throw new Error(`未知参数：${token}`);
  }
}

const usage = `用法：
  node scripts/create-package.mjs --dir <目录> --input-mode <类型> --summary <内容摘要>

input-mode: idea | article | outline | script | source-pack | audio
可选参数：--voice none|human|synthetic|cloned`;

if (options.help) {
  console.log(usage);
  process.exit(0);
}

const target = options.dir ? path.resolve(options.dir) : null;
const inputMode = options['input-mode'];
const summary = options.summary?.trim();
const voiceMode = options.voice || 'none';
const inputModes = new Set(['idea', 'article', 'outline', 'script', 'source-pack', 'audio']);
const voiceModes = new Set(['none', 'human', 'synthetic', 'cloned']);

if (!target || !inputModes.has(inputMode) || !summary || !voiceModes.has(voiceMode)) {
  console.error(usage);
  process.exit(1);
}

try {
  await access(target);
  throw new Error(`目标目录已经存在，不会覆盖：${target}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const id = path.basename(target)
  .toLowerCase()
  .replace(/[^a-z0-9\u3400-\u9fff]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'ai-video-project';

await mkdir(path.join(target, 'private'), {recursive: true});
await writeFile(path.join(target, '.gitignore'), 'private/\nmodels/\n*.wav\n*.mp3\n*.m4a\n', 'utf8');
await writeFile(path.join(target, 'source-notes.md'), `# 用户输入\n\n${summary}\n`, 'utf8');

const brief = {
  schemaVersion: 1,
  id: `${id}-brief`,
  inputMode,
  input: {
    summary,
    sourceFiles: ['source-notes.md'],
    sourceState: 'user-provided',
    rightsState: 'unconfirmed',
    evidenceState: 'unverified',
  },
  audience: null,
  viewerChange: null,
  constraints: {
    targetPlatforms: [],
    durationPreference: null,
    formatPreference: null,
  },
  voiceIntent: {
    mode: voiceMode,
    localOnly: true,
    profileId: null,
  },
  verificationNeeds: ['确认来源、素材权利、目标受众与希望观众获得的变化'],
};

const state = {
  schemaVersion: 1,
  id,
  releaseState: 'local_package',
  dependencies: {
    voiceProfile: {
      mode: voiceMode,
      status: voiceMode === 'cloned' ? 'pending' : 'not_applicable',
      preflight: voiceMode === 'cloned' ? 'pending' : 'not_applicable',
      profilePath: null,
    },
  },
  stages: {
    brief_ready: 'pending',
    direction_selected: 'pending',
    content_plan_reviewed: 'pending',
    narration_reviewed: 'pending',
    voice_run_selected: voiceMode === 'none' ? 'not_applicable' : 'pending',
    timing_ready: 'pending',
    visual_previewed: 'pending',
    rendered: 'pending',
    human_reviewed: 'pending',
    approved: 'pending',
  },
  artifacts: {
    source: 'source-notes.md',
    brief: 'video-brief.json',
    contentDecision: null,
    contentPlan: null,
    narrationReview: null,
    videoUnit: null,
    captions: null,
    finalVideo: null,
  },
  review: {
    facts: 'pending', narration: 'pending', voice: voiceMode === 'none' ? 'not_applicable' : 'pending',
    visuals: 'pending', rights: 'pending', aiDisclosure: 'pending',
  },
  platforms: {},
};

await writeFile(path.join(target, 'video-brief.json'), `${JSON.stringify(brief, null, 2)}\n`, 'utf8');
await writeFile(path.join(target, 'workflow-state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  status: 'created',
  directory: target,
  inputMode,
  voiceMode,
  created: ['.gitignore', 'source-notes.md', 'video-brief.json', 'workflow-state.json', 'private/'],
  nextDecision: '确认素材权利、目标受众和这条视频只解决的一个问题',
}, null, 2));
