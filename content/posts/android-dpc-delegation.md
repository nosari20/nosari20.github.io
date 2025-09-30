---
title: "Leverage Android Enterprise delegation scopes"
date: 2025-05-29
lastmod: 2025-05-29
draft: false
tags: ["device-management", "android"]
summary:  "Use Android Enterprise delegation scopes to add new capabilities to your apps."
image: "/posts/android-dpc-delegation/_header.png"
ogimage: "/posts/android-dpc-delegation/_og.png"
githubissueID: "9" 
---

## Content
* Delegation scopes
* Examples
* Sources / usefull resources

## Delegation scopes

Android Enterprise delegation scopes define specific permissions that a Device Policy Pontroller (DPC) can delegate to other apps. These scopes allow other apps to perform defined management tasks such as certificate installation or app management without having full device admin privileges. Here are the available delegation scopes:
* [`DELEGATION_APP_RESTRICTIONS`](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#DELEGATION_APP_RESTRICTIONS)\
→ allows app to get and set application restrictions (DPC is still able to set app restrictions).
* [`DELEGATION_BLOCK_UNINSTALL`](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#DELEGATION_BLOCK_UNINSTALL)\
→ allows app prevent uninstallation of specified apps.
* [`DELEGATION_CERT_INSTALL`](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#DELEGATION_CERT_INSTALL) \
→ allows app to list and install CA certificates and authentication certificates.
* [`DELEGATION_CERT_SELECTION`](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#DELEGATION_CERT_SELECTION)\
→  allows to choose authentication certificate requested by and app on behalf of the user through a broadcast receiver and also grant usage of an authentication certiciate to app.
* [`DELEGATION_ENABLE_SYSTEM_APP`](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#DELEGATION_ENABLE_SYSTEM_APP)\
→  allows app to enable system apps.
* [`DELEGATION_INSTALL_EXISTING_PACKAGE`](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#DELEGATION_INSTALL_EXISTING_PACKAGE)\
→  allows app to install an app in Work Profile if already present in personal profile or in main profile when using Work Managed Device and package was kept after app removal.
* [`DELEGATION_KEEP_UNINSTALLED_PACKAGES`](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#DELEGATION_KEEP_UNINSTALLED_PACKAGES)\
→ allows app to define if a package must be kept on device after app removal.
* [`DELEGATION_NETWORK_LOGGING`](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#DELEGATION_NETWORK_LOGGING)\
→ allows an app to enable network logging and read them through a broadcast receiver.
* [`DELEGATION_PACKAGE_ACCESS`](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#DELEGATION_PACKAGE_ACCESS)\
→ allows app to get apps status (hidden and suspended) and set it.
* [`DELEGATION_PERMISSION_GRANT`](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#DELEGATION_PERMISSION_GRANT)\
→ allows app to define apps permissions.
* [`DELEGATION_SECURITY_LOGGING`](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#DELEGATION_SECURITY_LOGGING)\
→ allows an app to enable security logging (app permission changes, authentication attempts, system integrity issues, security policy vilations, ect.) and read them through a broadcast receiver.


## Examples

### Wi-Fi On/Off button

A customer requested a solution that would allow users to enable or disable Wi-Fi while in kiosk mode, without giving them access to the full network settings. On Android, this is not possible through an app starting from Android 11. Therefore, we had to find an alternative approach. Using the newer method (i.e., showing the network chooser pop-up) requires the Settings app to be accessible in kiosk mode, which could also allow users to access all network-related settings.

As a solution, we used the `DELEGATION_APP_RESTRICTIONS` scope and created an app that sets the Wi-Fi state via the OEMConfig app restrictions. In this case, the customer was using Honeywell devices, so we applied [Honneywell UEMConnect](https://play.google.com/store/apps/details?id=com.honeywell.oemconfig&hl=fr) restrictions, as described below:

```
com.honeywell.oemconfig
.
└── network_configuration (bundle)
    └── wifi_settings (bundle)
        └── WifiEnable (string)
```

network_configuration.wifi_settings.WifiEnable

| State        | Restriction  value             |
|--------------|--------------------------------|
| On           | ``3``                          |
| Off          | ``1``                          |

On the app, when user clicks on the switch input, it reads the app restrictions sent by the MDM solution to UEMConnect, modify it with the values described above and apply it to the UEMConnect again (thanks to the delagation scope). After successfully making it work, we also added brightness, ring volume and rotation control.

{{< rawhtml >}}
<div>
  <img alt="Take bug report" src="/posts/android-dpc-delegation/wifi-onoff-app.png" style="width: 24%;display:block;margin:auto">
</div>
{{< /rawhtml >}}

Below, sample code to set app restrictions as explained:

```kt

// Check if app has delagation for app restrictions
fun hasDelegation(context: Context): Boolean {
    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    val packageName = context.applicationContext.packageName
    val delegatedScopes = dpm.getDelegatedScopes(null, packageName)
    val hasDelegation =  delegatedScopes.contains(DevicePolicyManager.DELEGATION_APP_RESTRICTIONS)
    if(!hasDelegation){
        Toast.makeText(context, "Delegated scope DELEGATION_APP_RESTRICTIONS missing.", Toast.LENGTH_LONG).show()
    }
    return hasDelegation
}

// Set restrictions to the specified package
fun setRestrictions(context: Context, packageName: String, kvps:  Array<Pair<String, Any>>) {
    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    val restrictions: Bundle = dpm.getApplicationRestrictions(null, packageName).apply {
        for (kvp in kvps){
            Log.d("AppRestrictions", "Setting restriction: ${kvp.first} = ${kvp.second}")
            setNestedRestrictionValue(this, kvp.first, kvp.second)
        }
    }
    dpm.setApplicationRestrictions(null, packageName, restrictions)
}

// Update restriction Bundle
fun setNestedRestrictionValue(root: Bundle, keyPath: String, value: Any) {
    val keys = keyPath.split(".")
    var current = root

    for (i in 0 until keys.size - 1) {
        val key = keys[i]
        val next = current.getBundle(key)
        if (next == null) {
            val newBundle = Bundle()
            current.putBundle(key, newBundle)
            current = newBundle
        } else {
            current = next
        }
    }

    val finalKey = keys.last()
    when (value) {
        is Boolean -> current.putBoolean(finalKey, value)
        is Int -> current.putInt(finalKey, value)
        is String -> current.putString(finalKey, value)
        is Float -> current.putFloat(finalKey, value)
        is Long -> current.putLong(finalKey, value)
        else -> throw IllegalArgumentException("Unsupported type: ${value::class}")
    }
}

//////////////////////////////////////////////////////////////////////////////////////////////////

// Code can be used like this
if(hasDelegation(context)){
  setRestrictions(
      context, "com.honeywell.oemconfig", arrayOf(
          Pair("network_configuration.wifi_settings.WifiEnable", "3"),
      )
  )
}
```


### Authentication certificate preselection

For my first time using delegated permissions, I was looking for a solution for a customer who asked whether it was possible to preselect a certificate to automate authentication against their IdP. Unfortunately, this isn't possible, even with Chrome-managed restrictions.

We would be satisfied if, at the very least, we could prevent users from selecting the wrong certificate by preselecting the correct certificate alias while still prompting them to allow its usage by the app.

After some research, I found that this can be achieved using `DELEGATION_CERT_SELECTION` in combination with a `DelegatedAdminReceiver`.

You can find my fully functionnal app that leverage app config to setup mapping on Google Play : [Managed Private Key Mapping](https://play.google.com/store/apps/details?id=com.nosari20.managedcertificateselection)

{{< rawhtml >}}
<div>
  <img alt="Take bug report" src="/posts/android-dpc-delegation/cert-selection-app.png" style="width: 24%;display:block;margin:auto">
</div>
{{< /rawhtml >}}

Below, sample code to do it:


```kotlin

class MyDelegatedAdminReceiver: DelegatedAdminReceiver() {

     override fun onChoosePrivateKeyAlias(
        context: Context,
        intent: Intent,
        uid: Int,
        rawUri: Uri?,
        alias: String?
    ): String? {


      val packageManager: PackageManager = context.packageManager
      val source = packageManager.getNameForUid(uid) // get package name of the app that request the certificate
      val uri = Uri.decode(rawUri.toString()).replace("/","")  // get the uri for which the certificate will be used


      if(source == "com.android.chrome" && uri == "example.com"){
        return "MY_CERT_ALIAS" // return cert alias without prompting and also allow app to use it
      }else{
        return null // user will be prompted to choose
      }

      // return KeyChain.KEY_ALIAS_SELECTION_DENIED if you want to deny access to keychain

    }

}
```



## Sources / usefull resources
* https://developer.android.com/reference/android/app/admin/DelegatedAdminReceiver
* https://developer.android.com/reference/android/app/admin/DevicePolicyManager#DELEGATION_APP_RESTRICTIONS
