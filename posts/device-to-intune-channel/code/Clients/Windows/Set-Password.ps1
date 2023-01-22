#Requires -RunAsAdministrator

param (
    [switch]$Debug
)

# Generate password
$GeneratedPassword = (-join ((65..90) + (97..122) | Get-Random -Count 16 | % {[char]$_}))

# Load certficate
$ClientCertificate = Get-ChildItem -Path "Cert:\LocalMachine\My\" | Where-Object {$_.Subject -like "*Microsoft Intune MDM Device CA*"}

# Send request
$Url = "<AZURE-FUNCTION_URL>"

$Body = @{
    Password = $GeneratedPassword
} | ConvertTo-Json

Try {

    $response = (Invoke-RestMethod -Method 'POST' -Uri $Url -Body $Body -ContentType 'application/json' -Certificate $ClientCertificate)
} Catch {

    "Error for $Url"
    "Body:`n$Body"
    "StatusCode: $($_.Exception.Response.StatusCode.value__ )"
    "StatusDescription: $($_.Exception.Response.StatusDescription)"
}

# Check if password sent by AZF is the same as the one generated
If ( $response.password -eq $GeneratedPassword){

    ## Set password using manufacturer tools/API/WMI (examples at : https://woshub.com/powershell-view-change-bios-settings/)
    ## Use the same code from Get-Password.ps1 to retrieve old password

    "Password set for $($response.device)"

    If($Debug){
        "Problem sending generated password (password was not set)"
        "Generated password : $GeneratedPassword"
    }
} Else {
    "Problem sending generated password, remote password does not match genrated password (password was not set)"
}
