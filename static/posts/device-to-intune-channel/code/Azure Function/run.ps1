Using namespace System.Net

# Input bindings are passed in via param block.
Param($Request, $TriggerMetadata)

# Function to check certificate
Function Check-Certificate() {
    $ClientCertificateBase64 = $Request.Headers."X-ARR-ClientCert"

    # Check if certificate is provided
    If (-not $ClientCertificateBase64) {
    
        Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
            StatusCode = [HttpStatusCode]::BadRequest
            Body = "{'status':'error','error':'Certificate not provided in request.'}"
        })

    } Else{

        # If provided, check trust

        # Convert certificate to object
        $ClientCertificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]([System.Convert]::FromBase64String($ClientCertificateBase64))

        # Declare CA and sub-CA
        ## Microsoft Intune Root Certification Authority
        $ca="MIIFaTCCA1GgAwIBAgIQWhvaqZFB9KVNpmVRc71GWjANBgkqhkiG9w0BAQsFADA4 MTYwNAYDVQQDEy1NaWNyb3NvZnQgSW50dW5lIFJvb3QgQ2VydGlmaWNhdGlvbiBB dXRob3JpdHkwHhcNMjEwODEyMDAwMDAwWhcNMjYwODEyMDAwMDAwWjA4MTYwNAYD VQQDEy1NaWNyb3NvZnQgSW50dW5lIFJvb3QgQ2VydGlmaWNhdGlvbiBBdXRob3Jp dHkwggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQDQL63MwZDlW02yCipf dAUGn5Q8sSIc6zjdTkdCRh2SZGVFVLCgFr/EULGw3q7xaOS/mTA2I+koZM+95JvE xfsIy+S7I7rLQjYNuJZVXl0s1xj4hfewF1jk8nWjdEwYfZkbZ+/6pYTOtHg/U3tV seT63tg6Vc94dkUpOmN4tlyuie2qbMbc1VmAyyITcoIFtRspdE9qW1NnwgzGJz/Q KaL2H7LtGyNGwXhH4jSwZa8ZNcwKjJ7wdaG2SNxOgrZsCHv272vugNiGEy4yYwGU CyGOAksOaHEobW87Y92s/q4/5beBa979ZCeH4VSpRo2LcQFH9ZM9r05VpFimg8Pu pcOl2g1WcuBj1MBBjT/YPaVgbZUp9wvqqefhW6m/JGTYaPJ4YrnMnrzem6kwGP5K 3xwHWL/5ANTjWDx6+b7dZ5f1AKf2DQFaxslMk4CqTElABI8Te1QzTG/QOmSzewtV cwcWGo4F7yJyBbnYcqvN5XJWURFjecuoTvyxPG3R2ljfTKSyJhrTkP0hw3Zxr3cn pY0ZtK80mKE0A9pFG597Qy3q/9TJNRtDjeQrr7DCPwQ8cvfeyT568J+hUyAeN7PV hOV/OXkWXZND9bbkYKNE4ebfiNTGCeJX9iIGjZfbzz86eDqEVpgHcJstnWN6VWbR qkrK/p6m5fqYNZCMAN+g4OyHZQIDAQABo28wbTAdBgNVHQ4EFgQUK0nOsQclTJ3m CpPzkLkw9+ZEn5IwDgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQEw FgYDVR0lAQH/BAwwCgYIKwYBBQUHAwIwEAYJKwYBBAGCNxUBBAMCAQAwDQYJKoZI hvcNAQELBQADggIBAGrkO1h+8wKHJHCMf/jRz5DhvigyDOyohx2LlbhL/i/0uSka /u/m9uhi0UXXYX9Y15tpRUjZDqtQAjpnFePNcxe3/RRp5kuqVHaMyOHShjTTJ6YD hKhlZP37qSBuWv+x2RsUrPzVdpFyljJWyJ1yruBJqgJ2sq3lskb8cO94fhcc2StT uO9aB+0YY2ce5OHtOgj39Enx+PRCpweIodhAKdZuTVAX1M4qeBJD87Gg/7b4VfaS aM6Frzrh9VuylCM258Xx1CYGgzTYJCcvCYOHA74nS3XigalsKonbdVHUEac+4D7i P33JSlV1wlxYPPJqayiBam21YtSHmdJKV3pwkFbvlX2+pNioX86E48YaNz4faq3v Cl4xHqMfVfOOG8QLiOnNlHsBKsffD420CKi2SJaKETPJnOLG61265jiT4Yr1mUeW G+tQTquFeFdTTSGfToyXE58IMLhI19hQtf/2HU9aZK/vJsjWPYKCucPCXwQZA2Kk Z/RT8HsSPPet3GyP3gL0nzfacohJ7RKwClE82exXgiGK/UAFqvEL9pwbLJtX4Hx/ +OhT4zQ9CSppKjSBDIRR8gV6G2HY5gWKXq9K+/Dv+m1APPWsR1kTsqy+tAQPRxlK 7bDsXt5GawcCP+FM0vJwd5O+ZPB3x5VLG5OLv48cCRUxf1alMQSfsJz/r2L4"
        ## Microsoft Intune MDM Device CA
        $subca="MIIEfTCCAmWgAwIBAgIQI7X6IR1qWadNFd0MPsJsLjANBgkqhkiG9w0BAQsFADA4 MTYwNAYDVQQDEy1NaWNyb3NvZnQgSW50dW5lIFJvb3QgQ2VydGlmaWNhdGlvbiBB dXRob3JpdHkwHhcNMjEwODEyMDAwMDAwWhcNMjQwODEyMDAwMDAwWjApMScwJQYD VQQDEx5NaWNyb3NvZnQgSW50dW5lIE1ETSBEZXZpY2UgQ0EwggEiMA0GCSqGSIb3 DQEBAQUAA4IBDwAwggEKAoIBAQDR82LMD3kKPMoBlLcYWUdsklJfCVnvSos1pCNq UVWBxIgOIXd8ypG7XY1YUE44GjDqPBShdQWJmNDGIfqfLWo0grnajWQMefXEa+CA pKD/GvozAIHfYETgwi+YMx3EyNWupfXY4nf/fz2T4xldHuu9iZw4Ty2+Rz1Vg22Y EYbCXShyOqsFG7rHANPs9XkjXWpcWhnNiRAkq999YuIC0aKkD9UmaTcsd055cmOt 0NkAehfCJiB1t9pqdTceqKRx4VxySSQG/pWwTOL2A9V/eRrx5hZaMDZk3kVcPU/o HluY1xzWCY9PiPuX54WDlFFm4B7zklRifPw0GvP1YX92s2h1AgMBAAGjgZEwgY4w HQYDVR0OBBYEFGdrgkv3vEOqV0qZz17a0+8EUuuVMB8GA1UdIwQYMBaAFCtJzrEH JUyd5gqT85C5MPfmRJ+SMBAGCSsGAQQBgjcVAQQDAgEAMA4GA1UdDwEB/wQEAwIB hjAWBgNVHSUBAf8EDDAKBggrBgEFBQcDAjASBgNVHRMBAf8ECDAGAQH/AgEAMA0G CSqGSIb3DQEBCwUAA4ICAQDOd1wgRJfrtiE4ApbiQKcOSVAK5my9EgWuAEhOzpFG hCyhMpGwm8ZTz6+qhlVmACH9h8AM9mmtw3X/BMHKZNL6C/j8XlE3DQPbP0zJUiLU nAzgjYtGxTy9VxWf4LszVOO6jBCUs3ztri22gkEYnDguVchE+6xP3uQ5jLLjYCMi czT9UiSByKD+IRgTlapF0bDK8FufNX5s2h9aNR8S39kAGQin1cWQmHmu/173QYBG uS+XyuJl/2X9YiQDuPaUNDWrZ3kcwHQLsVF+z8up2PfYUGN+KB1FkzlxyLkpG5X7 oebsY0mc4W69aRdYw6D0GnttbJZvjFhMAjyaZtwJVmCBogM7b7oV6ZtrHEBrUxEc MPQWbiBPCNl6bE8PsKVVoiKmIgje80Wm5bwWw7XCUIFyI/feyzTRZEOf8MQSmpB9 CfvISw0Y5REKGsvgmu06eII1jA78HH6fXOs+L/4+zVxEdjsTryE3iESLkEQ4Do4U p9iDQr+k/5Tcell2GLjXw6EeClkBG64+97gT5PfIXsssKgrsGwkry67tkWriu90Q on84T3uTgK3AqO8wvqaEIbILHsiHDFjsiNntmr0dPMZMXS+pNVyu4FgaREjNlEGl MUgUWBmoM420smDzVzLD48qBJ7hr8suL5vXQL0VSkxJes2G8Cl45d5EgCkJonvkf ZQ=="


        # Create custom chain object to trust only one authority
        $Chain = [System.Security.Cryptography.X509Certificates.X509Chain]::Create()

        ## Do no check if certficate is revoked
        $Chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck

        ## Use custom trust store
        $Chain.ChainPolicy.TrustMode = [System.Security.Cryptography.X509Certificates.X509ChainTrustMode]::CustomRootTrust

        ## Add 'Microsoft Intune MDM Device CA' and 'Microsoft Intune Root Certification Authority' to custom trust store
        $Chain.ChainPolicy.CustomTrustStore.Add([System.Security.Cryptography.X509Certificates.X509Certificate2]([System.Convert]::FromBase64String($subca)))  | Out-Null
        $Chain.ChainPolicy.CustomTrustStore.Add([System.Security.Cryptography.X509Certificates.X509Certificate2]([System.Convert]::FromBase64String($ca)))  | Out-Null

        ## build chain : return true if valid trust chain
        If (-not $Chain.build($ClientCertificate)) {
    
            Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
                StatusCode = [HttpStatusCode]::BadRequest
                Body = "{'status':'error','error':'Certificate not valid ($($Chain.ChainStatus.StatusInformation)).'}"
            })

        } Else {
            $ClientCertificate
        }
    }

}
# Function to extract DeviceId from certificate
Function Read-DeviceId() {
        
    # Convert certificate to object
    $ClientCertificate = Check-Certificate

    # Extract Common Name
    $AzDeviceId = ($ClientCertificate.Subject -replace "([a-z]*=)" -split ",")[0]

    $AzDeviceId   
    
}

# Function to set note using Graph API
Function Set-Note($IntuneDeviceID,$Note) {
    $Bearer = Get-GraphAPIToken

    # Search for device in Intune
    $Body = @{    
        notes = "$Note"
    } | ConvertTo-Json

    $Url = "https://graph.microsoft.com/beta/deviceManagement/managedDevices('$DeviceId')"
    Try {
        
        $NoteEditRequest = (Invoke-RestMethod -Method 'PATCH' -Headers @{Authorization = "Bearer $($Bearer)"} -Uri $Url -Body $Body  -ContentType 'application/json')
        
    } Catch {
        Write-Host "Error for $Url"
        Write-Host "Body:`n$Body"
        Write-Host "StatusCode: $($_.Exception.Response.StatusCode.value__ )"
        Write-Host "StatusDescription: $($_.Exception.Response.StatusDescription)"
        Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
            StatusCode = [HttpStatusCode]::InternalServerError
            Body = "{'status':'error','error':'Internal server error.'}"
        })
        exit
    }   
    $NoteEditRequest      
}

# Function to authenticate and retrieve Graph API OAuth token
Function Get-GraphAPIToken() {
    
    $ApplicationID = "<APP_ID>"
    $TenantID = "<TENANT_ID>"
    $AccessSecret = "<SECRET>"


    $Body = @{    
        Grant_Type    = "client_credentials"
        Scope         = "https://graph.microsoft.com/.default"
        client_Id     = $ApplicationID
        Client_Secret = $AccessSecret
    } 

    Try {
        $ConnectGraph = Invoke-RestMethod -Uri "https://login.microsoftonline.com/$TenantID/oauth2/v2.0/token" `
        -Method POST -Body $Body
    } Catch {
        Write-Host "Error for $Url"
        Write-Host "Body:`n$Body"
        Write-Host "StatusCode: $($_.Exception.Response.StatusCode.value__ )"
        Write-Host "StatusDescription: $($_.Exception.Response.StatusDescription)"
    }


    If(-not $ConnectGraph.access_token){
        Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
            StatusCode = [HttpStatusCode]::InternalServerError
            Body = "{'status':'error','error':'Internal server error.'}"
        })
        exit
    }

    return $ConnectGraph.access_token
}


# Handle incomming requests
If($Request.Method  -eq "POST" -and $Request.Query.Action -eq "set") {

    # Retrieve DeviceId
    $DeviceId = Read-DeviceId

    ################ Perform actions on Intune using Graph API  ###########################
    # Add Azure AD satus to note
    $response = Set-Note $DeviceId "$($Request.Body.Note)"
    #######################################################################################

    # Associate values to output bindings by calling 'Push-OutputBinding'.
    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body = $response
    })
    exit
}


# Unknown method / request
Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
    StatusCode = [HttpStatusCode]::MethodNotAllowed
    Body = $body
})