---
title: "Device to Intune secure channel using Azure Function"
date: 2023-01-09
lastmod: 2023-01-09
draft: true
tags: ["device-management", "windows", ""]
summary:  "Create a secure channel for Windows, macOS and Linux script to perform actions and store data to Intune using Azure Functions"
image: "/posts/device-to-intune-channel/_header.png"
ogimage: "/posts/device-to-intune-channel/_og.png"
---


## Content
* Purpose and reflexion
* Technical architecture
* Azure Function code
* Client scripts
* Sources / usefull resources

## Purpose and reflexion

One day, I had to find a solution to manage BIOS password for Windows device with the following needs:
- The password must be unique per device
- The password updated periodically
- The password must be available for support team
- The password must be randomly genarated


To achieve this, I had to find a solution to create generate a password from Intune and pass it to devices or to generate it from devices and pass it to Intune.

As Intune does not support script arguments and custome attribute unlike some other mdm solutions (e.g. on Ivanti Neurons for MDM you can pass and retrieve data from a macOS script) I had to find another way. 


## Technical architecture

I designed a simple method which use Azure Functions and certificate authentication which can be described with the following diagram:

![Secure channel](/posts/device-to-intune-channel/device-to-intune-channel.drawio.png)

With this system, Graph API credentials are never exposed and clients are limited by features exposed through the Azure Function and no one can impersonate devices because device are authenticated with certificate.

## Azure Function code

I created my Azure Function using the procedure povided in MS documentation [Quickstart: Create a PowerShell function in Azure using Visual Studio Code](https://learn.microsoft.com/en-us/azure/azure-functions/create-first-function-vs-code-powershell)


Certificate-based authentication must be set to required to make the process secure but the function code must include certificate verification as it is not handled automatically. In the following example I will use the certificat provided by Intune (signed by ``Microsoft Intune MDM Device CA``) which contains the Intune device id.

// TODO


The file ``function.json`` looks like the following

```json
{
  "bindings": [
    {
      "authLevel": "function",
      "type": "httpTrigger",
      "direction": "in",
      "name": "Request",
      "methods": [
        "get",
        "post"
      ]
    },
    {
      "type": "http",
      "direction": "out",
      "name": "Response"
    }
  ]
}
```

The file ``run.ps1`` which is the main code is the following:

```ps1
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
```

## Client scripts

In order to authenticate, client scripts will use a certificate provided by Intune (signed by ``Microsoft Intune MDM Device CA``)


### Windows

#### Set password

```ps1
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
    "Password set for $($response.device)"

    If($Debug){
        "Problem sending generated password (password was not set)"
        "Generated password : $GeneratedPassword"
    }
}
```

#### Get password

```ps1
#Requires -RunAsAdministrator

param (
    [switch]$Debug
)

# Load certficate
$ClientCertificate = Get-ChildItem -Path "Cert:\LocalMachine\My\" | Where-Object {$_.Subject -like "*Microsoft Intune MDM Device CA*"}

# Send request
$Url = "<AZURE-FUNCTION_URL>"

Try {
    $response = (Invoke-RestMethod -Method 'GET' -Uri $Url -ContentType 'application/json' -Certificate $ClientCertificate)
} Catch {
    "Error for $Url"
    "Body:`n$Body"
    "StatusCode: $($_.Exception.Response.StatusCode.value__ )"
    "StatusDescription: $($_.Exception.Response.StatusDescription)"
}

$response.password
```

### Linux

#### Set password

```sh
#TODO
```

#### Get password

```sh
#TODO
```

### macOS

#### Set password

```sh
#TODO
```

#### Get password

```sh
#TODO
```

## Sources / usefull resources
* https://developer.android.com/studio/command-line/logcat
* https://source.android.com/docs/setup/contribute/read-bug-reports