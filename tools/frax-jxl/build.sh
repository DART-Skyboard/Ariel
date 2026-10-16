#!/bin/sh
# Rebuilds templates/jxl/frax-jxl.{js,wasm} (libjxl → WebAssembly, single-threaded, SIMD128).
# Needs emsdk (https://github.com/emscripten-core/emsdk) activated and a libjxl checkout with submodules.
set -e
LIBJXL=${LIBJXL:-$HOME/libjxl}; OUT=$(cd "$(dirname "$0")/../../templates/jxl" && pwd); B=build-wasm
emcmake cmake -S "$LIBJXL" -B $B -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF -DBUILD_SHARED_LIBS=OFF -DJPEGXL_STATIC=ON \
  -DJPEGXL_ENABLE_TOOLS=OFF -DJPEGXL_ENABLE_DEVTOOLS=OFF -DJPEGXL_ENABLE_BENCHMARK=OFF -DJPEGXL_ENABLE_EXAMPLES=OFF \
  -DJPEGXL_ENABLE_JNI=OFF -DJPEGXL_ENABLE_SJPEG=OFF -DJPEGXL_ENABLE_OPENEXR=OFF -DJPEGXL_ENABLE_MANPAGES=OFF \
  -DJPEGXL_ENABLE_DOXYGEN=OFF -DJPEGXL_ENABLE_JPEGLI=OFF -DJPEGXL_ENABLE_PLUGINS=OFF -DJPEGXL_ENABLE_SKCMS=ON \
  -DJPEGXL_ENABLE_TRANSCODE_JPEG=ON -DJPEGXL_ENABLE_BOXES=ON -DCMAKE_C_FLAGS=-msimd128 -DCMAKE_CXX_FLAGS=-msimd128
emmake make -C $B -j"$(nproc)" jxl jxl_cms
emcc -O3 -msimd128 -c "$(dirname "$0")/jxw.c" -I"$LIBJXL/lib/include" -I$B/lib/include -o $B/jxw.o
em++ -O3 -msimd128 $B/jxw.o $B/lib/libjxl.a $B/lib/libjxl_cms.a $B/third_party/brotli/libbrotlienc.a \
  $B/third_party/brotli/libbrotlidec.a $B/third_party/brotli/libbrotlicommon.a $B/third_party/highway/libhwy.a \
  -o "$OUT/frax-jxl.js" -sMODULARIZE=1 -sEXPORT_NAME=FraxJXL -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB \
  -sINITIAL_MEMORY=64MB -sENVIRONMENT=web,worker,node -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPU16,HEAPF32,HEAP32,UTF8ToString,stringToUTF8 \
  -sEXPORTED_FUNCTIONS=_malloc,_free -sFILESYSTEM=0 -sSTACK_SIZE=2MB
echo "built $OUT/frax-jxl.wasm"
