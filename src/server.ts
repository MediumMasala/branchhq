import Fastify from 'fastify';
import fastifyFormbody from '@fastify/formbody';
import fastifyBasicAuth from '@fastify/basic-auth';
import fastifyRateLimit from '@fastify/rate-limit';

import { healthRoutes } from './routes/health.js';
import { redirectRoutes } from './routes/redirect.js';
import { androidRoutes } from './routes/android.js';
import { adminRoutes } from './routes/admin.js';
import { defaultRateLimitConfig } from './lib/security.js';

const envToLogger = {
  development: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
  production: true,
  test: false,
};

export async function buildApp() {
  const environment = (process.env.NODE_ENV || 'development') as keyof typeof envToLogger;

  const fastify = Fastify({
    logger: envToLogger[environment] ?? true,
    trustProxy: true, // Trust X-Forwarded-* headers (important for Vercel/proxies)
  });

  // Register form body parser (for admin forms)
  await fastify.register(fastifyFormbody);

  // Register rate limiting
  await fastify.register(fastifyRateLimit, {
    max: defaultRateLimitConfig.max,
    timeWindow: defaultRateLimitConfig.timeWindow,
    keyGenerator: (request) => {
      // Use X-Forwarded-For or request.ip
      return request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || request.ip;
    },
  });

  // Register basic auth for admin routes
  await fastify.register(fastifyBasicAuth, {
    validate: async (username, password, _request, _reply) => {
      const adminUser = process.env.ADMIN_USER || 'admin';
      const adminPass = process.env.ADMIN_PASS || 'admin';

      if (username !== adminUser || password !== adminPass) {
        throw new Error('Unauthorized');
      }
    },
    authenticate: { realm: 'BranchHQ Admin' },
  });

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(redirectRoutes);
  await fastify.register(androidRoutes);
  await fastify.register(adminRoutes);

  // Global error handler
  fastify.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    request.log.error(error);

    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
      });
    }

    if (error.statusCode === 401) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
    }

    return reply.status(error.statusCode || 500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'An error occurred' : error.message,
    });
  });

  // 404 handler
  fastify.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      error: 'Not Found',
      message: 'The requested resource was not found',
    });
  });

  return fastify;
}

// Start server (for local development)
async function start() {
  const app = await buildApp();
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    console.log(`🚀 BranchHQ server running at http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only start if running directly (not imported by Vercel)
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
if (!isVercel && process.argv[1]?.includes('server')) {
  start();
}
