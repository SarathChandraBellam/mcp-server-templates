"""
Auth0 JWT Token Verifier for MCP Resource Server pattern.

Validates bearer tokens issued by Auth0:
  1. Fetches JWKS (JSON Web Key Set) from Auth0 (cached)
  2. Decodes the JWT using RS256
  3. Validates issuer, audience, and expiry claims
  4. Returns an AccessToken with client_id and scopes

Implements the MCP SDK's TokenVerifier protocol.
"""

import time

import httpx
import jwt
from jwt import PyJWKClient
from mcp.server.auth.provider import AccessToken


class Auth0TokenVerifier:
    """Verify JWTs issued by Auth0."""

    def __init__(self, domain: str, audience: str) -> None:
        self.issuer = f"https://{domain}/"
        self.audience = audience
        self.algorithms = ["RS256"]
        self.jwks_client = PyJWKClient(
            f"https://{domain}/.well-known/jwks.json",
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

            # Auth0 puts scopes in the "scope" claim (space-separated)
            scope_str = payload.get("scope", "")
            scopes = scope_str.split() if scope_str else []

            # "sub" is the client_id for client-credentials grants,
            # or "auth0|user_id" for authorization-code grants
            client_id = payload.get("sub", "unknown")

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
