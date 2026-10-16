#!/bin/sh
# Build the per-platform extension zips. Needs a Blender 5.2+ executable (or the bpy module) on this machine.
set -e
cd "$(dirname "$0")"
mkdir -p wheels
for p in win_amd64 win_arm64 macosx_11_0_arm64 macosx_10_13_x86_64 manylinux1_x86_64 manylinux2014_aarch64; do
  pip download -q wasmtime==48.0.0 --only-binary=:all: --no-deps --platform $p -d wheels
done
${BLENDER:-blender} --command extension build --split-platforms --output-dir dist
