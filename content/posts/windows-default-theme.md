---
title: "Customize Windows 10+ default theme"
date: 2022-09-13
lastmod: 2022-09-14
draft: false
tags: ["device-management", "windows", "powershell", "dev-scripting"]
summary:  "Customize the Windows 10+ default theme using PowerShell script (wallpaper, lockscreen, etc.)"
image: "/posts/windows-default-theme/_header.png"
ogimage: "/posts/windows-default-theme/_og.png"
githubissueID: "1" 
---
## Content
* Purpose
* Study
* PowerShell script
* Sources / usefull resources

## Purpose

One day, I wanted to change the default wallpaper and lockscreen of Windows computers for all the user profiles and let the users change these settings as they want. I find different ways by browsing Internet but they did not answere all my needs.
My needs were the folowing:
* Set custom wallpaper
* Customize wallpaper screen
* Set lockscreen
* Allow users to change lockscreen
* Apply this to existing and/or new profiles


## Study

### C# code integration (wallpaper)

### Technical basis

This solution relies on the Win32 API function [SystemParametersInfo](https://docs.microsoft.com/fr-fr/windows/win32/api/winuser/nf-winuser-systemparametersinfoa) from `user32.dll`. This script must be executed in User context or ran using `ServiceUI.exe` from [Microsoft Deployment Toolkit](https://www.microsoft.com/en-us/download/details.aspx?id=54259)

### Limitations
* Must be executed in user context
* Apply only on current user


#### Code snippet

```ps1
# Define wallpaper function
function Set-Wallpaper($MyWallpaper){
    # Define C# code as string
    $code = @' 
    using System.Runtime.InteropServices; 
    namespace Win32{ 
        
        public class Wallpaper{ 
            [DllImport("user32.dll", CharSet=CharSet.Auto)] 
            static extern int SystemParametersInfo (int uAction , int uParam , string lpvParam , int fuWinIni) ; 
                
            public static void SetWallpaper(string thePath){ 
                SystemParametersInfo(20,0,thePath,3); 
            }
        }
    } 
'@
    # Import C# class
    Add-Type $code 

    # Call C# function
    [Win32.Wallpaper]::SetWallpaper($MyWallpaper)
}

## Call your function
Set-WallPaper("C:\Wallpapers\nature.jpg")
```

### Registry keys (lockscreen)

### Technical basis

We can use the following registry value to customize lockscreen:

Name:  `LockScreenImage`

Path: `HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization\LockScreenImage`

Type: `String`

Value: `<path to lockscreen image>`


### Limitations
* No limitation found yet


#### Code snippet

```ps1
$regKey = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization'
# Create the key if it doesn't already exist
if (!(Test-Path -Path $regKey)) {
   $null = New-Item -Path $regKey
}

# Now set the registry entry
Set-ItemProperty -Path $regKey -Force -Name LockScreenImage -value "C:\Custom-Folder\wallpaper.jpg"
```

### Registry keys (theme)

### Technical basis

I found that we can simply customize the default theme using the following registry values:

| Name               | Path                                                        | Type     | Value                       | 
|--------------------|-------------------------------------------------------------|----------|-----------------------------|
|`InstallTheme`      | `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes`     | `String` | `<path to theme file>`      |
|`DesktopBackground` | `HKLM\SOFTWARE\\Microsoft\Windows\CurrentVersion\Themes`    | `String` | `<path to background file>` |
|`BrandIcon`         | `HKLM\SOFTWARE\\Microsoft\Windows\CurrentVersion\Themes`    | `String` | `<path to icon file>`       |
|`ThemeName`         | `HK\SOFTWARE\LM\Microsoft\Windows\CurrentVersion\Themes`    | `String` | `<THEME NAME>`              |
|`CurrentTheme`      | `HKU\<SID>\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes`| `String` | `<path to theme file>`      |


Theme file:

Default theme path: `C:\Windows\resources\Themes\aero.theme`


```ini
; Copyright © Microsoft Corp.

[Theme]
; Windows - IDS_THEME_DISPLAYNAME_AERO
DisplayName=@%SystemRoot%\System32\themeui.dll,-2013
SetLogonBackground=0

; Computer - SHIDI_SERVER
[CLSID\{20D04FE0-3AEA-1069-A2D8-08002B30309D}\DefaultIcon]
DefaultValue=%SystemRoot%\System32\imageres.dll,-109

; UsersFiles - SHIDI_USERFILES
[CLSID\{59031A47-3F72-44A7-89C5-5595FE6B30EE}\DefaultIcon]
DefaultValue=%SystemRoot%\System32\imageres.dll,-123

; Network - SHIDI_MYNETWORK
[CLSID\{F02C1A0D-BE21-4350-88B0-7367FC96EF3C}\DefaultIcon]
DefaultValue=%SystemRoot%\System32\imageres.dll,-25

; Recycle Bin - SHIDI_RECYCLERFULL SHIDI_RECYCLER
[CLSID\{645FF040-5081-101B-9F08-00AA002F954E}\DefaultIcon]
Full=%SystemRoot%\System32\imageres.dll,-54
Empty=%SystemRoot%\System32\imageres.dll,-55

[Control Panel\Cursors]
AppStarting=%SystemRoot%\cursors\aero_working.ani
Arrow=%SystemRoot%\cursors\aero_arrow.cur
Crosshair=
Hand=%SystemRoot%\cursors\aero_link.cur
Help=%SystemRoot%\cursors\aero_helpsel.cur
IBeam=
No=%SystemRoot%\cursors\aero_unavail.cur
NWPen=%SystemRoot%\cursors\aero_pen.cur
SizeAll=%SystemRoot%\cursors\aero_move.cur
SizeNESW=%SystemRoot%\cursors\aero_nesw.cur
SizeNS=%SystemRoot%\cursors\aero_ns.cur
SizeNWSE=%SystemRoot%\cursors\aero_nwse.cur
SizeWE=%SystemRoot%\cursors\aero_ew.cur
UpArrow=%SystemRoot%\cursors\aero_up.cur
Wait=%SystemRoot%\cursors\aero_busy.ani
DefaultValue=Windows Default
DefaultValue.MUI=@main.cpl,-1020

[Control Panel\Desktop]
Wallpaper=%SystemRoot%\web\wallpaper\Windows\img0.jpg
TileWallpaper=0
WallpaperStyle=10
Pattern=

[VisualStyles]
Path=%ResourceDir%\Themes\Aero\Aero.msstyles
ColorStyle=NormalColor
Size=NormalSize
AutoColorization=0
ColorizationColor=0XC40078D7
SystemMode=Dark

[boot]
SCRNSAVE.EXE=

[MasterThemeSelector]
MTSM=RJSPBS

[Sounds]
; IDS_SCHEME_DEFAULT
SchemeName=@%SystemRoot%\System32\mmres.dll,-800
```

In order to prevent misconfiguration, I suggest to either create a new theme file from the default file or customize the default theme file.


### Limitations
* No limitation found yet


#### Code snippet

```ps1
################################# Global FUNCTIONS ################################################
###################################################################################################
# Define function to update theme file
Function Set-INIValue(){
    param(
        [Parameter(Mandatory=$true, Position=0)] 
        [ValidateNotNullOrEmpty()]
        [string]$INICOntent,

        [Parameter(Mandatory=$true, Position=1)] 
        [ValidateNotNullOrEmpty()]
        [string]$Category,

        [Parameter(Mandatory=$true, Position=2)] 
        [ValidateNotNullOrEmpty()]
        [string]$Key,

        [Parameter(Mandatory=$true, Position=3)] 
        [ValidateNotNullOrEmpty()]
        [string]$Value
    )
    If($INICOntent -match "(?m)^$Key=.*"){
        $INICOntent -Replace "(?m)^$Key=.*","$Key=$Value"
    }Else{
        $INICOntent -Replace "(?m)^\[$Category\]","[$Category]`n$Key=$Value"
    }
}

################################# Customization ####################################################
####################################################################################################

$THEME_NAME = "CORPORATE"
$THEME_FILENAME = "corporate.theme"

# Download theme or copy it from app package
New-Item "C:\Windows\Web\Wallpaper\Corporate" -ItemType Directory -Force | Out-Null
$WALLPAPER_PATH = "C:\Windows\Web\Wallpaper\Corporate\wallpaper.png"
Invoke-WebRequest -Uri "https://wallpaper-house.com/data/out/10/wallpaper2you_388644.png" -OutFile "$WALLPAPER_PATH"

#--------------------------------------------------------------------------------------------------------------#
$THEME=@{
    "Theme:DisplayName"                         =       "CORPORATE"
    "Control Panel\Desktop:Wallpaper"           =       "$WALLPAPER_PATH"
    "Control Panel\Desktop:WallpaperStyle"      =       "10"
    "VisualStyles:SystemMode"                    =      "Dark"
    "VisualStyles:ColorizationColor"            =       "0XC40078D7"
    "VisualStyles:AppMode"                      =       "Dark" 
}
# Doc: https://docs.microsoft.com/en-us/windows/win32/controls/themesfileformat-overview
#--------------------------------------------------------------------------------------------------------------#

################################# Logic ############################################################
####################################################################################################

$THEME_REGISTRY_KEY = "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes"
$THEME_FOLDER = "C:\Windows\resources\Themes"

# Copy Current theme
$currentThemePath = "$(Get-ItemPropertyValue "Registry::$THEME_REGISTRY_KEY" "InstallTheme")"
If("$currentThemePath" -ne "$THEME_FOLDER\$THEME_FILENAME"){
    Copy-Item "$currentThemePath" -Destination "$THEME_FOLDER\$THEME_FILENAME"
}

# Edit theme file

## Get file content
$themeFileContent = Get-Content -Path "$THEME_FOLDER\$THEME_FILENAME" | Out-String


## Customize theme
## Customize theme
ForEach($item in $THEME.Keys){
    $themeFileContent =  Set-INIValue "$themeFileContent" "$(($item -Split ':')[0])" "$(($item -Split ':')[1])" "$($THEME[$item])"
}


## Set file content
$themeFileContent | Out-File -FilePath  "$THEME_FOLDER\$THEME_FILENAME"

# Set as new theme
Set-ItemProperty -Path "Registry::$THEME_REGISTRY_KEY" -Name "ThemeName" -Value "$THEME_NAME"
Set-ItemProperty -Path "Registry::$THEME_REGISTRY_KEY" -Name "InstallTheme" -Value "$THEME_FOLDER\$THEME_FILENAME"

```
### Applying theme to user already logged-in (optional)

### Technical basis

In order to apply the theme to the current user, you can use the following code:

```ps1
rundll32.exe themecpl.dll,OpenThemeAction "C:\path\to\mytheme.theme"
# Source: https://stackoverflow.com/questions/546818/how-do-i-change-the-current-windows-theme-programmatically
```

This code must be run in the user context, you can use [KelvinTegelaar/RunAsUser](https://github.com/KelvinTegelaar/RunAsUser) or create your own system (this is what I choose)


#### Code snippet

```ps1
# Define function to execute code as logged-on user
Function Invoke-AsCurrentUser(){
    param(
        [Parameter(Mandatory=$true, Position=0)] 
        [ValidateNotNullOrEmpty()]
        [String]$Script
    )

    # Create random name for task
    $taskName="Invoke-AsCurrentUser-$(Get-Random -Maximum 1000)"

    # Put code in temp file
    $Script | Out-File -FilePath "C:\Users\Public\$taskName.ps1"

    # Define action
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -Command &{&('C:\Users\Public\$taskName.ps1') ; Remove-Item -Path 'C:\Users\Public\$taskName.ps1'}"
    
    # Define trigger to run the task in 1 minute
    $trigger = New-ScheduledTaskTrigger -AtLogon

    # Define targeted user
    $principal = New-ScheduledTaskPrincipal -UserId (Get-CimInstance –ClassName Win32_ComputerSystem | Select-Object -expand UserName)
    

    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries

    # Create task
    $task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings
    
    # Register task
    Register-ScheduledTask $taskName -InputObject $task

    # Start Task
    Start-ScheduledTask -TaskName $taskName

    # Launch process to remove scheduled task in 5 minutes
    Start-Process "powershell.exe" "Invoke-Command -ScriptBlock {Start-Sleep -Seconds 300;Unregister-ScheduledTask -TaskName `"$taskName`" -Confirm:`$false};" -WindowStyle Hidden
    
}


# Set new theme to current user (run in user context)
Invoke-AsCurrentUser -Script (
    
    "`$THEME_FOLDER='$THEME_FOLDER';`$THEME_FILENAME='$THEME_FILENAME';"+
    
    ({
    ## Set theme file using themecpl.dll 'OpenThemeAction' function (https://windows10dll.nirsoft.net/themecpl_dll.html)
    rundll32.exe themecpl.dll,OpenThemeAction "$THEME_FOLDER\$THEME_FILENAME"

    ## Wait for process to start
    $loop=0
    While("$(Get-Process SystemSettings -ErrorAction SilentlyContinue)" -eq ""){
        Start-Sleep -Milliseconds  100
        $loop=+1
        If($loop -ge 10){
            Continue
        }
    }
    Start-Sleep -Seconds 1
    ## Close process
    $loop=0
    While("$(Get-Process SystemSettings -ErrorAction SilentlyContinue)" -ne ""){
        Start-Sleep -Milliseconds  100
        $loop=+1
        If($loop -ge 10){
            Continue
        }
        Get-Process SystemSettings -ErrorAction SilentlyContinue | Stop-Process -force
    }
}).toString())
```

## Final solution

Full code [here](/posts/windows-default-theme/code/Set-Theme.ps1) (lockscreen left as default)

![Result](/posts/windows-default-theme/result.png)


## Sources / usefull resources
* https://docs.microsoft.com/en-us/answers/questions/619056/powershell-to-set-second-monitor-wallpaper.html
* https://stackoverflow.com/questions/69776800/how-to-set-lock-screen-photo-using-powershell
* https://stackoverflow.com/questions/546818/how-do-i-change-the-current-windows-theme-programmatically
* https://windows10dll.nirsoft.net/themecpl_dll.html