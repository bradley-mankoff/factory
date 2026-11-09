#!/bin/sh
# Builds RunBar from this folder and installs it as ~/Applications/RunBar.app, signed ad
# hoc so macOS opens it without a developer certificate. scripts/install.sh runs it and
# then gives the app the login job that opens it; running it alone rebuilds the app, which
# is what a Run wants after changing a source file.
#
# The build folder is not in this folder: the Factory's size count reads every file git does
# not ignore, so a build product must not land in the checkout. It is
# ~/.local/share/factory/runbar, the Factory's one root, or RUNBAR_BUILD.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
build=${RUNBAR_BUILD:-$HOME/.local/share/factory/runbar}
app=${RUNBAR_APP:-$HOME/Applications/RunBar.app}

swift build -c release --package-path "$here" --scratch-path "$build"
mkdir -p "$app/Contents/MacOS"
cp -f "$build/release/RunBar" "$app/Contents/MacOS/RunBar"
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key><string>RunBar</string>
	<key>CFBundleIdentifier</key><string>com.bradley-mankoff.runbar</string>
	<key>CFBundleName</key><string>RunBar</string>
	<key>CFBundlePackageType</key><string>APPL</string>
	<key>CFBundleShortVersionString</key><string>1.0</string>
	<key>LSMinimumSystemVersion</key><string>13.0</string>
	<key>LSUIElement</key><true/>
</dict>
</plist>
PLIST
codesign --force --sign - "$app"
