#!/bin/sh
# 빌드한 화면(dist)을 GitHub Pages(gh-pages 브랜치)에 올립니다.  사용: npm run deploy
set -e
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
NAME=$(git config user.name)
EMAIL=$(git config user.email)
npm run build
touch dist/.nojekyll
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$NAME" -c user.email="$EMAIL" commit -qm "배포 $(date '+%Y-%m-%d %H:%M')"
git -c credential.helper= -c credential.helper='!gh auth git-credential' push -qf "$REMOTE" gh-pages
rm -rf .git
echo "올렸습니다. 1~2분 뒤 사이트에 반영됩니다."
