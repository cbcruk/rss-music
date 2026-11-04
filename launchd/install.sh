#!/bin/bash
# launchd 에이전트(server/scrape)를 이 머신 환경에 맞게 렌더링해서 등록한다.
# 사용자명·프로젝트 위치·node 버전이 바뀌면 이 스크립트를 다시 실행하면 된다.
#
#   launchd/install.sh              # 설치(재설치)
#   launchd/install.sh --uninstall  # 제거
#   NODE=/path/to/node launchd/install.sh   # node 경로 직접 지정
set -euo pipefail

PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/rss-music"
DOMAIN="gui/$(id -u)"
LABELS=(com.eunsoo.rss-music.server com.eunsoo.rss-music.scrape)

if [ "${1:-}" = "--uninstall" ]; then
  for label in "${LABELS[@]}"; do
    launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
    rm -f "$AGENTS/$label.plist"
    echo "removed $label"
  done
  exit 0
fi

# 셸 래퍼(node_modules/.bin/*) 대신 node 바이너리를 직접 실행한다.
# launchd에서 /bin/sh는 ~/Documents 접근이 막히기(TCC) 때문.
NODE="${NODE:-$(command -v node || true)}"
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "error: node를 찾을 수 없습니다. NODE=/path/to/node 로 지정하세요." >&2
  exit 1
fi
NODE="$(cd "$(dirname "$NODE")" && pwd -P)/$(basename "$NODE")"
NODE_DIR="$(dirname "$NODE")"

for f in dist/scrape.mjs dist/server node_modules/vite-plus/bin/vp .env; do
  [ -e "$PROJECT/$f" ] || echo "warn: $f 가 없습니다 (빌드/설치 필요)" >&2
done

mkdir -p "$AGENTS" "$LOGS"
for label in "${LABELS[@]}"; do
  src="$PROJECT/launchd/$label.plist.in"
  dst="$AGENTS/$label.plist"
  sed -e "s|__NODE__|$NODE|g" \
      -e "s|__NODE_DIR__|$NODE_DIR|g" \
      -e "s|__PROJECT__|$PROJECT|g" \
      -e "s|__HOME__|$HOME|g" "$src" > "$dst"
  plutil -lint -s "$dst"
  launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$dst"
  echo "installed $label"
done

# SwiftBar 플러그인 폴더가 설정돼 있으면 플러그인을 심볼릭 링크로 연결한다.
PLUGIN_DIR="$(defaults read com.ameba.SwiftBar PluginDirectory 2>/dev/null || true)"
if [ -n "$PLUGIN_DIR" ] && [ -d "$PLUGIN_DIR" ] && [ "$PLUGIN_DIR" != "$PROJECT/swiftbar" ]; then
  ln -sfn "$PROJECT/swiftbar/rss-music.1m.sh" "$PLUGIN_DIR/rss-music.1m.sh"
  echo "linked SwiftBar plugin → $PLUGIN_DIR"
fi

echo
echo "project: $PROJECT"
echo "node:    $NODE"
