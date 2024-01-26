---
title: "Android Logging guide"
date: 2022-09-01
lastmod: 2023-04-08
draft: false
tags: ["device-management", "android"]
summary:  "Fantastic logs and where to find them"
image: "/posts/android-logs/_header.png"
ogimage: "/posts/android-logs/_og.png"
githubissueID: "3" 
---

## Content
* Android adb log
* Bug report
* Samsung dumpstate
* Sources / usefull resources

## Android adb log

### Purpose and content

Android adb logs contain all runtime data about applications and system processes. Log level can be specified and logs can be filtered. 

ADB logs look like the following example:

![ADB logs](/posts/android-logs/adb-logs.png)

### How to gather adb logs

0. Download android platform tools on https://developer.android.com/studio/releases/platform-tools 
1. Plug the device to computer using USB cable
2. Turn on developer settings and enable USB debugging

{{< rawhtml >}}
<div>
  <img alt="Tap build number" src="/posts/android-logs/build-number.png" style="width: 24%">
  <img alt="Enable dev options" src="/posts/android-logs/dev-options.png" style="width: 24%">
  <img alt="Enable usb debugging" src="/posts/android-logs/debug-mode.png" style="width: 24%">
  <img alt="Allow usb debugging" src="/posts/android-logs/allow-usb-debugging.png" style="width: 24%">
</div>
{{< /rawhtml >}}

3. Use the following command line to ensure that the device is connected (a pop-up should appear on the device requesting user approval, select `Always allow from this computer`)
```bash
adb devices
```

![ADB devices](/posts/android-logs/adb-adbdevices.png)

4. Clear old data
```bash
adb logcat -b all -c
```

![ADB logcat clear](/posts/android-logs/adb-adblogcatclear.png)

5. Run logcat
```bash
adb logcat -v threadtime > android.log
```

![ADB logcat](/posts/android-logs/adb-logcat.png)

6. Reproduce the issue
7. Use CTRL + C to stop collecting logs

Logs are now all store in `android.log`


### Usefull logact filters

| Purpose                | Command                                                     |
|------------------------|-------------------------------------------------------------|
| Specific app           | ``adb logcat --pid=$(adb shell pidof "<PACKAGE_NAME>")``    |
| Wi-Fi                  | ``adb logcat -s wpa_supplicant``                           |
| Auth                   | ``adb logcat -s Auth``                           |



## Bug report

### Purpose and content

A bug report contains device logs, stack traces, and other diagnostic information. The bug report can be generated using `adb` or from the device `Settings` app.

A bug report look like the following example:
![ADB logs](/posts/android-logs/bugreport-file.png)

### How to generate a bug report using ADB


Important : reproduce the issue before collecting a bug report

0. Download android platform tools on https://developer.android.com/studio/releases/platform-tools 
1. Plug the device to computer using USB cable
2. Turn on developer settings and enable USB debugging
{{< rawhtml >}}
<div>
  <img alt="Tap build number" src="/posts/android-logs/build-number.png" style="width: 24%">
  <img alt="Enable usb debugging" src="/posts/android-logs/dev-options.png" style="width: 24%">
  <img alt="Enable usb debugging" src="/posts/android-logs/debug-mode.png" style="width: 24%">
  <img alt="Allow usb debugginh" src="/posts/android-logs/allow-usb-debugging.png" style="width: 24%">
</div>
{{< /rawhtml >}}

3. Use the following command line to ensure that the device is connected (a pop-up should appear on the device requesting user approval, select Always allow from this computer)
```bash
adb devices
```

![ADB devices](/posts/android-logs/adb-adbdevices.png)

4. Type the following command
```bash
adb bugreport
```

![ADB logs](/posts/android-logs/adb-bugreport.png)

5. The bugreport file name should look like `bugreport-YYY-MM-DD-HH-MM-SS.zip`


### How to generate a bug report from device settings app

1. Turn on developer settings 
2. Tap `Take bug report` then `Full report` and finnaly `Report`

{{< rawhtml >}}
<div>
  <img alt="Take bug report" src="/posts/android-logs/create-bugreport.png" style="width: 24%">
  <img alt="Take bug report" src="/posts/android-logs/generate-full-report .png" style="width: 24%">
</div>
{{< /rawhtml >}}

4. Tap the notification to share the bugreport file

{{< rawhtml >}}
<div>
  <img alt="Take bug report" src="/posts/android-logs/share-bugreport.png" style="width: 24%">
</div>
{{< /rawhtml >}}


## Samsung dumpstate

### Purpose and content

Samsung dumpstate is a specific set of log files that are always requested by Samsung support. The logs include the same data we can find in a bug report with aditional Samsung specific logs and data.

### How to generate a dumpstate

1. Open the phone app (for tablet open the `Calculator` app and type (`+30012012732+` to open the prompt)
2. Type `*#9900#`
3. Tap `Debug Level Disabled/LOW` then tap `MID` (the device will reboot after this step)
4. Reproduce the issue
5. Open the phone app (for tablet open the Calculator app and type (`+30012012732+` to open the prompt)
6. Type `*#9900#`
7. Tap `Run dumpstate/logcat` (the process will takes several seconds)
8. Tap `Copy to sdcard`
9. Tap 2 times the `Home` button to exit
10. Open the application drawer and open the `My Files` app (often under the `Samsung` folder)
11. Go to `Internal storage > log`
12. The dumpState file name starts with `dumpState`


Do not forget to restore the log level
1. Open the phone app (for tablet open the Calculator app and type (`+30012012732+` to open the prompt)
2. Type `*#9900#`
3. Tap `Debug Level Enabled/MID` then tap `LOW` (the device will reboot after this step)


## Sources / usefull resources
* https://developer.android.com/studio/command-line/logcat
* https://source.android.com/docs/setup/contribute/read-bug-reports