#!/bin/sh
# Builds the comps and screenshots them (light and dark, phone and desktop) into shots/.
set -e
cd "$(dirname "$0")/../../.."
OUT=$(mktemp -d)
node_modules/.bin/esbuild docs/design-comps/data-stories/build.ts --bundle --platform=node --format=esm --outfile=docs/design-comps/data-stories/.build.mjs --log-level=warning
node docs/design-comps/data-stories/.build.mjs; rm docs/design-comps/data-stories/.build.mjs
MAX_HEIGHT=20000 REDUCED_MOTION=1 CHROME=${CHROME:-/usr/bin/chromium} node docs/design-comps/_shared/shoot.mjs docs/design-comps/data-stories docs/design-comps/data-stories/shots ${1:-390,1440} ${2:-}
