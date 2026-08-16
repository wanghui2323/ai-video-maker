#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_DIR="$SCRIPT_DIR/make-ai-video"
CODEX_ROOT=${CODEX_HOME:-"$HOME/.codex"}
SKILLS_DIR="$CODEX_ROOT/skills"
TARGET_DIR="$SKILLS_DIR/make-ai-video"

if [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
  echo "安装失败：仓库中缺少 make-ai-video/SKILL.md" >&2
  exit 1
fi

if [ -e "$TARGET_DIR" ]; then
  echo "安装停止：$TARGET_DIR 已存在。" >&2
  echo "请先备份或移走旧版本，再重新运行 ./install.sh。" >&2
  exit 2
fi

mkdir -p "$SKILLS_DIR"
cp -R "$SOURCE_DIR" "$TARGET_DIR"

echo "安装完成：$TARGET_DIR"
echo "请重新启动或刷新 Codex，然后用自然语言开始制作视频。"
