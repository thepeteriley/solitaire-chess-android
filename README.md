# Solitaire Chess for Android / GrapheneOS

An installed Android app with local Stockfish 19 analysis, a playable board, up to five candidate continuations, an adjustable-strength computer opponent, variation previews, history, undo, board flipping and FEN input. Portrait puts the board above analysis; landscape puts them side by side. Rotating does not restart your game.

## Install on GrapheneOS

Open https://github.com/thepeteriley/solitaire-chess-android/releases/latest on your phone. Download `solitaire-chess-1.0.0-android.apk`, tap the downloaded file and approve installation. If Android asks, allow that browser or Files app to install apps from this source. Google Play Services is not needed. The APK supports ARM64 phones, including GrapheneOS-supported Pixels, and x86-64 Android; minimum Android 8.0 (API 26).

The app requests no permissions, including no Internet, storage, contacts or microphone permission. Everything needed for play is bundled. The approximately 97 MiB download includes Stockfish's neural-network data. Games and preferences stay in the app's private local storage. Clearing app data or uninstalling removes them. Cloud backup and device-transfer backup are disabled.

Future APKs from this repository will use the same release signing identity so Android can install updates over this version. `SHA256SUMS` and the signing certificate's SHA-256 fingerprint are included with releases. Keep using a consistent signing source; a future F-Droid build might use a different signing key unless reproducible upstream-signature builds are arranged.

## F-Droid status

This app is not yet listed in F-Droid. Source, licences and store-description material are provided for an inclusion request; no F-Droid review or reproducible-build claim is implied. See `android/F-DROID.txt`. The GitHub APK can be sideloaded now.

## Build from source

Install Node.js 22.12 or newer, JDK 17 and the Android SDK. Install these SDK components:

```
platforms;android-36
build-tools;36.0.0
ndk;28.2.13676358
cmake;3.22.1
```

Set `JAVA_HOME` to JDK 17 and `ANDROID_HOME` to your SDK directory. From the repository root:

```sh
npm ci
node android/prepare.mjs
cd android
./gradlew assembleDebug
```

`./gradlew assembleRelease lintRelease` produces an unsigned release APK. Signing keys are deliberately absent from source. Sign your own release with Android SDK `apksigner`; Android requires an identical signing identity for updates. The Gradle wrapper is pinned to 8.11.1 with its official SHA-256; Android Gradle Plugin is pinned to 8.9.2. Native libraries are built from source for arm64-v8a and x86_64 with NDK r28's 16 KiB alignment.

Stockfish source is vendored under `android/Vendor/Stockfish`, based on sf_19 commit edb0d9db6731067ec50ce619ff372b463bc4dd5d. `android/patches/stockfish-no-shm.patch` disables shared memory in the app sandbox. The network `android/engine-resources/nn-1a298aa575a0.nnue` is official Stockfish data, bundled locally and checked against SHA-256 `1a298aa575a085434d29027978dc36867fe9c5bcea9376654b7a8eba1e52dfc2`. Original model URL: https://tests.stockfishchess.org/api/nn/nn-1a298aa575a0.nnue

## Architecture and licences

Android's platform WebView displays bundled React/chess.js assets at a local intercepted HTTPS origin. The host blocks external navigation/subresources, disables file/content access, and exposes only the app's JSON engine bridge. No remote website or server hosts the interface. Stockfish is compiled into a JNI library, with independent serial queues for analysis and opponent play, cancellation tokens and pause/resume handling.

Android-specific code and the combined Android/Stockfish distribution are GPL-3.0-or-later. The shared interface remains MIT-licensed; retain its notice in `android/third-party/Shared-interface-MIT-LICENSE.txt`. React, chess.js and Android NDK runtime notices are included in the app. Stockfish's GPL is in COPYING. The app's information button provides licences, source, privacy and support links.

## Verification

See `android/TESTING.txt`. Scripted Android UI tests require a debuggable build, one Android emulator connected via ADB, and the app at a fresh starting position. To run them from the repository root with ADB on PATH: `node android/test-ui.mjs`. They exercise the real JNI engine, not a browser-only replacement. Release builds disable WebView debugging.

Support: https://thepeteriley.github.io/solitaire-chess-support/
Privacy: https://thepeteriley.github.io/solitaire-chess-support/privacy.html
