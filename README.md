# AI 视频制作助手

[![CI](https://github.com/wanghui2323/ai-video-maker/actions/workflows/ci.yml/badge.svg)](https://github.com/wanghui2323/ai-video-maker/actions/workflows/ci.yml)

> 不用视频生成模型，也不必先做一张会对口型的脸。从一个想法、一篇文章或一段口播开始，让 AI 协助完成内容、本人声音、字幕、可控画面和人工审核。

`ai-video-maker` 是一个中文开源 Skill。它把我们真实做视频时反复对齐的顺序、检查方法和隐私边界交给 AI 编程工具执行。

文章转视频只是其中一种入口。你也可以从想法、提纲、已有口播、资料包或音频开始。

**MIT 开源｜一条命令安装｜支持用户级与项目级 Skill 安装｜本人声音默认只在本地处理**

## 它解决什么问题

普通的“文章转视频”工具常把所有步骤压成一次生成：稿子变了，声音和画面一起重做；某一段不满意，也很难只改那一层。

这个项目把一条视频拆成可以检查和恢复的五层：

```text
内容 → 声音 → 字幕时间 → 画面 → 审核记录
```

- 声音不满意，只重新选择或生成声音；
- 画面不满意，只修改画面元素和出现时间；
- 已确认的口播、本人声音和审核记录可以继续复用；
- 本地生成、机器检查、本人审核和可以发布，始终是四个不同状态。

它更适合知识解释、产品演示、流程关系和课程视频，不适合需要大量真人表演或电影感镜头的内容。

## 两步开始

### 方式一：直接交给 AI 安装

把下面这句话发给 Codex、Claude Code、Cursor、OpenCode 或其他支持 Agent Skills 的 AI 编程工具：

> 请从 https://github.com/wanghui2323/ai-video-maker 安装 `make-ai-video` Skill，不要覆盖已有同名 Skill。安装后直接启动，先问我准备了什么素材、是否使用本人声音，然后主动推进到下一个需要我确认的步骤；每次告诉我完成了什么、文件在哪里。

### 方式二：在终端安装

```bash
git clone https://github.com/wanghui2323/ai-video-maker.git
cd ai-video-maker
./install.sh
```

刷新或重启 AI 编程工具后，直接说：

> 我有一个关于 AI 产品评审的想法，帮我做成一条视频。

Skill 会先检查环境、识别输入、创建生产包，并继续执行到下一个真正需要你决定的步骤，而不只是输出一份教程。

## 第一次制作，你只需要做四次确认

1. **提供素材**：一句想法、一篇文章、一份提纲、已有口播、资料包或音频都可以；
2. **确认口播**：确认这条视频讲什么、面向谁、预计多长；
3. **选择声音**：需要本人声音时，先完成授权和本地建档，再从三个完整版本中选择；
4. **审核成片**：先看关键画面，再看完整视频，最后决定是否发布。

环境检查、生产包建立、对象校验和状态记录由 Skill 执行。安装依赖、下载大模型、声音授权和发布等操作仍会在需要时向你确认。

## 当前版本能做到什么

### 当前版本已经内置

| 能力 | 当前状态 |
| --- | --- |
| 想法、文章、提纲、口播、资料包、音频六种入口 | 已内置输入路由与生产合同 |
| 选题、口播、时长和画幅判断 | 已内置 Skill 工作方法与人工确认门禁 |
| 新建生产包 | 已内置不覆盖原目录的创建脚本 |
| 环境检查 | 已内置 Node、Python、FFmpeg 与能力边界检查 |
| 本地声音克隆 | 已内置 Apple Silicon 上的 Qwen3-TTS / MLX 参考 Provider、声音档案、三候选、机器 QA 与本人选择 |
| 字幕与生产状态 | 已内置正式/估算时序区分和生产包校验器 |
| 画幅与视觉任务 | 已内置横屏知识版、竖屏人物版和语义分镜规则 |
| 隐私与人工审核 | 已内置私有目录、哈希锁定、失败恢复和发布状态边界 |

### 当前版本尚未内置

- **通用成片渲染器**：仓库可以生成画面任务、字幕和 `video-unit.json`，但仍需接入 Remotion、现有剪辑工程或你自己的模板；
- **真人脸与口型驱动**：个人数字人的重点目前是内容、本人声音、视觉语言和生产记录；
- **自动发布到内容平台**：Skill 会区分草稿、预览、定时和发布，不会替你自动批准整片；
- **模型权重与个人声音样本**：模型需要按需下载，声音、授权证明和克隆结果不会进入 GitHub。

因此，安装完成代表 AI 获得了正确的制作方法和本地执行工具；是否能直接生成 MP4，还取决于当前项目是否已经接入渲染器。Skill 会如实报告这个状态，不会把视觉计划说成已经生成成片。

## 启动后的完整节奏

```text
输入与环境检查 → 创建生产包 → 内容方向与口播确认
→ 首次声音建档（按需）→ 本次三个声音候选与本人选择
→ 正式字幕时间 → 画面预检 → 渲染 → 整片人工审核
```

声音分成两条节奏：

- **首次建档**：授权 → 参考录音和准确文字 → 三个校准候选 → 机器排错 → 本人选择 → 可复用声音档案；
- **每条视频**：口播确认 → 检查声音档案 → 生成本次三个完整版本 → 本人选择 → 字幕和画面。

先建立声音能力，不等于提前生成本次正式配音。本次配音必须等口播确认以后再做。

## 支持的输入

- `idea`：从一个想法展开候选，并标记待核验事实；
- `article`：从文章中选出可以独立讲清的问题，不等比例压缩全文；
- `outline`：补全逻辑、证据和节奏；
- `script`：审核已有口播，不随意改写已经确认的表达；
- `source-pack`：从多份资料建立来源锚点；
- `audio`：先转写，再决定保留原话、整理口播，还是只制作字幕和画面。

## 安装位置

默认命令会尝试安装到五个用户级目录：

```bash
./install.sh
```

也可以只安装一个：

```bash
./install.sh --target codex
./install.sh --target claude
./install.sh --target cursor
./install.sh --target opencode
./install.sh --target windsurf
```

团队项目或 TRAE 推荐使用项目级安装：

```bash
./install.sh --target all --scope project --project-dir /path/to/your-project
```

| 工具 | 用户级目录 | 项目级共享目录 |
| --- | --- | --- |
| Codex | `~/.agents/skills` | `.agents/skills` |
| Claude Code | `~/.claude/skills` | `.claude/skills` |
| Cursor | `~/.cursor/skills` | `.agents/skills` |
| OpenCode | `~/.config/opencode/skills` | `.agents/skills` |
| Windsurf | `~/.codeium/windsurf/skills` | `.agents/skills` |
| TRAE | 使用项目级目录 | `.agents/skills` |

安装脚本不会覆盖已有同名 Skill。目录复制测试已经覆盖上述路径；实际能否自动发现 Skill，还取决于你使用的产品版本是否支持 Agent Skills。OpenCode 的兼容目录可查看其[官方 Agent Skills 文档](https://opencode.ai/docs/skills)。

## 开发者检查

要求 Node.js 20 或更高版本，不需要安装 npm 依赖。

检查当前环境和真实能力边界：

```bash
npm run doctor
```

创建一个不会覆盖现有目录的新生产包：

```bash
npm run create:package -- \
  --dir ./my-first-video \
  --input-mode idea \
  --summary "解释一个 AI 产品判断" \
  --voice cloned
```

运行公开示例与回归测试：

```bash
npm run validate:example
npm test
```

`valid` 只表示对象合同、时间顺序和状态边界成立，不表示已经渲染或可以发布。

## 项目结构

```text
make-ai-video/
├── SKILL.md                       # Agent 操作入口
├── agents/openai.yaml             # Skill 的界面信息
├── references/                    # 输入、内容、声音、画面、渲染与门禁合同
├── assets/example-package/        # 可校验的完整对象示例
├── assets/voice-clone-starter/    # 默认禁用的声音建档模板
└── scripts/                       # 环境检查、生产包、声音和校验工具
```

## 可选：本地声音克隆

声音克隆默认关闭，只能用于本人或已经单独获得授权的声音。参考录音、逐字稿、候选、声音档案和模型都应放在本地私有目录。

参考实现面向 Apple Silicon，使用 Qwen3-TTS Base + MLX，并用 Whisper 做转写回检。机器只能排除漏句、重复、音量异常或破音，不能替声音所有者判断“像不像本人”“是否自然”。

完整模型准备、授权、三候选和本人选择流程见 [`voice-cloning.md`](make-ai-video/references/voice-cloning.md)。

## 开源与隐私

仓库包含 Skill、对象合同、环境与生产包工具、本地声音 Provider、机器 QA、示例和测试。

仓库不包含：

- 任何人的参考录音、逐字稿、授权证明和克隆音频；
- 已接受的声音档案、模型权重或缓存；
- 平台账号、API 密钥和发布凭据；
- 作者的私有品牌组件与完整公众号文章。

声音与隐私问题请先读 [SECURITY.md](SECURITY.md)。

## 开源协议

本项目采用 [MIT License](LICENSE)。你可以使用、修改、分发和集成代码，但需要保留版权与许可声明。声音、模型和第三方素材仍需分别遵守各自的授权与许可。

如果这个项目对你有帮助，欢迎点一个 Star；遇到不清楚的步骤，也欢迎提交 Issue。
