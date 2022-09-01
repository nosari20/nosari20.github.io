---
title: "Get Intune data in PowerBI"
date: 2022-08-31
draft: false
tags: ["device-management", "dev-scripting", "misc"]
summary:  "How to get Intune data from PowerBI report?"
image: "/posts/intune-powerbi/_header.png"
---

## Content
* Use Intune data whareouse
* Use Graph API (advanced)
* Sources / usefull resources


## Use Intune data whareouse
1. In Microsoft Endpoint Manager portal go to `Reports > Intune data warehouse > Data warehouse` and copy the OData feed URL

![Intune OData feed URL](/posts/intune-powerbi/intune-odata-feed.png)

2. In PowerBi create a new OData data source

![Create a new OData data source](/posts/intune-powerbi/create-odata-feed.png)

3. Paste OData feed URL

![Paste OData feed URL](/posts/intune-powerbi/paste-odata-feed.png)

4. Choose `Organizational account` as authentication method

![Choos authentication method](/posts/intune-powerbi/auth-organizational-account.png)

5. Select desired tables then click `Load`

![Select tables](/posts/intune-powerbi/choose-tables.png)


## Use Graph API (advanced)

### Why using Graph API?

Intune data whareouse has limited set of available data table. For example you cannot filter devices by group membership. Using Graph API can resolve this limitation but we cannot browse the whole database with Graph API so it will be difficult to create relationship between results.

### Prerequisites
* Create app registration in Azure

### Custom query using PowerQuery M language

1. Create a blank query

![Create blank query](/posts/intune-powerbi/select-blank-query.png)

2. Open advanced editor for the created query

![Open advanced editor](/posts/intune-powerbi/open-advanced-editor.png)

3. Use the following code
```c++
let
    // Step 1: Get OAuth token
    token_uri = "https://login.windows.net/" & #"Directory ID" & "/oauth2/token",
    resource="https://graph.microsoft.com",
    tokenResponse = Json.Document(Web.Contents(token_uri,
    [
        Content = Text.ToBinary(Uri.BuildQueryString(
            [
                client_id = #"Client ID", //managed parameter
                resource = resource,
                grant_type = "client_credentials", //managed parameter
                client_secret = #"Client Secret" //managed parameter
            ]
        )),
        Headers = [Accept = "application/json"], ManualStatusHandling = {400}
    ])),
    access_token = tokenResponse[access_token],
    bearer = "Bearer " & access_token,


    // Step 2: Perform http request and covert the result to JSON
    GetJson = Json.Document(Web.Contents("https://graph.microsoft.com/beta/users?", [Headers=[Accept="application/json", Authorization=bearer]])),
        
    // Step 3: Convert JSON to table ()
    Result = Table.FromRecords(GetJson[value])
in
    Result
```
4. Create managed parameters for ``Directory ID``, ``Client ID`` and ``Client Secret``

![Create new parameter - step 1](/posts/intune-powerbi/create-new-parameter-1.png)

![Create new parameter - step 2](/posts/intune-powerbi/create-new-parameter-2.png)

5. Edit permissions and privacy for each data source

![Edit permission and privacy](/posts/intune-powerbi/permissions.png)

6. Click on `Refresh Preview` et voilà!

![Result](/posts/intune-powerbi/results.png)


### //TODO
* Find a way to create relations
* Dynamic queries based on filters


## Sources / usefull resources

* https://minkus.medium.com/easily-connecting-between-power-query-power-bi-and-microsoft-graph-72333eb95a35
* https://docs.microsoft.com/en-us/graph/auth-register-app-v2
* https://docs.microsoft.com/en-us/graph/auth-v2-service
* https://docs.microsoft.com/en-us/powerquery-m/json-document
* https://docs.microsoft.com/en-us/powerquery-m/web-contents


