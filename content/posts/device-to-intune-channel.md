---
title: "Device to Intune secure channel using Azure Function"
date: 2023-01-09
lastmod: 2023-01-09
draft: true
tags: ["device-management", "windows", ""]
summary:  "Create a secure channel for Windows and macOS script to perform actions and store data to Intune using Azure Functions"
image: "/posts/device-to-intune-channel/_header.png"
ogimage: "/posts/device-to-intune-channel/_og.png"
---


## Content
* Purpose and reflexion
* Technical architecture
* Azure Function code
* Client scripts
* Sources / usefull resources

## Purpose and reflexion

One day, I had to find a solution to manage BIOS password for Windows device with the following needs:
- The password must be unique per device
- The password updated periodically
- The password must be available for support team
- The password must be randomly genarated


To achieve this, I had to find a solution to create generate a password from Intune and pass it to devices or to generate it from devices and pass it to Intune.

As Intune does not support script arguments and custome attribute unlike some other mdm solutions (e.g. on Ivanti Neurons for MDM you can pass and retrieve data from a macOS script) I had to find another way. 


## Technical architecture

I designed a simple method which use Azure Functions and certificate authentication which can be described with the following diagram:

![Secure channel](/posts/device-to-intune-channel/device-to-intune-channel.drawio.png)

With this system, Graph API credentials are never exposed and clients are limited by features exposed through the Azure Function and no one can impersonate devices because device are authenticated with certificate.

## Azure Function code

I created my Azure Function using the procedure povided in MS documentation [Quickstart: Create a PowerShell function in Azure using Visual Studio Code](https://learn.microsoft.com/en-us/azure/azure-functions/create-first-function-vs-code-powershell)


Certificate-based authentication must be set to required to make the process secure but the function code must include certificate verification as it is not handled automatically. In the following example I will use the certificat provided by Intune (signed by ``Microsoft Intune MDM Device CA``) which contains the Intune device id.

// TODO


The file ``function.json`` looks like the following

```json
{{% include "/static/posts/device-to-intune-channel/code/Azure Function/function.json" %}}
```

The file ``run.ps1`` which is the main code is the following:

```ps1
{{% include "/static/posts/device-to-intune-channel/code/Azure Function/run.ps1" %}}
```

## Client scripts

In order to authenticate, client scripts will use a certificate provided by Intune (signed by ``Microsoft Intune MDM Device CA``)


### Windows


#### Set password

```ps1
{{% include "/static/posts/device-to-intune-channel/code/Clients/Windows/Set-Password.ps1" %}}
```

#### Get password

```ps1
{{% include "/static/posts/device-to-intune-channel/code/Clients/Windows/Get-Password.ps1" %}}
```


### macOS

#### Set password

```sh
{{% include "/static/posts/device-to-intune-channel/code/Clients/macOS/Set-Password.sh" %}}
```

#### Get password

```sh
{{% include "/static/posts/device-to-intune-channel/code/Clients/macOS/Get-Password.sh" %}}
```

Note: macOS scripts can be reuse (with some changes) for Linux when Intune will include script execution for this OS.

## Sources / usefull resources
* https://developer.android.com/studio/command-line/logcat
* https://source.android.com/docs/setup/contribute/read-bug-reports