#!/bin/sh
# Builds the site's self-hosted fonts from the app's static cuts (apps/mobile/assets/fonts):
# woff2, Latin subset plus Latin Extended-A and Latin Extended Additional (IAST transliteration
# of Indian names and titles), with only the OpenType features the site uses.
# Needs fonttools with brotli: pip install fonttools brotli
# The output is committed, so this only needs to run when the source cuts change.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
src="$here/../mobile/assets/fonts"
out="$here/public/fonts"
mkdir -p "$out"

unicodes="U+0000-00FF,U+0100-017F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0304,U+0323,U+0331,U+1E00-1EFF,U+2000-206F,U+2074,U+20AC,U+20B9,U+2122,U+2190-2193,U+2197,U+2212,U+2215,U+FEFF,U+FFFD"
features="kern,liga,calt,ccmp,locl,mark,mkmk,lnum,onum,tnum,pnum,case"

for f in NewsreaderText-Regular NewsreaderText-Italic NewsreaderDisplay-Medium NewsreaderDisplay-Regular NewsreaderDisplay-Italic Schibsted-Regular Schibsted-Medium Schibsted-SemiBold; do
  pyftsubset "$src/$f.ttf" \
    --unicodes="$unicodes" \
    --layout-features="$features" \
    --flavor=woff2 \
    --no-hinting \
    --desubroutinize \
    --name-IDs='*' \
    --output-file="$out/$f.woff2"
done
cp "$src/OFL-Newsreader.txt" "$src/OFL-SchibstedGrotesk.txt" "$out/"
ls -l "$out"
