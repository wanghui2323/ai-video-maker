# AI 视频制作助手

> 不依赖视频生成模型，从你的内容、声音和视觉语言出发，搭建可控制的个人数字人视频生产线。

`ai-video-maker` 是一个中文开源 Skill + Workflow。输入一个想法、文章、提纲、已有口播、资料包或音频，它会协助完成内容决策、脚本、本人声音、程序化画面和人工审核。文章转视频只是输入路径之一。

**MIT 开源｜一条命令安装｜支持 Codex、Claude Code、Cursor、OpenCode、Windsurf，并可以项目级安装到 TRAE。**

```bash
./install.sh
```

安装后刷新或重启 Agent，直接用自然语言说“我有一个想法，按完整流程帮我做成视频”即可开始。Skill 会主动执行当前可安全完成的步骤，并持续推进到下一个需要本人确认的门禁，而不只是输出操作说明。

当前路线面向知识解释、机制演示、流程关系和课程视频：用本地声音克隆、真实字幕时序与确定性渲染建立个人表达系统。它不要求文生视频模型，也不声称已经包含真人脸或口型驱动。

Skill 负责识别输入、补全缺口、比较候选、决定时长与画幅；内置 Workflow 合同负责状态顺序、声音隐私、正式时序、产物和人工审核门禁。

启动后用户能感知到的节奏是：

```text
输入与设备检查 → 创建生产包 → 内容与口播确认
→ 本地模型/声音档案（按需）→ 三候选与本人选声
→ 正式字幕时序 → 画面预检与渲染 → 整片人工审核
```

Skill 会持续报告当前阶段、已生成文件和下一项人工决定。只有模型下载等系统权限、声音授权、口播确认、本人选声、整片审核和发布授权需要停下来；批准后从原阶段继续。

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

- `make-ai-video/SKILL.md`：中文 Agent 操作入口；
- `assets/example-package/`：以“一个想法”为入口的可运行示例；
- `scripts/validate-package.mjs`：零依赖生产合同校验器；
- 本地声音克隆 Provider、Profile/Run CLI、机器 QA 与禁用模板；
- 安全说明、失败路径测试和 MIT License。

仓库不包含声音样本、授权证明、生成音频、模型权重、平台凭据或任何人的已接受声音档案。
完整公众号文章独立维护，不随本仓库分发。

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

## 一键安装 Skill

克隆或下载仓库后，在仓库根目录运行：

```bash
./install.sh
```

默认会安装到 Codex、Claude Code、Cursor、OpenCode 和 Windsurf 的用户级 Skill 目录。如果只使用某一个 Agent：

```bash
./install.sh --target codex
./install.sh --target claude
./install.sh --target cursor
./install.sh --target opencode
./install.sh --target windsurf
```

TRAE 目前使用官方已公开的项目兼容目录；团队仓库也推荐用这种方式：

```bash
./install.sh --target all --scope project --project-dir /path/to/your-project
```

| 工具 | 用户级安装 | 项目级共享 |
| --- | --- | --- |
| Codex | `~/.agents/skills` | `.agents/skills` |
| Claude Code | `~/.claude/skills` | `.claude/skills` |
| Cursor | `~/.cursor/skills` | `.agents/skills` |
| OpenCode | `~/.config/opencode/skills` | `.agents/skills` |
| Windsurf | `~/.codeium/windsurf/skills` | `.agents/skills` |
| TRAE | 使用项目级路径 | `.agents/skills` |

安装脚本不会覆盖已有同名 Skill；已有目录会被安全跳过。这个 Skill 遵循通用 `SKILL.md` 结构，各 Agent 可以自动匹配任务，也可以显式调用。

重新启动或刷新 Agent 后，可以直接说：

- “我有一个关于 AI 产品评审的想法，帮我做成视频。”
- “把这篇文章拆成一条 75 秒视频。”
- “继续使用我已经确认的本地声音做这条口播。”
- “我已有口播，只帮我设计画面、字幕和审核门禁。”

## 在项目中使用

```bash
cp -R make-ai-video/assets/example-package my-video-package
node make-ai-video/scripts/validate-package.mjs --dir my-video-package
```

依次维护：`video-brief.json`、`content-decision.json`、`video-content-plan.json`、`video-unit.json` 和 `workflow-state.json`。

输入路由见 [`input-routing.md`](make-ai-video/references/input-routing.md)，对象合同见 [`content-contract.md`](make-ai-video/references/content-contract.md)，生产门禁见 [`production-gates.md`](make-ai-video/references/production-gates.md)。

## 可选：本地声音克隆

声音克隆默认关闭。只使用本人或另有书面授权的声音；默认本地和私有，未经另行授权不上传第三方。

```bash
python3 -m venv .venv-voice
source .venv-voice/bin/activate
pip install -r make-ai-video/requirements-voice-mlx.txt
```

完整流程见 [`voice-cloning.md`](make-ai-video/references/voice-cloning.md)。机器只能淘汰坏音频，不能代替声音所有者判断“像不像本人”“是否自然”，也不能批准公开发布。

## 不用视频生成模型，画面从哪里来

Skill 会先把已确认口播翻译成语义场景、字幕与时间轴，再交给确定性渲染器。你可以接入 Remotion、现有剪辑工程或自己的模板库。公开仓库提供生产合同和适配接口，不包含作者的私有品牌 Remotion 组件。

这种路线适合图表、流程、产品交互、机制解释和知识课程；如果需要写实人物表演、开放世界镜头或口型驱动，可以把相应模型作为可选场景 Provider 接入。

## 状态边界

测试通过只证明当前版本的本地合同、失败路径和隐私门禁成立，不等于已经发布到 npm 或任何内容平台，也不代表使用者生成的视频已经通过人工审核。声音与隐私问题请先读 [SECURITY.md](SECURITY.md)。

## 开源协议

本项目采用 [MIT License](LICENSE)。你可以使用、修改、分发和集成到自己的项目中，但需保留版权和许可声明。声音参考、模型权重和你自己接入的第三方素材，仍需分别遵守它们各自的授权与许可。
