---
title: "Bluetooth HID — Privacy Policy"
date: 2026-10-10
lastmod: 2026-10-10
draft: false
hidden: true
summary: "How Bluetooth HID handles your data."
# Copied from the Bluetooth-HID repository's PRIVACY.md. Keep the two in sync: edit PRIVACY.md,
# then paste its body (without the "# " title line) below this front matter and bump lastmod.
---

Bluetooth HID collects **no data**.

- **No internet access.** The app has no `INTERNET` permission. Barcode scanning uses Google ML Kit's *bundled* on-device model; nothing is uploaded.
- **No analytics, ads or crash reporting.**
- **Stored on the phone only** (app preferences): typing speed, chosen keyboard layout per paired computer (keyed by Bluetooth address), last connected computer, and UI settings. Uninstalling the app deletes them.
- **Scanned and typed text** is kept in memory only while on screen and sent only to the computer you connected. *Copy* puts scanned text on the clipboard marked as sensitive.

## Permissions

| Permission | Why |
|---|---|
| Nearby devices (Bluetooth connect/advertise) | Act as a Bluetooth keyboard/mouse and become discoverable for pairing |
| Camera | Scan QR codes and barcodes (Scan & type only) |
| Vibrate | Confirm slide changes in Presenter mode |

## Contact

Questions about this policy: open an issue at https://github.com/nosari20/Bluetooth-HID/issues.
