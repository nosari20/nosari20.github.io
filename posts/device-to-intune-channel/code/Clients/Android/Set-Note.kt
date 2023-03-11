
// Load certificate
val privKey = KeyChain.getPrivateKey(this.requireContext(), test.certAlias)
val pubKey = KeyChain.getCertificateChain(this.requireContext(), test.certAlias)

if (privKey == null) {
    // requestAliasPermission(); Ask user to allow certificate access
    return
}

// Define the certificate alias to be used
val certAlias = "<YOUR_ALIAS>"

// Create custom KeyManager
val keyManager = object:X509KeyManager {

    override fun getCertificateChain(alias: String?): Array<X509Certificate> {
        return pubKey!!
    }

    override fun getPrivateKey(alias: String?): PrivateKey {
        return privKey!!
    }

    override fun chooseClientAlias(keyType: Array<out String>?, issuers: Array<out Principal>?, socket: Socket ): String {
        return certAlias
    }

    override fun getClientAliases(
        keyType: String?,
        issuers: Array<out Principal>?
    ): Array<String> {
        TODO("Not yet implemented")
    }

    override fun getServerAliases(
        keyType: String?,
        issuers: Array<out Principal>?
    ): Array<String> {
        TODO("Not yet implemented")
    }

    override fun chooseServerAlias(
        keyType: String?,
        issuers: Array<out Principal>?,
        socket: Socket?
    ): String {
        TODO("Not yet implemented")
    }

}

// Create custom SSL context to use certificate
var sslContext = SSLContext.getInstance("TLS")
sslContext.init(arrayOf<KeyManager>(km), null, null)
sslFactory = sslContext.socketFactory


// Create client with custom context
val okHttpClient = OkHttpClient.Builder()
        .sslSocketFactory(sslFactory.getSslSocketFactory(), sslFactory.getTrustManager().get())
        .build()

// Create request
val name = Settings.System.getString(requireContext().contentResolver, "bluetooth_name")

val Url = "<AZURE-FUNCTION_URL>"
var formBody = FormBody.Builder()
      .add("note", name) // Request all categories with their ids with the same principle
      .build()

var request = Request.Builder()
    .url(Url)
    .build()


// Send request
var call = okHttpClient.newCall(request)
call.enqueue(object:Callback {
    fun onResponse(call:Call, response:Response){
        Log.d("SET-NOTE",response.body()?.string())
    }
    
    fun onFailure(call: Call, e:IOException) {
        TODO("Not yet implemented")
    }
})