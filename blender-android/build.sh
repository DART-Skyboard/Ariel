#!/usr/bin/env bash
# Build + sign the updater APK. Needs: Android SDK (platform 34, build-tools 35), JDK 17+, a keystore.
# usage: ANDROID_HOME=... KEYSTORE=... KSPASS=... ./build.sh
set -e
cd "$(dirname "$0")"; BT=$ANDROID_HOME/build-tools/35.0.0; AJ=$ANDROID_HOME/platforms/android-34/android.jar
rm -rf build && mkdir -p build/gen build/cls
$BT/aapt2 compile --dir res -o build/res.zip
$BT/aapt2 link -o build/base.apk -I $AJ --manifest AndroidManifest.xml --java build/gen build/res.zip --min-sdk-version 26 --target-sdk-version 34
javac -nowarn --release 8 -g:none -cp $AJ -d build/cls src/app/blendupd/Main.java
$BT/d8 --min-api 26 --lib $AJ --output build build/cls/app/blendupd/*.class
cp build/base.apk build/u.apk; (cd build && zip -q -j u.apk classes.dex)
$BT/zipalign -f 4 build/u.apk build/a.apk
$BT/apksigner sign --ks "$KEYSTORE" --ks-pass pass:"$KSPASS" --key-pass pass:"$KSPASS" --out ../templates/blender/BlenderTabletUpdater.apk build/a.apk
