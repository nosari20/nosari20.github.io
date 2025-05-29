#Requires -RunAsAdministrator

# Load certficate
$ClientCertificate = Get-ChildItem -Path "Cert:\LocalMachine\My\" | Where-Object {$_.Subject -like "*Microsoft Intune MDM Device CA*"}

# Send request
$Url = "<AZURE-FUNCTION_URL>"

$Body = @{
            # Send Azure AD status to device 'notes' field
    Note = "$(dsregcmd /status | select -First 10)"
} | ConvertTo-Json

Try {
    # Perform request
    $response = (Invoke-RestMethod -Method 'POST' -Uri "$Url?Action=set" -Body $Body -ContentType 'application/json' -Certificate $ClientCertificate)
} Catch {

    "Error for $Url"
    "Body:`n$Body"
    "Body:`n$($_.Exception.Response.Body)"
    "StatusCode: $($_.Exception.Response.StatusCode.value__ )"
    "StatusDescription: $($_.Exception.Response.StatusDescription)"
}