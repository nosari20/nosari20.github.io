#Requires -RunAsAdministrator


# Load certficate
$ClientCertificate = Get-ChildItem -Path "Cert:\LocalMachine\My\" | Where-Object {$_.Subject -like "*Microsoft Intune MDM Device CA*"}

# Send request
$Url = "<AZURE-FUNCTION_URL>"

Try {
    $response = (Invoke-RestMethod -Method 'GET' -Uri $Url -ContentType 'application/json' -Certificate $ClientCertificate)
    $response.password
} Catch {
    "Error for $Url"
    "Body:`n$Body"
    "StatusCode: $($_.Exception.Response.StatusCode.value__ )"
    "StatusDescription: $($_.Exception.Response.StatusDescription)"
}