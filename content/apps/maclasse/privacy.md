---
title: "MaClasse — Privacy Policy"
date: 2026-09-19
lastmod: 2026-09-19
draft: false
hidden: true
summary: "How MaClasse handles your data."
# Copied from the MaClasse repository's PRIVACY.md. Keep the two in sync: edit PRIVACY.md,
# then paste its body (without the "# " title line) below this front matter and bump lastmod.
---

*[Version française](/apps/maclasse/confidentialite/)*

*Last updated: 19 September 2026*

MaClasse is an app for teachers. **The app itself collects nothing, has no servers, and the
developer has no access to any data you enter.** If you turn on the optional Pronote timetable
sync, the app makes one kind of outbound request — described below — and nothing else
changes. The optional MaClasse Pro subscription is bought through Google Play, whose bundled
Play Billing library sends its own diagnostics to Google for every user; see below.

## What the app stores, and where

Everything you create — classes, students, photos, notes, custom fields, reminders,
timetables, rooms, seating plans, groups, and your settings — is stored **only in the app's
private storage on your device**. It is not uploaded anywhere.

There is no account, no sign-in, no analytics, no advertising, no crash reporting, and no
third-party SDK that collects usage data, other than the Google Play Billing library's own
diagnostics described below.

## When data leaves the device

Only when you deliberately make it happen:

- **Backup** — you choose a destination through Android's file picker. If you pick a cloud
  folder such as Google Drive, the file goes to that provider under your own account, and
  their privacy policy applies from that point. You can protect the file with a password,
  which encrypts it with AES-256-GCM (key derived with PBKDF2-SHA256, 200 000 iterations).
  Doing so is strongly recommended, as a backup contains pupil names, photos and notes.
- **Calendar sync** — if you use it, your course times, class names and room names are
  written into a local calendar named "MaClasse" on your device. If that calendar account is
  itself synced to an online service by your phone, those entries follow it.
- **Pronote timetable sync** — if you enter a Pronote iCal subscription link in Settings, the
  app makes exactly one kind of outbound request: an HTTPS GET to that link, which points at
  your own établissement's Pronote server. No other host is contacted, nothing you enter
  about pupils, classes or rooms is uploaded, and the app does not follow redirects. This
  request happens on the schedule you choose (weekly by default, or daily, or only when you
  ask for a check) and its result is never written to your data automatically — it only
  raises a notification, and every change is written only after you review and approve it.
  The subscription link itself is a bearer credential: anyone who has it can read your
  timetable with no further login. It is stored on the device and shown masked in the app,
  and it is included in a backup file **only when that backup is password-protected**; an
  unencrypted backup omits it.
- **MaClasse Pro subscription** — if you subscribe, the purchase is made and managed entirely
  by Google Play under your Google account, and Google's privacy policy applies to it. The
  app asks the Play Store app on your phone whether the subscription is active, and the
  Google Play Billing library included in the app sends Google diagnostic data about its own
  operation, also under Google's privacy policy — this happens whenever the app checks the
  subscription, including for users who never subscribe. It never includes classes, pupils,
  notes, or anything you enter. The developer receives no personal data beyond the order
  records Google Play provides to every developer.

## Permissions the app requests, and why

| Permission | Why |
|---|---|
| `POST_NOTIFICATIONS` | to show your reminders and the morning digest |
| `SCHEDULE_EXACT_ALARM` | so a reminder arrives at the time you set |
| `RECEIVE_BOOT_COMPLETED` | to restore pending reminders after the phone restarts |
| `READ_CALENDAR`, `WRITE_CALENDAR` | only if you use the optional calendar sync |
| `INTERNET`, `ACCESS_NETWORK_STATE` | for the Pronote fetch, if you set a subscription link, and by the Google Play Billing library's own diagnostics (see above) |
| `com.android.vending.BILLING` | to buy and check the MaClasse Pro subscription through Google Play |
| Camera (optional feature) | only if you take a student's photo with the camera |

There is no location, contacts, or microphone permission.

## Children's data

The app is for teachers, not pupils, and is not directed at children. But the data you enter
describes pupils, who are often minors. You remain the person responsible for that data
under GDPR and your institution's rules. In practice: use a device lock, encrypt your
backups, and delete data you no longer need.

## Deleting your data

Uninstalling the app deletes everything it stored on the device. Backup files you exported
yourself are not affected — delete those wherever you saved them.

## Changes

Any change to this policy will appear in this file, with the date above updated.

## Contact

nosari20@gmail.com

Public copy: https://nosari20.github.io/apps/maclasse/privacy/
