package it.meko.openclawmobile

import android.content.Context
import android.util.Base64
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.bouncycastle.crypto.generators.Ed25519KeyPairGenerator
import org.bouncycastle.crypto.params.Ed25519KeyGenerationParameters
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Small, protocol-compatible OpenClaw Gateway bridge.
 *
 * The primary agent still runs locally on Android. This bridge is optional and performs the
 * current Gateway v4 challenge/device-auth handshake, persists the issued device token, and
 * verifies the operator connection with the read-only `status` RPC.
 */
data class GatewayTestResult(
    val ok: Boolean,
    val message: String,
    val serverVersion: String? = null,
    val requestId: String? = null
)

private data class GatewayIdentity(
    val privateRaw: ByteArray,
    val publicRaw: ByteArray,
    val deviceId: String
)

class OpenClawGatewayBridge(context: Context) {
    private val secureStore = SecureStore(context)
    private val client = OkHttpClient.Builder()
        .retryOnConnectionFailure(true)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    companion object {
        private const val PROTOCOL_VERSION = 4
        private const val CLIENT_ID = "gateway-client"
        private const val CLIENT_MODE = "ui"
        private const val ROLE = "operator"
        private val SCOPES = listOf("operator.read", "operator.write", "operator.approvals")
    }

    suspend fun testConnection(rawUrl: String, sharedToken: String): GatewayTestResult = withContext(Dispatchers.IO) {
        val url = normalizeGatewayUrl(rawUrl)
            ?: return@withContext GatewayTestResult(false, "URL Gateway non valida")
        val identity = loadOrCreateIdentity()
        val endpointKey = sha256Hex(url.toByteArray(Charsets.UTF_8)).take(20)
        val storedDeviceToken = secureStore.get("gateway_device_token_$endpointKey")
        val authToken = sharedToken.trim().ifBlank { storedDeviceToken }
        if (authToken.isBlank()) {
            return@withContext GatewayTestResult(false, "Inserisci il token del Gateway per il primo pairing")
        }

        val outcome = CompletableDeferred<GatewayTestResult>()
        val connectId = UUID.randomUUID().toString()
        val statusId = UUID.randomUUID().toString()
        var socketRef: WebSocket? = null
        var helloServerVersion: String? = null

        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                socketRef = webSocket
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val root = runCatching { JSONObject(text) }.getOrNull() ?: return
                when (root.optString("type")) {
                    "event" -> {
                        if (root.optString("event") == "connect.challenge") {
                            val payload = root.optJSONObject("payload") ?: return
                            val nonce = payload.optString("nonce")
                            val signedAt = payload.optLong("ts", -1L)
                            if (nonce.isBlank() || signedAt < 0L) {
                                if (!outcome.isCompleted) outcome.complete(GatewayTestResult(false, "Challenge Gateway non valido"))
                                webSocket.close(1000, "invalid challenge")
                                return
                            }
                            val signaturePayload = canonicalDeviceAuthPayload(
                                identity = identity,
                                token = authToken,
                                nonce = nonce,
                                signedAt = signedAt
                            )
                            val signature = sign(identity.privateRaw, signaturePayload)
                            val params = JSONObject()
                                .put("minProtocol", PROTOCOL_VERSION)
                                .put("maxProtocol", PROTOCOL_VERSION)
                                .put(
                                    "client",
                                    JSONObject()
                                        .put("id", CLIENT_ID)
                                        .put("displayName", "OpenClaw Mobile")
                                        .put("version", "0.5.0")
                                        .put("platform", "android")
                                        .put("mode", CLIENT_MODE)
                                        .put("deviceFamily", "Android")
                                )
                                .put("role", ROLE)
                                .put("scopes", JSONArray(SCOPES))
                                .put("caps", JSONArray())
                                .put("commands", JSONArray())
                                .put("permissions", JSONObject())
                                .put("auth", JSONObject().put("token", authToken))
                                .put("locale", Locale.getDefault().toLanguageTag())
                                .put("userAgent", "OpenClawMobile/0.5.0 Android")
                                .put(
                                    "device",
                                    JSONObject()
                                        .put("id", identity.deviceId)
                                        .put("publicKey", base64Url(identity.publicRaw))
                                        .put("signature", signature)
                                        .put("signedAt", signedAt)
                                        .put("nonce", nonce)
                                )
                            sendRequest(webSocket, connectId, "connect", params)
                        }
                    }

                    "res" -> {
                        when (root.optString("id")) {
                            connectId -> {
                                if (!root.optBoolean("ok", false)) {
                                    val error = root.optJSONObject("error")
                                    val details = error?.optJSONObject("details")
                                    val requestId = details?.optString("requestId")?.takeIf { it.isNotBlank() }
                                    val msg = buildString {
                                        append(error?.optString("message")?.takeIf { it.isNotBlank() } ?: "Connessione Gateway rifiutata")
                                        if (requestId != null) append(" — pairing: $requestId")
                                    }
                                    if (!outcome.isCompleted) outcome.complete(GatewayTestResult(false, msg, requestId = requestId))
                                    webSocket.close(1000, "connect rejected")
                                    return
                                }

                                val payload = root.optJSONObject("payload") ?: JSONObject()
                                helloServerVersion = payload.optJSONObject("server")?.optString("version")?.takeIf { it.isNotBlank() }
                                val issuedDeviceToken = payload.optJSONObject("auth")?.optString("deviceToken")?.takeIf { it.isNotBlank() }
                                if (issuedDeviceToken != null) {
                                    secureStore.put("gateway_device_token_$endpointKey", issuedDeviceToken)
                                }
                                sendRequest(webSocket, statusId, "status", JSONObject())
                            }

                            statusId -> {
                                if (root.optBoolean("ok", false)) {
                                    if (!outcome.isCompleted) {
                                        outcome.complete(
                                            GatewayTestResult(
                                                true,
                                                "Gateway OpenClaw collegato e RPC status verificato",
                                                serverVersion = helloServerVersion
                                            )
                                        )
                                    }
                                } else {
                                    val msg = root.optJSONObject("error")?.optString("message")
                                        ?.takeIf { it.isNotBlank() }
                                        ?: "Handshake riuscito, ma RPC status rifiutato"
                                    if (!outcome.isCompleted) outcome.complete(GatewayTestResult(false, msg, helloServerVersion))
                                }
                                webSocket.close(1000, "done")
                            }
                        }
                    }
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (!outcome.isCompleted) {
                    outcome.complete(GatewayTestResult(false, "Errore Gateway: ${t.message ?: t.javaClass.simpleName}"))
                }
            }
        }

        try {
            client.newWebSocket(Request.Builder().url(url).build(), listener)
            withTimeout(25_000L) { outcome.await() }
        } catch (t: Throwable) {
            GatewayTestResult(false, "Timeout/errore Gateway: ${t.message ?: t.javaClass.simpleName}")
        } finally {
            socketRef?.cancel()
        }
    }

    private fun sendRequest(socket: WebSocket, id: String, method: String, params: JSONObject) {
        socket.send(
            JSONObject()
                .put("type", "req")
                .put("id", id)
                .put("method", method)
                .put("params", params)
                .toString()
        )
    }

    private fun canonicalDeviceAuthPayload(
        identity: GatewayIdentity,
        token: String,
        nonce: String,
        signedAt: Long
    ): String = listOf(
        "v3",
        identity.deviceId,
        CLIENT_ID,
        CLIENT_MODE,
        ROLE,
        SCOPES.joinToString(","),
        signedAt.toString(),
        token,
        nonce,
        "android",
        "android"
    ).joinToString("|")

    private fun loadOrCreateIdentity(): GatewayIdentity {
        val storedPrivate = secureStore.get("gateway_identity_private")
        if (storedPrivate.isNotBlank()) {
            runCatching {
                val privateRaw = Base64.decode(storedPrivate, Base64.DEFAULT)
                val privateKey = Ed25519PrivateKeyParameters(privateRaw, 0)
                val publicRaw = privateKey.generatePublicKey().encoded
                return GatewayIdentity(privateRaw, publicRaw, sha256Hex(publicRaw))
            }
        }

        val generator = Ed25519KeyPairGenerator()
        generator.init(Ed25519KeyGenerationParameters(SecureRandom()))
        val pair = generator.generateKeyPair()
        val privateKey = pair.private as Ed25519PrivateKeyParameters
        val publicKey = pair.public as Ed25519PublicKeyParameters
        secureStore.put("gateway_identity_private", Base64.encodeToString(privateKey.encoded, Base64.NO_WRAP))
        return GatewayIdentity(privateKey.encoded, publicKey.encoded, sha256Hex(publicKey.encoded))
    }

    private fun sign(privateRaw: ByteArray, payload: String): String {
        val signer = Ed25519Signer()
        signer.init(true, Ed25519PrivateKeyParameters(privateRaw, 0))
        val bytes = payload.toByteArray(Charsets.UTF_8)
        signer.update(bytes, 0, bytes.size)
        return base64Url(signer.generateSignature())
    }

    private fun normalizeGatewayUrl(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isBlank()) return null
        val normalized = when {
            trimmed.startsWith("https://", true) -> "wss://${trimmed.substringAfter("://")}" 
            trimmed.startsWith("http://", true) -> "ws://${trimmed.substringAfter("://")}" 
            trimmed.startsWith("wss://", true) || trimmed.startsWith("ws://", true) -> trimmed
            else -> "wss://$trimmed"
        }
        val uri = runCatching { URI(normalized) }.getOrNull() ?: return null
        val host = uri.host?.lowercase(Locale.ROOT) ?: return null
        if (uri.scheme == "ws" && !isLocalCleartextHost(host)) return null
        return normalized
    }

    private fun isLocalCleartextHost(host: String): Boolean {
        if (host == "localhost" || host == "127.0.0.1" || host.endsWith(".local")) return true
        if (host.startsWith("10.") || host.startsWith("192.168.")) return true
        if (host.startsWith("172.")) {
            val second = host.split('.').getOrNull(1)?.toIntOrNull()
            if (second != null && second in 16..31) return true
        }
        return host == "10.0.2.2"
    }

    private fun base64Url(data: ByteArray): String =
        Base64.encodeToString(data, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

    private fun sha256Hex(data: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(data).joinToString("") { "%02x".format(it) }
}
