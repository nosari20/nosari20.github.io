# webadb applist dex

`Main.java` is compiled to `static/webadb/applist.dex` — pushed to the device by
the WebADB tool and run inside ART via `app_process` to dump every package's
label + version in one shot (no per-APK pull, no aapt).

On device the tool runs:

```
CLASSPATH=/data/local/tmp/applist.dex app_process / Main
```

Output: one line per app, tab-separated `package\tlabel\tversion\tsystemFlag`.

## Build

`static/webadb/applist.dex` is **gitignored** and built automatically by the
`gh-pages` GitHub Action (it sets up a JDK + Android SDK, compiles this source,
and Hugo then copies the dex into the published site).

For **local** development (`hugo server`), build it once by hand so the Apps tab
gets the fast path — otherwise the tool silently uses the slower fallback.

Requires a JDK and Android build-tools (for `d8`) + a platform `android.jar`.

```sh
SDK="$HOME/AppData/Local/Android/Sdk"
AJAR="$SDK/platforms/android-34/android.jar"
D8="$SDK/build-tools/36.0.0/d8.bat"

# run from static/webadb/applist-src/
javac --release 11 -cp "$AJAR" -d classes Main.java
"$D8" classes/Main.class --lib "$AJAR" --min-api 24 --output .
mv classes.dex ../applist.dex
```

## Notes

- Uses `ActivityThread.systemMain()` / `getSystemContext()` (hidden APIs, via
  reflection) to get a system `Context`, then the public `PackageManager` to
  resolve localized labels. Works from a shell-spawned `app_process` (same way
  scrcpy accesses framework internals).
- If a device blocks this (strict hidden-API policy / very old Android), the
  tool falls back to `pm list packages` + lazy per-row label lookup
  (on-device `aapt`, else pulling and parsing the APK in the browser).
