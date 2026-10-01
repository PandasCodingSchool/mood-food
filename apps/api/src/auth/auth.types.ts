import type { FastifyRequest } from 'fastify';

/** What the auth guard attaches to `req.user`. */
export interface AuthUser {
  id: string;
  /** auth_sessions.id of the presenting token. */
  sessionId: string;
  role: 'user' | 'admin';
  isGuest: boolean;
}

export type AppRequest = FastifyRequest & { user?: AuthUser };
