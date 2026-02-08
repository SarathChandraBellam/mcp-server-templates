/**
 * Auth0 JWT Token Verifier for MCP Resource Server pattern.
 *
 * Validates bearer tokens issued by Auth0:
 *   1. Fetches JWKS (JSON Web Key Set) from Auth0 (cached)
 *   2. Decodes the JWT using RS256
 *   3. Validates issuer, audience, and expiry claims
 *   4. Returns parsed token info (client_id, scopes, expires_at)
 *
 * Used as Express middleware in front of the MCP transport handler.
 */

import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";

export interface TokenInfo {
  clientId: string;
  scopes: string[];
  expiresAt: number | undefined;
}

export interface Auth0VerifierOptions {
  domain: string;
  audience: string;
}

export function createAuth0Middleware(options: Auth0VerifierOptions) {
  const issuer = `https://${options.domain}/`;
  const audience = options.audience;

  const jwksClient = jwksRsa({
    jwksUri: `https://${options.domain}/.well-known/jwks.json`,
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

      // Auth0 puts scopes in the "scope" claim (space-separated)
      const scopeStr = (payload.scope as string) ?? "";
      const scopes = scopeStr ? scopeStr.split(" ") : [];

      // "sub" is the client_id for client-credentials grants,
      // or "auth0|user_id" for authorization-code grants
      const clientId = (payload.sub as string) ?? "unknown";

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
