---
title: "Device to EMM secure channel using Azure Function"
date: 2023-03-11
lastmod: 2023-03-11
draft: false
tags: ["device-management", "windows", "intune","azure","android","macos"]
summary: "Create a secure channel for scripts and apps to perform actions and store data to EMM using Azure Functions"
image: "/posts/device-to-intune-channel/_header.png"
ogimage: "/posts/device-to-intune-channel/_og.png"
githubissueID: "7" 
---


## Content
* Purpose and reflexion
* Technical architecture
* Azure Function code
* Clients examples

## Purpose and reflexion

Sometimes we need to perform custom actions on devices and return data to Intune or perform Intune actions from device, here are some examples:
* Generate random BIOS password from windows device and return it to Intune using script
* Choose device category for Android Dedicated devices
* Add device to group when third-party EDR is activated

Unfortunately, for the first and the third example, Intune does not offer any solution to report data to Intune and use it in groups. For the second one, a category can be chosen from Company Portal but it is not available for dedicated devices.

For this reason, I had to find a way to achieve my goals, so I designed a simple architecture with minimal requirements.

## Technical architecture

My solution uses Azure Functions and certificate authentication, which is described in the following diagram:

![Secure channel](/posts/device-to-intune-channel/device-to-intune-channel.drawio.png)

With this system, Graph API credentials are never exposed and clients are limited by features exposed through the Azure Function and no one can impersonate devices because device are authenticated with certificate.


## Client certificates

In my case, I use Intune and ,unfortunately, it does not offer the ability to create a free private certificate authority, but I discovered that Intune pushes a certificate which contains Azure DeviceID into each device and we can use it to authenticate devices against our Azure Function. If you are using another MDM solution or push your own certificate use you can obviously use them.

Using Intune, only Windows and macOS have a certificate which can be verified easily (issued ``Microsoft Intune MDM Device CA``). On Android and iOS we only have the ``MS-Organization-Access`` issued certificate but we cannot retrieve the root CA cert and so we cannot verify client certs.

In my future examples, I will assume that the client certificate used contains the Intune DeviceID in the subject (i.e., Subject = CN=<INTUNE_DEVICEiD>) and it is issued by ``Microsoft Intune MDM Device CA``. Obviously, you can adapt them easily and will also add some examples which do not have the Intune certificate (e.g., Android).


## Azure Function code

I created my Azure Function using the procedure provided in MS documentation [Quickstart: Create a PowerShell function in Azure using Visual Studio Code](https://learn.microsoft.com/en-us/azure/azure-functions/create-first-function-vs-code-powershell)


Certificate-based authentication must be set to ``required`` to make the process secure, but the function code must include certificate verification as it is not handled automatically. In the following example I will use the certificate provided by Intune (signed by ``Microsoft Intune MDM Device CA``) which contains the Intune device id.


The file ``function.json`` looks like the following

```json
{{% include "/static/posts/device-to-intune-channel/code/Azure Function/function.json" %}}
```

The file ``run.ps1`` which is the main code is the following:

```ps1
{{% include "/static/posts/device-to-intune-channel/code/Azure Function/run.ps1" %}}
```

## Clients


### Windows


#### Set AzureAD Status to notes

```ps1
{{% include "/static/posts/device-to-intune-channel/code/Clients/Windows/Set-Note.ps1" %}}
```

### macOS

Important: at the moment, I have not found a solution to allow a specific app to use a private key using a script or a profile, so a pop-up will appear at first run to allow ``curl`` to use the private key. Alternatively, you can push your own certificate and allow all apps to use it.

#### Set MDM profile to notes

```sh
{{% include "/static/posts/device-to-intune-channel/code/Clients/macOS/Set-Note.sh" %}}
```


### Android (snippet)

Note: use your own certificate

#### Set Bluetooth name to note

```kt
{{% include "/static/posts/device-to-intune-channel/code/Clients/Android/Set-Note.kt" %}}
```

Note: macOS scripts will be reuseable (with some changes) for Linux when Intune will include script execution for this OS.
