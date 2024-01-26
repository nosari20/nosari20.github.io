Using namespace System.Net

# Input bindings are passed in via param block.
Param($Request, $TriggerMetadata)


    
$ApplicationID = "<APPID>"
$TenantID = "<TENANTID>"
$AccessSecret = "<SECRET>"

# Function to check certificate
Function Test-Certificate() {
    $ClientCertificateBase64 = $Request.Headers."X-ARR-ClientCert"

    # Check if certificate is provided
    If (-not $ClientCertificateBase64) {
    
        Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
            StatusCode = [HttpStatusCode]::BadRequest
            Body = "{'status':'error','error':'Certificate not provided in request.'}"
        })
        exit

    } Else{

        # If provided, check trust

        # Convert certificate to object
        $ClientCertificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]([System.Convert]::FromBase64String($ClientCertificateBase64))

        # Create custom chain object to trust only one authority
        $Chain = [System.Security.Cryptography.X509Certificates.X509Chain]::Create()

        ## Do no check if certficate is revoked
        $Chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck

        ## Use custom trust store
        $Chain.ChainPolicy.TrustMode = [System.Security.Cryptography.X509Certificates.X509ChainTrustMode]::CustomRootTrust

        ## Add CAs to custom trust store
        $ca="<BASE64CACERT>" # Without 'begin cert' and 'end cert'
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

# Function to authenticate and retrieve Graph API OAuth token
Function Get-GraphAPIToken() {

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
            Body = "{'status':'error','error':'Internal server error while getting token.'}"
        })
        exit
    }

    return $ConnectGraph.access_token
}



# Function to get user id using Graph API
Function Get-UserID($UPN) {

    $Bearer = Get-GraphAPIToken

    # Get data
    $Url = "https://graph.microsoft.com/v1.0/users/$UPN"
    Try {
        
        $UserData = (Invoke-RestMethod -Method 'GET' -Headers @{Authorization = "Bearer $($Bearer)"} -Uri $Url)
        
    } Catch {
        Write-Host "Error for $Url"
        Write-Host "StatusCode: $($_.Exception.Response.StatusCode.value__ )"
        Write-Host "StatusDescription: $($_.Exception.Response.StatusDescription)"
        exit
        Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
            StatusCode = [HttpStatusCode]::InternalServerError
            Body = "{'status':'error','error':'Internal server error while getting picture metadata.'}"
        })
        exit
    }  

    $UserData.id
    
}

# Function to get profile picture metadata using Graph API
Function Get-PictureMetadata($id) {

    $Bearer = Get-GraphAPIToken


    # Get Metadata
    $Url = "https://graph.microsoft.com/v1.0/users/$id/photo/"
    Try {
        
        $PictureMetadataRequest = (Invoke-RestMethod -Method 'GET' -Headers @{Authorization = "Bearer $($Bearer)"} -Uri $Url)
        
    } Catch {
        Write-Host "Error for $Url"
        Write-Host "StatusCode: $($_.Exception.Response.StatusCode.value__ )"
        Write-Host "StatusDescription: $($_.Exception.Response.StatusDescription)"
        exit
        Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
            StatusCode = [HttpStatusCode]::InternalServerError
            Body = "{'status':'error','error':'Internal server error while getting picture metadata.'}"
        })
        exit
    }  


    $PictureMetadataRequest
    
}

# Function to get profile picture data using Graph API
Function Get-Picture($id) {
   
    $Bearer = Get-GraphAPIToken
    
    # Get file
    $Url = "https://graph.microsoft.com/v1.0/users/$id/photo/`$value"
    Try {
        
        $PictureFileRequest = (Invoke-WebRequest  -Method 'GET' -Headers @{Authorization = "Bearer $($Bearer)"} -Uri $Url)
        
    } Catch {
        Write-Host "Error for $Url"
        Write-Host "StatusCode: $($_.Exception.Response.StatusCode.value__ )"
        Write-Host "StatusDescription: $($_.Exception.Response.StatusDescription)"
        
        Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
            StatusCode = [HttpStatusCode]::InternalServerError
            Body = "{'status':'error','error':'Internal server error while getting picture.'}"
        })
        exit
    }  

    $PictureFileRequest.Content  
}

# Test client certificate
#Test-Certificate


# Handle incomming requests
If($Request.Method  -eq "GET") {

    # Retrieve UPN
    $UserUPN = $Request.Query.UPN

    If(-not $UserUPN){
        Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
            StatusCode = [HttpStatusCode]::InternalServerError
            Body = "{'status':'error','error':'UPN not provided.'}"
        })
        exit
    }


    ################ Retrieve picture using Graph API  ###########################
    # Add Azure AD satus to note
    $Id = Get-UserID($UserUPN)
    $Metadata = Get-PictureMetadata($Id)
    $File = Get-Picture($Id)
    #######################################################################################

    # Associate values to output bindings by calling 'Push-OutputBinding'.
    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body = [byte[]] $File
        ContentType = $Metadata."@odata.mediaContentType"
        Headers = @{
            'Content-Disposition' = 'attachment; filename="profile.jpeg"'
        }
    })
    exit
}


# Unknown method / request
Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
    StatusCode = [HttpStatusCode]::MethodNotAllowed
})