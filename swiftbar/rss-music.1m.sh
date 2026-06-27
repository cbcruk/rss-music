#!/bin/bash
# <bitbar.title>rss-music</bitbar.title>
# <bitbar.version>1.0</bitbar.version>
# <bitbar.author>eunsoo</bitbar.author>
# <bitbar.desc>rss-music status + actions (launchd scrape / server)</bitbar.desc>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>

PROJECT="/Users/ieunsu/Documents/GitHub/rss-extensions"
DB="$PROJECT/data/cache.db"
SCRAPE_LOG="$HOME/Library/Logs/rss-music/scrape.log"
URL="http://localhost:3333"
UID_N="$(/usr/bin/id -u)"
SCRAPE_LABEL="gui/${UID_N}/com.eunsoo.rss-music.scrape"
SERVER_LABEL="gui/${UID_N}/com.eunsoo.rss-music.server"

# server status
if /usr/bin/curl -s -o /dev/null --max-time 2 "$URL/"; then
  SERVER="🟢 Server up"
else
  SERVER="🔴 Server down"
fi

# unread count
UNREAD="$(/usr/bin/sqlite3 "$DB" "SELECT COUNT(*) FROM articles WHERE read=0;" 2>/dev/null)"
[ -z "$UNREAD" ] && UNREAD="?"

# last scrape (parse human log line: "[ts] scrape: done in Xs — N new, ...")
LAST_LINE="$(/usr/bin/grep "scrape: done" "$SCRAPE_LOG" 2>/dev/null | /usr/bin/tail -1)"
if [ -n "$LAST_LINE" ]; then
  TS="$(echo "$LAST_LINE" | /usr/bin/sed -n 's/^\[\([^]]*\)\].*/\1/p' | /usr/bin/sed 's/\.[0-9]*Z$//; s/Z$//')"
  NEW="$(echo "$LAST_LINE" | /usr/bin/sed -n 's/.*— \([0-9][0-9]*\) new.*/\1/p')"
  EPOCH="$(/bin/date -j -u -f "%Y-%m-%dT%H:%M:%S" "$TS" +%s 2>/dev/null)"
  NOW="$(/bin/date -u +%s)"
  if [ -n "$EPOCH" ]; then
    MIN=$(( (NOW - EPOCH) / 60 ))
    if [ "$MIN" -lt 60 ]; then AGO="${MIN}m ago"; else AGO="$(( MIN / 60 ))h ago"; fi
  else
    AGO="$TS"
  fi
  LAST="Last scrape: ${AGO} (+${NEW:-0} new)"
else
  LAST="Last scrape: —"
fi

# menu bar title
echo "🗂️ ${UNREAD}"
echo "---"
echo "${SERVER} · localhost:3333 | href=${URL}"
echo "${LAST}"
echo "Unread: ${UNREAD}"
echo "---"
echo "열기 (localhost:3333) | href=${URL}"
echo "지금 스크랩 | bash=/bin/launchctl param1=kickstart param2=-k param3=${SCRAPE_LABEL} terminal=false refresh=true"
echo "서버 재시작 | bash=/bin/launchctl param1=kickstart param2=-k param3=${SERVER_LABEL} terminal=false refresh=true"
echo "로그 보기 | bash=/usr/bin/open param1=${SCRAPE_LOG} terminal=false"
echo "새로고침 | refresh=true"
