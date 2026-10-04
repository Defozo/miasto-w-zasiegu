package pl.przejscie.phone

import android.content.Context
import androidx.compose.runtime.*
import com.clerk.api.Clerk
import com.clerk.api.auth.HostedAuthMode
import com.clerk.api.network.serialization.ClerkResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import org.json.JSONObject

enum class ClerkConnection { Loading, Ready, Unavailable }

/** Clerk owns credentials and refreshes tokens; Account.token is only an identity marker. */
object ClerkAccounts {
    val connection = MutableStateFlow(ClerkConnection.Loading)
    private val initialization = Mutex()

    suspend fun initialize(context: Context) = initialization.withLock {
        if (connection.value == ClerkConnection.Ready) return@withLock
        connection.value = ClerkConnection.Loading
        try {
            val config = Api.request("/api/auth/config")
            if (config.optString("provider") != "clerk" || !config.optBoolean("configured")) {
                connection.value = ClerkConnection.Unavailable
                return@withLock
            }
            Clerk.initialize(context, publishableKey = config.getString("publishableKey"))
            withTimeout(15_000) { Clerk.isInitialized.first { it } }
            connection.value = ClerkConnection.Ready
        } catch (error: Exception) {
            connection.value = ClerkConnection.Unavailable
            if (error is CancellationException) throw error
        }
    }

    suspend fun accessToken(identity: String): String {
        if (connection.value != ClerkConnection.Ready)
            throw ApiException("AUTH_UNAVAILABLE", "Logowanie jest obecnie niedostępne.")
        val userId = Clerk.user?.id ?: throw ApiException("AUTH_REQUIRED", "Zaloguj się ponownie.")
        if (identity != "clerk:$userId") throw ApiException("ACCOUNT_CHANGED", "Konto zmieniło się. Otwórz ekran konta ponownie.")
        val token = when (val result = Clerk.auth.getToken()) {
            is ClerkResult.Success -> result.value
            is ClerkResult.Failure -> throw ApiException("AUTH_UNAVAILABLE", "Nie udało się potwierdzić sesji. Sprawdź połączenie.")
        }
        if (Clerk.user?.id != userId) throw ApiException("ACCOUNT_CHANGED", "Konto zmieniło się podczas operacji.")
        return token
    }

    suspend fun snapshot(): JSONObject? {
        val userId = Clerk.user?.id ?: return null
        val result = Api.request("/api/auth/me", token = "clerk:$userId")
        if (Clerk.user?.id != userId) throw ApiException("ACCOUNT_CHANGED", "Konto zmieniło się podczas logowania.")
        return result
    }

    suspend fun authenticate(register: Boolean): JSONObject? {
        if (connection.value != ClerkConnection.Ready) throw ApiException("AUTH_UNAVAILABLE", "Logowanie jest obecnie niedostępne.")
        if (Clerk.user == null) {
            when (Clerk.auth.startHostedAuth(mode = if (register) HostedAuthMode.SIGN_UP else HostedAuthMode.SIGN_IN)) {
                is ClerkResult.Success -> Unit
                is ClerkResult.Failure -> throw ApiException("AUTH_CANCELLED", "Logowanie nie zostało zakończone. Możesz spróbować ponownie.")
            }
        }
        return snapshot()
    }

    suspend fun signOut(identity: String?) {
        if (identity != null) Api.request("/api/auth/logout", JSONObject(), token = identity)
        when (Clerk.auth.signOut()) {
            is ClerkResult.Success -> Unit
            is ClerkResult.Failure -> throw ApiException("AUTH_UNAVAILABLE", "Nie udało się zakończyć sesji. Spróbuj ponownie.")
        }
    }
}

@Composable internal fun ObserveClerkAccount(context: Context, retry: Int,
    onSession: (JSONObject?) -> Unit, onError: (String) -> Unit) {
    val currentSession by rememberUpdatedState(onSession)
    val currentError by rememberUpdatedState(onError)
    LaunchedEffect(retry) {
        ClerkAccounts.initialize(context)
        if (ClerkAccounts.connection.value != ClerkConnection.Ready) return@LaunchedEffect
        Clerk.userFlow.distinctUntilChangedBy { it?.id }.collect { user ->
            try { currentSession(if (user == null) null else ClerkAccounts.snapshot()) }
            catch (error: Exception) {
                if (error is CancellationException) throw error
                currentSession(null)
                currentError(error.message ?: "Nie udało się wczytać konta.")
            }
        }
    }
}
