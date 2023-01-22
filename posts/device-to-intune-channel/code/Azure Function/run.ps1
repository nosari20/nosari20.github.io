Using namespace System.Net

# Input bindings are passed in via param block.
Param($Request, $TriggerMetadata)


# Function to authenticate and retrieve OAuth API token
Function Get-GraphAPIToken() {
    
    $ApplicationID = "<APP_ID>"
    $TenantID = "<TENANT_ID"
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

    return $ConnectGraph.access_token
}

# Check if client certificte is provided
$ClientCertificateBase64 = $Request.Headers."X-ARR-ClientCert"
If (-not $ClientCertificateBase64) {
   
   Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::BadRequest
        Body = "{'status':'error','error':'Certificate not provided in request.'}"
    })
} Else{

    # Convert certificate to object
    $ClientCertificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]([System.Convert]::FromBase64String($ClientCertificateBase64))

    # Extract Common Name
    $DeviceName = ($ClientCertificate.Subject -replace "([a-z]*=)" -split ",")[0]

    # Check certificate authenticity
    # //TODO 
}

If($Request.Method  -eq "POST") {

    # Check presence of password in request body
    $Password = $Request.Body.Password
    If (-not $Password) {
        $body = "{'status':'error','error':'Password not present in request.'}"
        Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
            StatusCode = [HttpStatusCode]::BadRequest
            Body = $body
        })
    }

    # Process request if everything is good
    If ($Password){

        # Get Graph API Token
        $Bearer = Get-GraphAPIToken

        If (-not $Bearer) {
            $Body = "{'status':'error','error':'Internal server error.'}"
            Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
                StatusCode = [HttpStatusCode]::InternalServerError
                Body = $body
            })
        } Else {
            
            # Search for device in Intune
            $Url = "https://graph.microsoft.com/beta/deviceManagement/managedDevices?`$filter=(azureADDeviceId eq '$DeviceName')"

            $DeviceSearchRequest = (Invoke-RestMethod -Method 'GET' -Headers @{Authorization = "Bearer $($Bearer)"} -Uri $Url).value

            If ( -not $DeviceSearchRequest[0]) {
                $body ="{'status':'error','error':'Device not found.'}"
                Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
                    StatusCode = [HttpStatusCode]::NotFound
                    Body = $body
                })
            } Else {
                $DeviceId = $DeviceSearchRequest[0].id
                $DeviceName = $DeviceSearchRequest[0].deviceName

                # Add password to notes
                $Body = @{    
                    notes = "BIOS Password = <$Password>"
                } | ConvertTo-Json
                $Url = "https://graph.microsoft.com/beta/deviceManagement/managedDevices('$DeviceId')"
                Try {
                    
                    $NoteEditRequest = (Invoke-RestMethod -Method 'PATCH' -Headers @{Authorization = "Bearer $($Bearer)"} -Uri $Url -Body $Body  -ContentType 'application/json')
                    
                    $body =  "{'status':'success','password':'$Password','device':'$DeviceName'}"
                } Catch {
                    Write-Host "Error for $Url"
                    Write-Host "Body:`n$Body"
                    Write-Host "StatusCode: $($_.Exception.Response.StatusCode.value__ )"
                    Write-Host "StatusDescription: $($_.Exception.Response.StatusDescription)"
                    $body =  "{'status':'error','error':'Internal server error.'}"
                    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
                        StatusCode = [HttpStatusCode]::InternalServerError
                        Body = $body
                    })
                }         
            }
        }
    }

    # Associate values to output bindings by calling 'Push-OutputBinding'.
    Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
        StatusCode = [HttpStatusCode]::OK
        Body = $body
    })
}

If($Request.Method  -eq "GET") {

     # Get Graph API Token
    $Bearer = Get-GraphAPIToken

    If (-not $Bearer) {
        
      Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
          StatusCode = [HttpStatusCode]::InternalServerError
          Body = "{'status':'error','error':'Internal server error.'}"
      })
    } Else {
        
      # Search for device in Intune
      $Url = "https://graph.microsoft.com/beta/deviceManagement/managedDevices?`$filter=(azureADDeviceId eq '$DeviceName')"
      $DeviceSearchRequest = (Invoke-RestMethod -Method 'GET' -Headers @{Authorization = "Bearer $($Bearer)"} -Uri $Url).value

      # Check if device is found
      If ( -not $DeviceSearchRequest[0]) {
          $body ="{'status':'error','error':'Device not found.'}"
          Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
              StatusCode = [HttpStatusCode]::NotFound
              Body = $body
          })
      } Else {
          $DeviceId = $DeviceSearchRequest[0].id
          $DeviceName = $DeviceSearchRequest[0].deviceName

          # Retrieve notes
          $Url = "https://graph.microsoft.com/beta/deviceManagement/managedDevices('$DeviceId')?`$select=notes"
          Try {
              
              $NoteRequest = (Invoke-RestMethod -Method 'GET' -Headers @{Authorization = "Bearer $($Bearer)"} -Uri $Url)
              $Password = [regex]::match($NoteRequest.notes,'BIOS Password = <([^>]+)>').Groups[1].Value
              Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
                  StatusCode = [HttpStatusCode]::OK
                  Body = "{'status':'success','password':'$Password','device':'$DeviceName'}"
              })
              exit

          } Catch {
              Write-Host "Error for $Url"
              Write-Host "Body:`n$NoteRequest"
              Write-Host "StatusCode: $($_.Exception.Response.StatusCode.value__ )"
              Write-Host "StatusDescription: $($_.Exception.Response.StatusDescription)"
              Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
                  StatusCode = [HttpStatusCode]::InternalServerError
                  Body = "{'status':'error','error':'Internal server error.'}"
              })
          }        
      }
    }    
}

# Unknown method
Push-OutputBinding -Name Response -Value ([HttpResponseContext]@{
    StatusCode = [HttpStatusCode]::MethodNotAllowed
    Body = $body
})