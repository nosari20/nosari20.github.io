---
title: "Manage HoloLens using MDM"
date: 2022-11-05
lastmod: 2022-11-05
draft: false
tags: ["device-management", "windows", "hololens"]
summary:  "Manage HoloLens devices using MDM and Azure AD"
image: "/posts/manage-hololens/_header.png"
ogimage: "/posts/manage-hololens/_og.png"
---
## Content
* Use cases
* Enrollment
* Policies
* Applications
* Security
* Appendices
* Sources / usefull resources

## Uses cases

I have made two HoloLens 2 deployments for the moment and in both cases, the use-case was: task workers who use Dynamics Remote Assist and Dynamics Guides. So, in this article mine will be the following:
* HoloLens 2
* Open internet connection (e.g. 4G/5G router)
* Kiosk mode
* Dynamics Remote Assist app (remote support helping on-site operator)


## Enrollment

There are three ways to enroll a HoloLens 2 device:

1. [PPKG Enrollment](https://docs.microsoft.com/en-us/hololens/hololens-provisioning)
    * PPKG must be stored on a USB drive or transferred to the device using a computer
    * Manual enrollment
    * Userless
    * AAD not required
2. [Standard OOBE](https://docs.microsoft.com/en-us/windows-hardware/customize/desktop/customize-oobe)
    * Manual enrollment
    * User assigned to device
3. [Autopilot (Self-Deploying only)](https://docs.microsoft.com/en-us/mem/autopilot/self-deploying)
    * Device linked to AAD until removal from Autopilot (cannot be used for personal use and easy to redeploy)
    * Ability to use Autopilot group tag
    * Userless

To be efficient and as [Autopilot hardware hash is easy to get](https://docs.microsoft.com/en-us/hololens/hololens2-autopilot#obtain-hardware-hash) without initializing the device, I recommend using this method for all enrollments but you will have to take into consideration that the device will not be assigned to any user.


![Autopilot process](/posts/manage-hololens/autopilot-process.drawio.png)


## Authentication

By default, users must setup Windows Hello in order to finish the profile creation on the device. When a device is Azure AD registered, this feature is called [Windows Hello for Business](https://learn.microsoft.com/en-us/windows/security/identity-protection/hello-for-business/hello-overview), which requires MFA to finish setup (i.e., the user is prompted for MFA before defining PIN). To prevent MFA prompt, we can use [Temporary Access Pass](https://learn.microsoft.com/en-us/azure/active-directory/authentication/howto-authentication-temporary-access-pass) which is considered as a strong authentication method, and so avoid MFA prompt. Alternatively, you can use a FIDO2 key, which is also considered as a strong authentication method but requires initial setup.

{{< rawhtml >}}
    <img alt="Windows Hello PIN" src="/posts/manage-hololens/windows-hello-pin.png" style="display:block;width:70%;margin:auto;">
{{< /rawhtml >}}

## Policies

Using Policies CSP is the only way to manage HoloLens 2 devices (you cannot use PowerShell or GPO), the supported ones are listed [here](https://learn.microsoft.com/en-us/windows/client-management/mdm/policies-in-policy-csp-supported-by-hololens2), but be aware that some CSPs are also compatible even if they are not listed (e.g., Edge CSP). 


## Applications

Only [Universal Windows Platform (UWP)](https://learn.microsoft.com/en-us/windows/uwp/get-started/universal-application-platform-guide) apps can be installed on Windows Holographics, and for the moment there is no app catalog in leading UEM solutions that support HoloLens.

### Public apps

At the time of writing this article, Microsoft Store for Business is the only public source available and it will be [retired in the first quarter of 2023](https://techcommunity.microsoft.com/t5/windows-it-pro-blog/evolving-the-microsoft-store-for-business-and-education/ba-p/2569423) so a new solution will be available ([Windows Package Manager](https://learn.microsoft.com/en-us/windows/package-manager/) will be available for the desktop Windows version).

### Private apps

Private apps can be uploaded directly to UEM solution, apps must meet. If you want to get the AUMID of an app, you can follow the procedure in the appendices.

## Standard

### Overview

HoloLens devices have standard built-in security feature like BitLocker and Code Integrity. Each device include a TPM chip to secure identity and data. All security informations can be found [here](https://learn.microsoft.com/en-us/hololens/security-overview).

### Kiosk

You can create a kiosk mode for HoloLens devices using [``AssignedAccess`` CSP](https://learn.microsoft.com/en-us/windows/client-management/mdm/assignedaccess-csp).


OMA-URI : ``./Device/Vendor/MSFT/AssignedAccess/Configuration``

Value   : ``xml string (see example in the appendices)``

{{< rawhtml >}}
    <img alt="HoloLens 2 Kiosk" src="/posts/manage-hololens/hololens-kiosk.png" style="display:block;width:40%;margin:auto;">
{{< /rawhtml >}}

Kiosk specifications:
* Experience similar to the standard Start Menu
* Multi app kiosk
* Add app by AUMID
* Applied only to specified AAD groups with ability to create multiple profiles (⚠ if not applicable, the user has the standard experience)
* Apps which are not allowed can be run if called from another apps (e.g. you can open MS Store from the OneDrive app by selecting the open-in app option)

Tips:
* Prevent the use of consumer MS Store using [``ApplicationManagement/RequirePrivateStoreOnly`` CSP](https://learn.microsoft.com/fr-fr/windows/client-management/mdm/policy-csp-applicationmanagement#applicationmanagement-requireprivatestoreonly)
* Allow 'Settings' in kiosk and restrict visibility to items using [``Settings/PageVisibilityList`` CSP](https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-settings#settings-pagevisibilitylist)
* Setup group membership cache to allow offline logon using [``MixedReality/AADGroupMembershipCacheValidityInDays`` CSP](https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-mixedreality#mixedreality-aadgroupmembershipcachevalidityindays)
* Disable iris scan using [``PassportForWork/Biometrics/UseBiometrics``](https://learn.microsoft.com/en-us/windows/client-management/mdm/passportforwork-csp)



## Appendices

### Kiosk XML sample

The bellow xml configures a kiosk with the following specifications:

* One profile for user allowed to use HoloLens
* One profile for other users

```xml
<?xml version="1.0" encoding="utf-8" ?>
<AssignedAccessConfiguration
    xmlns="http://schemas.microsoft.com/AssignedAccess/2017/config"
    xmlns:v2="http://schemas.microsoft.com/AssignedAccess/201810/config"
    xmlns:v3="http://schemas.microsoft.com/AssignedAccess/2020/config"
    xmlns:v5="http://schemas.microsoft.com/AssignedAccess/202010/config"
    xmlns:rs5="http://schemas.microsoft.com/AssignedAccess/201810/config"
>
  <Profiles>
    <!--
    In this example, there are 2 different profiles, one for each AAD account. 
    You can create multiple profiles as shown below, however please ensure their Id is unique and is referenced correctly in configs as desired.
    -->
    <Profile Id="{8739C257-184F-45DD-8657-C235819172A3}">
      <AllAppsList>
        <AllowedApps>
          <!--
            TODO:
            1. Add AUMIDs of app(s) you want displayed in start menu. See examples below.
            2. Specify rs5:AutoLaunch="true" only for 1 app. If automatic launch not desired, remove this attribute.
            -->
          <!-- Camera -->
          <App AppUserModelId="HoloCamera_cw5n1h2txyewy!HoloCamera" />
          <!-- Device Picker on HoloLens 2 -->
          <App AppUserModelId="Microsoft.Windows.DevicesFlowHost_cw5n1h2txyewy!Microsoft.Windows.DevicesFlowHost" />
          <!-- Dynamics 365 Remote Assist -->
          <App AppUserModelId="Microsoft.MicrosoftRemoteAssist_8wekyb3d8bbwe!Microsoft.RemoteAssist" />
          <!-- File Explorer -->
          <App AppUserModelId="c5e2524a-ea46-4f67-841f-6a9465d9d515_cw5n1h2txyewy!App" />
          <!-- New Microsoft Edge -->
          <App AppUserModelId="Microsoft.MicrosoftEdge.Stable_8wekyb3d8bbwe!MSEDGE" />
          <!-- New Settings -->
          <App AppUserModelId="BAEAEF15-9BAB-47FC-800B-ACECAD2AE94B_cw5n1h2txyewy!App" />
        </AllowedApps>
      </AllAppsList>
      <StartLayout>
        <![CDATA[
            <LayoutModificationTemplate xmlns:defaultlayout="http://schemas.microsoft.com/Start/2014/FullDefaultLayout" xmlns:start="http://schemas.microsoft.com/Start/2014/StartLayout" Version="1" xmlns="http://schemas.microsoft.com/Start/2014/LayoutModification">
            </LayoutModificationTemplate>
        ]]>
      </StartLayout>
      <Taskbar ShowTaskbar="true"/>
    </Profile>
    <Profile Id="{66A75FBE-A9EE-4497-B6B5-A2644A1D3997}">
      <AllAppsList>
        <AllowedApps>
          <!--
            TODO:
            1. Add AUMIDs of app(s) you want displayed in start menu. See examples below.
            2. Specify rs5:AutoLaunch="true" only for 1 app. If automatic launch not desired, remove this attribute.
            -->
            <!-- Empty (at least one is required) -->
            <App AppUserModelId="" />
        </AllowedApps>
      </AllAppsList>
      <StartLayout>
        <![CDATA[
            <LayoutModificationTemplate xmlns:defaultlayout="http://schemas.microsoft.com/Start/2014/FullDefaultLayout" xmlns:start="http://schemas.microsoft.com/Start/2014/StartLayout" Version="1" xmlns="http://schemas.microsoft.com/Start/2014/LayoutModification">
            </LayoutModificationTemplate>
        ]]>
      </StartLayout>
      <Taskbar ShowTaskbar="true"/>
    </Profile>
  </Profiles>
  <Configs>

     <!-- Profile for HoloLens users -->
    <Config>   
      <UserGroup Type="AzureActiveDirectoryGroup" Name="INSERT GROUP ID" />
      <DefaultProfile Id="{8739C257-184F-45DD-8657-C235819172A3}" />
    </Config>

    <!-- Profile for all other users -->
    <Config>
      <UserGroup Type="AzureActiveDirectoryGroup" Name="INSERT GROUP ID" />
      <DefaultProfile Id="{66A75FBE-A9EE-4497-B6B5-A2644A1D3997}" />
    </Config>

  </Configs>
</AssignedAccessConfiguration>
```

### Get app AUMID

1.	Unzip .appx file
2.	Open file AppxManifest.xml
3.	Locate information

    Package Name: ``Package > Identity > Name``

    Publisher: ``Package > Identity > Publisher`` (use script bellow to get the hash)

    Application ID: ``Package > Applications > Application > Id``
4.	Concat data as described below



{{< rawhtml >}}
    <img alt="AUMID format" src="/posts/manage-hololens/aumid-format.png" style="display:block;width:auto;max-width: 100%;margin:auto;">
{{< /rawhtml >}}


{{< rawhtml >}}
<br><u>Note about publisher hash:</u>
{{< /rawhtml >}}

Publisher hash is the result of the following operations on attribute "Publisher" of the node "Identity" from application manifest:
```xml
<Identity Name="Microsoft.UWPAppExample"
          Publisher="CN=Microsoft Corporation"
          Version="1.0.0.0"
          ProcessorArchitecture="x86" />
```
```
Publisher → UTF16 → SHA256 → Take first 40-bits → Encode base32
```
Powershell script (source : [Jeroen de Jong](https://stackoverflow.com/users/13227110/jeroen-de-jong) from [StackOverflow post](https://stackoverflow.com/questions/21568483/how-to-calculate-publisherid-from-publisher)):

```ps1
Function Get-PublisherIdFromPublisher ($Publisher) {
    $EncUTF16LE = [system.Text.Encoding]::Unicode
    $EncSha256 = [System.Security.Cryptography.HashAlgorithm]::Create("SHA256")

    # Convert to UTF16 Little Endian
    $UTF16LE = $EncUTF16LE.GetBytes($Publisher)

    # Calculate SHA256 hash on UTF16LE Byte array. Store first 8 bytes in new Byte Array
    $Bytes = @()
    (($EncSha256.ComputeHasH($UTF16LE))[0..7]) | % { $Bytes += '{0:x2}' -f $_ }

    # Convert Byte Array to Binary string; Adding padding zeros on end to it has 13*5 bytes
    $BytesAsBinaryString = -join $Bytes.ForEach{ [convert]::tostring([convert]::ToByte($_,16),2).padleft(8,'0') }
    $BytesAsBinaryString = $BytesAsBinaryString.PadRight(65,'0')

    # Crockford Base32 encode. Read each 5 bits; convert to decimal. Lookup position in lookup table
    $Coded = $null
    For ($i=0;$i -lt (($BytesAsBinaryString.Length)); $i+=5) {
        $String = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
        [int]$Int = [convert]::Toint32($BytesAsBinaryString.Substring($i,5),2)
        $Coded += $String.Substring($Int,1)
    }
    Return $Coded.tolower()
}

Get-PublisherIdFromPublisher -Publisher "CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US"
```

## Sources / usefull resources
* https://docs.microsoft.com/en-us/hololens/hololens-provisioning
* https://docs.microsoft.com/en-us/hololens/hololens2-autopilot
* https://docs.microsoft.com/en-us/mem/autopilot/self-deploying
* https://docs.microsoft.com/en-us/windows-hardware/customize/desktop/customize-oobe
* https://learn.microsoft.com/en-us/azure/active-directory/authentication/howto-authentication-temporary-access-pass
* https://learn.microsoft.com/en-us/hololens/security-overview
* https://learn.microsoft.com/en-us/windows/client-management/mdm/assignedaccess-csp
* https://learn.microsoft.com/en-us/windows/client-management/mdm/passportforwork-csp
* https://learn.microsoft.com/en-us/windows/client-management/mdm/policies-in-policy-csp-supported-by-hololens2
* https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-mixedreality
* https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-settings
* https://learn.microsoft.com/en-us/windows/package-manager/
* https://learn.microsoft.com/en-us/windows/security/identity-protection/hello-for-business/hello-overview
* https://learn.microsoft.com/en-us/windows/uwp/get-started/universal-application-platform-guide
* https://learn.microsoft.com/fr-fr/windows/client-management/mdm/policy-csp-applicationmanagement
* https://stackoverflow.com/questions/21568483/how-to-calculate-publisherid-from-publisher
* https://techcommunity.microsoft.com/t5/windows-it-pro-blog/evolving-the-microsoft-store-for-business-and-education/ba-p/2569423
