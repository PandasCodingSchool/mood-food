import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConsoleLogger, Logger, RequestMethod, StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type pg from 'pg';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/load-env.js';
import { PG_POOL } from './core/tokens.js';
import { runMigrations } from './db/migrate.js';

async function bootstrap() {
  const env = loadEnv();
  const prod = env.NODE_ENV === 'production';

  const adapter = new FastifyAdapter({
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 15 * 1024 * 1024, // base64 wall photos
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    logger: {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers["x-session-id"]', 'req.headers["x-sync-key"]'],
    },
  });

  // v1 clients POST with `Content-Type: application/json` and no body; Fastify rejects that by default.
  // (Nest's own JSON parser is disabled below via `bodyParser: false`.)
  const fastify = adapter.getInstance();
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || !String(body).trim()) return done(null, {});
    try {
      done(null, JSON.parse(String(body)));
    } catch {
      const err = Object.assign(new Error('Invalid JSON body'), { statusCode: 400 });
      done(err, undefined);
    }
  });
  fastify.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bodyParser: false,
    logger: new ConsoleLogger({ json: prod, colors: !prod, logLevels: env.LOG_LEVEL === 'debug' ? undefined : ['log', 'warn', 'error', 'fatal'] }),
  });

  if (env.DB_MIGRATE_ON_BOOT) await runMigrations(app.get<pg.Pool>(PG_POOL));

  app.setGlobalPrefix('api', { exclude: [{ path: 'admin', method: RequestMethod.GET }] });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableCors({
    origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
    // @fastify/cors only allows GET/HEAD/POST by default; the app also uses PUT, PATCH and DELETE.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['x-request-id', 'RateLimit-Limit', 'RateLimit-Remaining', 'Retry-After'],
  });
  app.enableShutdownHooks();

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  new Logger('Bootstrap').log(`MoodFood API on :${env.PORT} (${env.NODE_ENV})`);
}

void bootstrap();
