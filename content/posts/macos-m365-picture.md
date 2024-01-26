---
title: "Synchronize macOS account picture with Entra ID (formerly Azure AD)"
date: 2024-01-26
lastmod: 2024-01-26
draft: false
tags: ["device-management", "macos", "powershell", "shell", "azure", "entra-id", "dev-scripting"]
summary:  "Improve user experience by synchronizing macOS account picture with Entra ID."
image: "/posts/macos-m365-picture/_header.png?"
ogimage: "/posts/macos-m365-picture/_og.png?"
githubissueID: "8"
 
---
## Content
* Purpose
* Solution
* Sources / usefull resources

## Purpose

One day, I wanted to synchronize Entra ID (formerly Azure AD) account picture with macOS devices account picture, so user will have the same behavior on Windows and macOS. I waited for Entra ID Platform SSO to comes out, but public preview shows that it does not synchronize user picture.


{{< rawhtml >}}
<div>
  <img alt="User accounts list" src="/posts/macos-m365-picture/user-accounts.png" style="width: 50%;display:block;margin:auto">
</div>
{{< /rawhtml >}}


## Solution

Here is a quick overview of what my solution looks like:
* Azure Function as midleware which will use MS Graph API to retrieve user picture. I choose to use it to prevent Graph API credentials exposure (see my previous [post]({{< ref "/posts/device-to-intune-channel" >}}) about this).
* A Shell script, run periodically by MDM, which perform HTTP calls to the Azure Function in order to retrieve user picture and set it as account picture.

## Azure Function code

This Azure function uses the same base as the one [here]({{< ref "/posts/device-to-intune-channel" >}}) and require client certificate (certificate is validated in function code). You have to change line 42 to put the base64 string of your own CA (and sub-CA). Unfortunately you cannot use Intune MDM certificate as it does not allow all apps to use it (do not forget to allow all apps to use the certificate you deploy, I suggest to use a dedicated configuration and put purpose as OU like in my example).

The certificate is checked but you can improve security by adding the following checks:
* Check that device still exist in MDM
* Check that device is compliant
* Put owner UPN in certificate

To simplify requests, I choose to make a unique endpoint and return picture data directly when applicable.

```ps1
{{% include "/static/posts/macos-m365-picture/code/Azure Function/run.ps1" %}}
```

## Shell script

The client script relies on work from [copyprogramming.com](https://copyprogramming.com/howto/setting-account-picture-jpegphoto-with-dscl-in-terminal) for setting user picture. I choose to iterate over users accounts to make all users have the proper picture, as I am using [Entra ID Platform SSO](https://techcommunity.microsoft.com/t5/microsoft-entra-blog/coming-soon-platform-sso-for-macos/ba-p/3902280) to create accounts I filter the result to get only user containing domain (@ is ommited during creation but user have to login using UPN as well).

You may have to change line 107 to match what you choose as OU and eventually change the `findCertAlias` function if you need more criteria.

Note: the string `CURL_SSL_BACKEND=secure_transport` before the `curl` command is used in order to allow `curl` to use certificates in keychain instead of files.

Note 2: Users will need to reboot devices to apply change on login screen.

```sh
{{% include "/static/posts/macos-m365-picture/code/Client/Set-ProfilePicture.sh" %}}
```

## Sources / usefull resources

* https://copyprogramming.com/howto/setting-account-picture-jpegphoto-with-dscl-in-terminal
* [{{< ref "/posts/device-to-intune-channel" >}}]({{< ref "/posts/device-to-intune-channel" >}})