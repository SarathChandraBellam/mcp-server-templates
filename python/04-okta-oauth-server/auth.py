"""
Okta JWT Token Verifier for MCP Resource Server pattern.

Validates bearer tokens issued by Okta:
  1. Fetches JWKS (JSON Web Key Set) from Okta (cached)
  2. Decodes the JWT using RS256
  3. Validates issuer, audience, and expiry claims
  4. Returns an AccessToken with client_id and scopes

Implements the MCP SDK's TokenVerifier protocol.

Key differences from Auth0:
  - Issuer:    https://{domain}/oauth2/{server_id}
  - JWKS URL:  https://{domain}/oauth2/{server_id}/v1/keys
  - Scopes:    "scp" claim (list), not "scope" (space-separated string)
  - Client ID: "cid" claim, not "sub"
"""

import jwt
from jwt import PyJWKClient
from mcp.server.auth.provider import AccessToken


class OktaTokenVerifier:
    """Verify JWTs issued by Okta."""

    def __init__(self, domain: str, audience: str, auth_server_id: str = "default") -> None:
        self.issuer = f"https://{domain}/oauth2/{auth_server_id}"
        self.audience = audience
        self.algorithms = ["RS256"]
        self.jwks_client = PyJWKClient(
            f"https://{domain}/oauth2/{auth_server_id}/v1/keys",
            cache_keys=True,
            lifespan=3600,
        )

    async def verify_token(self, token: str) -> AccessToken | None:
        """Verify a bearer token and return access info if valid.

        Returns None if the token is invalid, expired, or
        doesn't match the expected issuer/audience.
        """
        try:
            signing_key = self.jwks_client.get_signing_key_from_jwt(token)

            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=self.algorithms,
                issuer=self.issuer,
                audience=self.audience,
                options={
                    "require": ["exp", "iss", "aud", "sub"],
                },
            )

            # Okta uses "scp" claim (a list), not "scope" (space-separated string)
            scopes = payload.get("scp", [])
            if isinstance(scopes, str):
                scopes = scopes.split()

            # Okta uses "cid" for the OAuth client ID
            client_id = payload.get("cid", payload.get("sub", "unknown"))

            # "exp" is a Unix timestamp
            expires_at = payload.get("exp")

            return AccessToken(
                token=token,
                client_id=client_id,
                scopes=scopes,
                expires_at=expires_at,
            )

        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
        except Exception:
            return None
