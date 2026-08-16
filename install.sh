#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_DIR="$SCRIPT_DIR/make-ai-video"
TARGET="all"
SCOPE="user"
PROJECT_DIR=""
INSTALLED=0
SKIPPED=0

usage() {
  cat <<'EOF'
用法：
  ./install.sh
  ./install.sh --target codex|claude|cursor|opencode|windsurf|trae|all
  ./install.sh --target all --scope project --project-dir /path/to/project

默认会安装到 Codex、Claude Code、Cursor、OpenCode 和 Windsurf 的用户级 Skill 目录。
TRAE 请使用 project scope，以官方支持的 .agents/skills 目录安装。
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      [ "$#" -ge 2 ] || { echo "安装失败：--target 缺少参数" >&2; exit 1; }
      TARGET="$2"
      shift 2
      ;;
    --scope)
      [ "$#" -ge 2 ] || { echo "安装失败：--scope 缺少参数" >&2; exit 1; }
      SCOPE="$2"
      shift 2
      ;;
    --project-dir)
      [ "$#" -ge 2 ] || { echo "安装失败：--project-dir 缺少参数" >&2; exit 1; }
      PROJECT_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "安装失败：未知参数 $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$TARGET" in
  codex|claude|cursor|opencode|windsurf|trae|all) ;;
  *) echo "安装失败：不支持的 target $TARGET" >&2; exit 1 ;;
esac

case "$SCOPE" in
  user|project) ;;
  *) echo "安装失败：不支持的 scope $SCOPE" >&2; exit 1 ;;
esac

if [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
  echo "安装失败：仓库中缺少 make-ai-video/SKILL.md" >&2
  exit 1
fi

install_to() {
  skills_root="$1"
  label="$2"
  target_dir="$skills_root/make-ai-video"
  if [ -e "$target_dir" ]; then
    echo "已跳过 ${label}：${target_dir} 已存在，不会覆盖。"
    SKIPPED=$((SKIPPED + 1))
    return
  fi
  mkdir -p "$skills_root"
  cp -R "$SOURCE_DIR" "$target_dir"
  echo "已安装 ${label}：${target_dir}"
  INSTALLED=$((INSTALLED + 1))
}

install_user_target() {
  case "$1" in
    codex) install_to "$HOME/.agents/skills" "Codex" ;;
    claude) install_to "$HOME/.claude/skills" "Claude Code" ;;
    cursor) install_to "$HOME/.cursor/skills" "Cursor" ;;
    opencode) install_to "$HOME/.config/opencode/skills" "OpenCode" ;;
    windsurf) install_to "$HOME/.codeium/windsurf/skills" "Windsurf" ;;
    trae)
      echo "安装失败：TRAE 的公开兼容路径是项目内 .agents/skills。" >&2
      echo "请改用：./install.sh --target trae --scope project --project-dir /path/to/project" >&2
      exit 1
      ;;
  esac
}

install_project_target() {
  project_root="$1"
  target_name="$2"
  case "$target_name" in
    claude) install_to "$project_root/.claude/skills" "Claude Code (project)" ;;
    codex|cursor|opencode|windsurf|trae)
      install_to "$project_root/.agents/skills" "Agent Skills shared project path"
      ;;
  esac
}

if [ "$SCOPE" = "user" ]; then
  if [ "$TARGET" = "all" ]; then
    for target_name in codex claude cursor opencode windsurf; do
      install_user_target "$target_name"
    done
  else
    install_user_target "$TARGET"
  fi
else
  [ -n "$PROJECT_DIR" ] || {
    echo "安装失败：project scope 必须提供 --project-dir" >&2
    exit 1
  }
  [ -d "$PROJECT_DIR" ] || {
    echo "安装失败：项目目录不存在：$PROJECT_DIR" >&2
    exit 1
  }
  if [ "$TARGET" = "all" ]; then
    install_to "$PROJECT_DIR/.agents/skills" "Codex / Cursor / OpenCode / Windsurf / TRAE (project)"
    install_to "$PROJECT_DIR/.claude/skills" "Claude Code (project)"
  else
    install_project_target "$PROJECT_DIR" "$TARGET"
  fi
fi

echo "安装结束：新增 $INSTALLED 个目录，跳过 $SKIPPED 个已有目录。"
echo "刷新或重启对应 Agent 后，直接说：“我有一个想法，帮我做成视频。”"
