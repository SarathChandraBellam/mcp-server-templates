/**
 * Okta JWT Token Verifier for MCP Resource Server pattern.
 *
 * Validates bearer tokens issued by Okta:
 *   1. Fetches JWKS (JSON Web Key Set) from Okta (cached)
 *   2. Decodes the JWT using RS256
 *   3. Validates issuer, audience, and expiry claims
 *   4. Returns parsed token info (client_id, scopes, expires_at)
 *
 * Used as Express middleware in front of the MCP transport handler.
 *
 * Key differences from Auth0:
 *   - Issuer:    https://{domain}/oauth2/{server_id}
 *   - JWKS URL:  https://{domain}/oauth2/{server_id}/v1/keys
 *   - Scopes:    "scp" claim (list), not "scope" (space-separated string)
 *   - Client ID: "cid" claim, not "sub"
 */

import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";

export interface TokenInfo {
  clientId: string;
  scopes: string[];
  expiresAt: number | undefined;
}

export interface OktaVerifierOptions {
  domain: string;
  audience: string;
  authServerId?: string;
}

export function createOktaMiddleware(options: OktaVerifierOptions) {
  const authServerId = options.authServerId ?? "default";
  const issuer = `https://${options.domain}/oauth2/${authServerId}`;
  const audience = options.audience;

  const jwksClient = jwksRsa({
    jwksUri: `https://${options.domain}/oauth2/${authServerId}/v1/keys`,
    cache: true,
    cacheMaxAge: 3600_000,
  });

  function getKey(
    header: jwt.JwtHeader,
    callback: (err: Error | null, key?: string) => void,
  ) {
    jwksClient.getSigningKey(header.kid, (err, key) => {
      if (err || !key) return callback(err ?? new Error("No signing key"));
      callback(null, key.getPublicKey());
    });
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing Bearer token" });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = await new Promise<jwt.JwtPayload>((resolve, reject) => {
        jwt.verify(
          token,
          getKey,
          { issuer, audience, algorithms: ["RS256"] },
          (err, decoded) => {
            if (err) return reject(err);
            resolve(decoded as jwt.JwtPayload);
          },
        );
      });

      // Okta uses "scp" claim (a list), not "scope" (space-separated string)
      let scopes: string[] = [];
      const scp = payload.scp;
      if (Array.isArray(scp)) {
        scopes = scp as string[];
      } else if (typeof scp === "string") {
        scopes = scp.split(" ");
      }

      // Okta uses "cid" for the OAuth client ID
      const clientId = (payload.cid as string) ?? (payload.sub as string) ?? "unknown";

      const tokenInfo: TokenInfo = {
        clientId,
        scopes,
        expiresAt: payload.exp,
      };

      // Attach token info to the request for downstream handlers
      (req as Request & { auth?: TokenInfo }).auth = tokenInfo;
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  };
}
