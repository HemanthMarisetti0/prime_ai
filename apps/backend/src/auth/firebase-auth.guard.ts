import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env';
import { IS_PUBLIC_KEY } from './public.decorator';

// Public keys Firebase Auth signs ID tokens with.
const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export interface AuthUser {
  uid: string;
  email: string;
  name?: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

/**
 * Verifies the Firebase ID token in the Authorization header on every non-public route
 * and restricts access to ALLOWED_EMAILS. Disabled when FIREBASE_PROJECT_ID is unset
 * (development only; production refuses to start without it).
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger('Auth');
  private readonly projectId = env.auth.firebaseProjectId;
  private readonly allowedEmails = env.auth.allowedEmails;
  private readonly jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));

  constructor(private readonly reflector: Reflector) {
    if (!this.projectId) {
      this.logger.warn('FIREBASE_PROJECT_ID is not set: sign-in is DISABLED. Development use only.');
    } else if (!this.allowedEmails.length) {
      this.logger.warn('ALLOWED_EMAILS is empty: any verified Google account can use P.R.I.M.E.');
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || !this.projectId) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = /^Bearer (.+)$/i.exec(request.headers.authorization ?? '')?.[1];
    if (!token) {
      throw new UnauthorizedException('Kindly sign in first, Sir.');
    }

    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer: `https://securetoken.google.com/${this.projectId}`,
        audience: this.projectId,
      }));
    } catch {
      throw new UnauthorizedException('Your session has expired, Sir. Kindly sign in again.');
    }

    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    if (!email || payload.email_verified !== true) {
      throw new ForbiddenException('My apologies. A verified email address is required.');
    }
    if (this.allowedEmails.length && !this.allowedEmails.includes(email)) {
      this.logger.warn(`Rejected sign-in from ${email}`);
      throw new ForbiddenException('My apologies. This assistant is reserved for its owner.');
    }

    request.user = {
      uid: String(payload.sub),
      email,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
    return true;
  }
}
