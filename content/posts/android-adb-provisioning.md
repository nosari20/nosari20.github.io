---
title: "Android Enterprise Device Owner ADB provisioning"
date: 2022-09-02
lastmod: 2022-09-02
draft: false
tags: ["device-management", "android", "android-enterprise"]
summary:  "How to provision Device Owner using ADB?"
image: "/posts/android-adb-provisioning/_header.png"
ogimage: "/posts/android-adb-provisioning/_og.png"
githubissueID: "2" 
---

## Content
* Purpose
* Provisioning
* Sources / usefull resources

## Purpose

One day, I had to do some screen capture for the whole enrollment process, but some app screens were protected to prevent screenshots. I found a solution: provision device using `adb`, enable `Developer Options` and use [scrcpy](https://github.com/Genymobile/scrcpy) to get my device screen on my computer.

## Provisioning

1. Initialize device as usual (do not provision the device with standard Anrdoid Enterprise provisioning method)
2. Install the DPC client
3. Remove all Google accounts on device
4. Enable `Developper Options` and debug mode
5. Set the DPC role to the DPC client (cannot be undone or changed) with the following commands:

```bash
adb shell dpm set-device-owner <PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME>
```


| DPC                    | Admin component name                                                                             |
|------------------------|--------------------------------------------------------------------------------------------------|
| MobileIron Cloud       | com.mobileiron.anyware.android/com.mobileiron.polaris.manager.device.AndroidDeviceAdminReceiver  |
| MobileIron Core        | com.mobileiron/com.mobileiron.receiver.MIDeviceAdmin                                             |
| VMware Workspace ONE   | com.airwatch.androidagent/com.airwatch.agent.DeviceAdministratorReceiver                         |
| Android Management API | com.google.android.apps.work.clouddpc/.receivers.CloudDeviceAdminReceiver                        |
| Cisco Meraki           | com.meraki.sm/.DeviceAdmin                                                                       |
| Test DPC               | com.afwsamples.testdpc/.DeviceAdminReceiver                                                      |


6. Enroll device with DPC

## Sources / usefull resources
* https://documentation.meraki.com/SM/Device_Enrollment/Enabling_Device_Owner_Mode_using_Android_Debug_Bridge_(ADB)
* https://developers.google.com/android/management/provision-device