package org.irgunshiuraitorah.app;

import android.os.CancellationSignal;

import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

@CapacitorPlugin(name = "IrgunGoogleAuth")
public class IrgunGoogleAuthPlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
        final String clientId = call.getString("clientId", "").trim();
        if (clientId.isEmpty()) {
            call.reject("Google client ID is missing.");
            return;
        }
        if (getActivity() == null) {
            call.reject("Google sign-in cannot open right now.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                GetSignInWithGoogleOption googleOption =
                    new GetSignInWithGoogleOption.Builder(clientId).build();

                GetCredentialRequest request = new GetCredentialRequest.Builder()
                    .addCredentialOption(googleOption)
                    .build();

                CredentialManager manager = CredentialManager.create(getActivity());
                CancellationSignal cancellationSignal = new CancellationSignal();

                manager.getCredentialAsync(
                    getActivity(),
                    request,
                    cancellationSignal,
                    ContextCompat.getMainExecutor(getActivity()),
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override
                        public void onResult(GetCredentialResponse result) {
                            try {
                                Credential credential = result.getCredential();
                                if (!(credential instanceof CustomCredential) ||
                                    !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                                    call.reject("Google returned an unexpected credential type.");
                                    return;
                                }

                                GoogleIdTokenCredential googleCredential =
                                    GoogleIdTokenCredential.createFrom(credential.getData());

                                String idToken = googleCredential.getIdToken();
                                if (idToken == null || idToken.trim().isEmpty()) {
                                    call.reject("Google did not return an ID token.");
                                    return;
                                }

                                JSObject ret = new JSObject();
                                ret.put("idToken", idToken);
                                // GoogleIdTokenCredential#getId() is the account identifier (normally the email address).
                                String email = googleCredential.getId();
                                ret.put("email", email == null ? "" : email);
                                ret.put("name", googleCredential.getDisplayName() == null ? "" : googleCredential.getDisplayName());
                                call.resolve(ret);
                            } catch (Exception error) {
                                call.reject("Could not read the Google sign-in result.", error);
                            }
                        }

                        @Override
                        public void onError(GetCredentialException error) {
                            String message = error.getMessage();
                            call.reject(message == null || message.trim().isEmpty()
                                ? "Google sign-in was cancelled or unavailable."
                                : message, error);
                        }
                    }
                );
            } catch (Exception error) {
                call.reject("Could not start Google sign-in.", error);
            }
        });
    }
}
