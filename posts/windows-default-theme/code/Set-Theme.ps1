
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
    $principal = New-ScheduledTaskPrincipal -UserId (Get-CimInstance -ClassName Win32_ComputerSystem | Select-Object -expand UserName)
    

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


################################# Global CONSTANTS #################################################
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
ForEach($item in $THEME.Keys){
    $themeFileContent =  Set-INIValue "$themeFileContent" "$(($item -Split ':')[0])" "$(($item -Split ':')[1])" "$($THEME[$item])"
}

 

## Set file content
$themeFileContent | Out-File -FilePath  "$THEME_FOLDER\$THEME_FILENAME"

# Set as new theme
Set-ItemProperty -Path "Registry::$THEME_REGISTRY_KEY" -Name "ThemeName" -Value "$THEME_NAME"
Set-ItemProperty -Path "Registry::$THEME_REGISTRY_KEY" -Name "InstallTheme" -Value "$THEME_FOLDER\$THEME_FILENAME"



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