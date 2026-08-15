# create-reviewable-ai-video

把一个想法、文章、提纲、已有口播、资料包或音频，整理成有来源、可审核、可恢复的 AI 视频生产包。文章转视频只是输入路径之一。

Skill 负责识别输入、补全缺口、比较候选、决定时长与画幅；内置 Workflow 合同负责状态顺序、声音隐私、正式时序、产物和人工审核门禁。

## 最重要的节奏：两条时钟

首次明确使用克隆声音且没有可用档案时，先建立声音能力：

```text
授权 → 参考录音/逐字稿 → 三个校准候选 → 机器 QA
→ 声音所有者选择 → production-pilot VoiceProfile
```

每条视频再执行自己的生产链：

```text
VideoBrief → ContentDecision → VideoContentPlan → 口播确认
→ 本次配音选择 → 正式时序 → 视觉预检 → 渲染 → 人工审核
```

因此，“先做声音”适用于首次建档；本次正式配音仍然必须等口播确认后生成。

## 支持的输入

- `idea`：从一个想法协助展开候选，并标记待核验事实；
- `article`：从完整文章中选择可独立成立的问题；
- `outline`：补全逻辑、证据和节奏；
- `script`：审核已有口播，不随意改写已确认表达；
- `source-pack`：从多份资料建立来源锚点；
- `audio`：先转写，再决定保留原话还是整理内容。

## 公开仓库包含什么

- `create-reviewable-ai-video/SKILL.md`：中文 Agent 操作入口；
- `assets/example-package/`：以“一个想法”为入口的可运行示例；
- `scripts/validate-package.mjs`：零依赖生产合同校验器；
- 本地声音克隆 Provider、Profile/Run CLI、机器 QA 与禁用模板；
- 架构文章、信息图、来源账本、安全说明和 MIT License。

仓库不包含声音样本、授权证明、生成音频、模型权重、平台凭据或任何人的已接受声音档案。

## 运行公开示例

要求 Node.js 20 或更高版本，不需要安装 npm 依赖：

```bash
npm test
npm run validate:example
```

预期结果包括：

```text
valid
input=idea candidates=2 selected=two-clock-video-production
durationMs=72000 release=local_package
```

`valid` 只表示对象合同、时间轴和状态顺序成立，不表示已经渲染或可以发布。

## 安装 Skill

```bash
mkdir -p ~/.codex/skills
cp -R create-reviewable-ai-video ~/.codex/skills/
```

重新启动或刷新 Agent 后，可以直接说：

- “我有一个关于 AI 产品评审的想法，帮我做成视频。”
- “把这篇文章拆成一条 75 秒视频。”
- “继续使用我已经确认的本地声音做这条口播。”
- “我已有口播，只帮我设计画面、字幕和审核门禁。”

## 在项目中使用

```bash
cp -R create-reviewable-ai-video/assets/example-package my-video-package
node create-reviewable-ai-video/scripts/validate-package.mjs --dir my-video-package
```

依次维护：`video-brief.json`、`content-decision.json`、`video-content-plan.json`、`video-unit.json` 和 `workflow-state.json`。

输入路由见 [`input-routing.md`](create-reviewable-ai-video/references/input-routing.md)，对象合同见 [`content-contract.md`](create-reviewable-ai-video/references/content-contract.md)，生产门禁见 [`production-gates.md`](create-reviewable-ai-video/references/production-gates.md)。

## 可选：本地声音克隆

声音克隆默认关闭。只使用本人或另有书面授权的声音；默认本地和私有，未经另行授权不上传第三方。

```bash
python3 -m venv .venv-voice
source .venv-voice/bin/activate
pip install -r create-reviewable-ai-video/requirements-voice-mlx.txt
```

完整流程见 [`voice-cloning.md`](create-reviewable-ai-video/references/voice-cloning.md)。机器只能淘汰坏音频，不能代替声音所有者判断“像不像本人”“是否自然”，也不能批准公开发布。

## 架构文章与状态

阅读[《做 AI 视频，别把文章当成唯一入口》](docs/文章转视频应该做成Skill还是Workflow.md)。来源与不作出的结论记录在[来源账本](docs/source-ledger-skill-workflow.md)。

当前目录是本地开源候选。测试通过不等于已经发布到 GitHub、npm 或任何内容平台。声音与隐私问题请先读 [SECURITY.md](SECURITY.md)。
