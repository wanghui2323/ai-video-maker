import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {access, cp, mkdtemp, readFile, readdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = path.join(root, 'make-ai-video');
const example = path.join(skill, 'assets', 'example-package');
const validator = path.join(skill, 'scripts', 'validate-package.mjs');
const doctor = path.join(skill, 'scripts', 'doctor.mjs');
const createPackage = path.join(skill, 'scripts', 'create-package.mjs');

const validate = (directory) => spawnSync(process.execPath, [validator, '--dir', directory], {
  cwd: root,
  encoding: 'utf8',
});

const cloneExample = async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'ai-video-maker-release-test-'));
  const target = path.join(temporaryRoot, 'package');
  await cp(example, target, {recursive: true});
  return target;
};

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

test('the public example validates but remains a local package', async () => {
  const result = validate(example);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /^valid/m);
  assert.match(result.stdout, /release=local_package/);
  const brief = await readJson(path.join(example, 'video-brief.json'));
  const plan = await readJson(path.join(example, 'video-content-plan.json'));
  assert.equal(brief.inputMode, 'idea');
  assert.equal(plan.selectedUnitId, 'two-clock-video-production');
  const state = await readJson(path.join(example, 'workflow-state.json'));
  assert.equal(state.stages.rendered, 'pending');
  assert.equal(state.stages.human_reviewed, 'pending');
  assert.equal(state.stages.approved, 'pending');
});

test('doctor reports the base planning and validation capability', () => {
  const result = spawnSync(process.execPath, [doctor, '--json'], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'ready');
  assert.equal(report.capabilities.contentPlanning, 'ready');
  assert.equal(report.capabilities.packageValidation, 'ready');
  assert.match(report.capabilities.deterministicRendering, /adapter/);
});

test('create-package makes a private brief-only package and refuses overwrite', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'ai-video-maker-create-'));
  const target = path.join(parent, 'first-video');
  const args = [createPackage, '--dir', target, '--input-mode', 'idea', '--summary', '解释一个产品判断', '--voice', 'cloned'];
  const result = spawnSync(process.execPath, args, {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const brief = await readJson(path.join(target, 'video-brief.json'));
  const state = await readJson(path.join(target, 'workflow-state.json'));
  assert.equal(brief.inputMode, 'idea');
  assert.equal(brief.input.rightsState, 'unconfirmed');
  assert.equal(state.stages.brief_ready, 'pending');
  assert.equal(state.dependencies.voiceProfile.status, 'pending');
  assert.match(await readFile(path.join(target, '.gitignore'), 'utf8'), /private\//);

  const second = spawnSync(process.execPath, args, {cwd: root, encoding: 'utf8'});
  assert.notEqual(second.status, 0);
  assert.match(`${second.stdout}\n${second.stderr}`, /不会覆盖/);
});

test('estimated captions cannot pass the formal timing gate', async () => {
  const target = await cloneExample();
  const stateFile = path.join(target, 'workflow-state.json');
  const state = await readJson(stateFile);
  state.stages.timing_ready = 'passed';
  await writeJson(stateFile, state);
  const result = validate(target);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /estimated captions/);
});

test('cloned voice cannot point to a public artifact directory', async () => {
  const target = await cloneExample();
  const unitFile = path.join(target, 'video-unit.json');
  const unit = await readJson(unitFile);
  unit.audio = {
    mode: 'cloned', timingSource: 'estimated', authorized: true, localOnly: true,
    remoteUploadAuthorized: false, consentPath: 'assets/public/consent.json',
    profilePath: 'assets/public/profile.json', runPath: 'assets/public/run.json',
    selectedAsset: 'assets/public/take.wav', selectedAssetSha256: '0'.repeat(64),
  };
  await writeJson(unitFile, unit);
  const result = validate(target);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /must stay in a private path/);
});

test('the public voice starter is disabled', async () => {
  const consent = await readJson(path.join(skill, 'assets', 'voice-clone-starter', 'voice-consent.json'));
  assert.equal(consent.authorized, false);
  assert.equal(consent.remoteUploadAuthorized, false);
});

test('the repository includes a non-overwriting installer', async () => {
  await access(path.join(root, 'install.sh'));
  const installer = await readFile(path.join(root, 'install.sh'), 'utf8');
  assert.match(installer, /target_dir/);
  assert.match(installer, /already|已存在/);
  assert.equal(installer.includes('rm -rf'), false);
  assert.equal(installer.includes('curl |'), false);
});

test('the installer supports one-command user installation across five agents', async () => {
  const temporaryHome = await mkdtemp(path.join(tmpdir(), 'ai-video-maker-install-home-'));
  const result = spawnSync('sh', [path.join(root, 'install.sh')], {
    cwd: root,
    env: {...process.env, HOME: temporaryHome},
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const expected = [
    '.agents/skills/make-ai-video/SKILL.md',
    '.claude/skills/make-ai-video/SKILL.md',
    '.cursor/skills/make-ai-video/SKILL.md',
    '.config/opencode/skills/make-ai-video/SKILL.md',
    '.codeium/windsurf/skills/make-ai-video/SKILL.md',
  ];
  for (const relative of expected) await access(path.join(temporaryHome, relative));

  const second = spawnSync('sh', [path.join(root, 'install.sh')], {
    cwd: root,
    env: {...process.env, HOME: temporaryHome},
    encoding: 'utf8',
  });
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.match(second.stdout, /不会覆盖/);
});

test('the installer supports shared project installation including TRAE', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'ai-video-maker-install-project-'));
  const result = spawnSync('sh', [path.join(root, 'install.sh'), '--target', 'all', '--scope', 'project', '--project-dir', project], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  await access(path.join(project, '.agents', 'skills', 'make-ai-video', 'SKILL.md'));
  await access(path.join(project, '.claude', 'skills', 'make-ai-video', 'SKILL.md'));
});

const walk = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else if (entry.isFile()) files.push(file);
  }
  return files;
};

test('the release contains no bundled voice/model files or known private paths', async () => {
  const files = await walk(root);
  const forbiddenExtensions = new Set(['.wav', '.mp3', '.m4a', '.flac', '.aac', '.ogg', '.safetensors', '.ckpt', '.onnx']);
  assert.deepEqual(files.filter((file) => forbiddenExtensions.has(path.extname(file).toLowerCase())), []);

  const forbiddenText = [
    ['/', 'Users', '/'].join(''),
    ['hui', '-', 'bplus'].join(''),
    ['reference', '-', 'user', '-', 'clean', '.', 'wav'].join(''),
  ];
  for (const file of files.filter((item) => !['.png'].includes(path.extname(item).toLowerCase()))) {
    const content = await readFile(file, 'utf8');
    for (const token of forbiddenText) assert.equal(content.includes(token), false, `${file} contains a private token`);
  }
});

test('the complete public-account article is not bundled in the GitHub release', async () => {
  const files = await walk(root);
  const relativePaths = files.map((file) => path.relative(root, file).split(path.sep).join('/'));
  assert.equal(relativePaths.includes('docs/文章转视频应该做成Skill还是Workflow.md'), false);
  assert.equal(relativePaths.includes('docs/source-ledger-skill-workflow.md'), false);
  assert.equal(relativePaths.includes('docs/不用视频生成模型-我怎样搭起自己的数字人视频系统.md'), false);
  assert.equal(relativePaths.includes('docs/source-ledger-personal-digital-human.md'), false);

  const readme = await readFile(path.join(root, 'README.md'), 'utf8');
  assert.equal(readme.includes('架构文章与状态'), false);
  assert.equal(readme.includes('docs/文章转视频应该做成Skill还是Workflow.md'), false);
  assert.equal(readme.includes('docs/不用视频生成模型-我怎样搭起自己的数字人视频系统.md'), false);
});

test('README distinguishes built-in workflow capabilities from the rendering adapter boundary', async () => {
  const readme = await readFile(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /当前版本已经内置/);
  assert.match(readme, /当前版本尚未内置/);
  assert.match(readme, /通用成片渲染器/);
  assert.match(readme, /四次确认/);
});

test('release manifest hashes match every declared file', async () => {
  const manifest = await readJson(path.join(root, 'release-manifest.json'));
  assert.equal(manifest.artifactState, 'local-open-source-candidate');
  const declared = manifest.files.map((item) => item.path).sort();
  const actual = (await walk(root))
    .map((file) => path.relative(root, file).split(path.sep).join('/'))
    .filter((file) => !file.startsWith('.git/') && file !== 'release-manifest.json' && file !== '.DS_Store')
    .sort();
  assert.deepEqual(declared, actual);
  for (const item of manifest.files) {
    const data = await readFile(path.join(root, item.path));
    assert.equal(createHash('sha256').update(data).digest('hex'), item.sha256, item.path);
  }
});
