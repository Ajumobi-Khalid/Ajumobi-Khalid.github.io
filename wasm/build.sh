#!/bin/sh
# Builds wasm/chip8.c into assets/wasm/chip8.js (the WebAssembly is embedded, so it also works from disk).
# Needs the Emscripten SDK activated in this shell (emcc on the PATH).
# Run from anywhere: sh wasm/build.sh
set -e
cd "$(dirname "$0")"
mkdir -p ../assets/wasm
emcc chip8.c -std=c2x -Os -Wall -Wextra \
  -sSINGLE_FILE=1 \
  -sUSE_SDL=2 \
  -sMODULARIZE=1 -sEXPORT_NAME=createChip8 \
  -sENVIRONMENT=web \
  -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_FUNCTIONS=_main,_web_load,_web_key,_web_pause,_web_set_clock,_web_set_volume,_web_registers \
  -sEXPORTED_RUNTIME_METHODS=FS,ccall,HEAPU16 \
  -o ../assets/wasm/chip8.js
rm -f ../assets/wasm/chip8.wasm
ls -l ../assets/wasm
