import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildApp } from '../src/server.js';

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Lazily build the app on first request
  if (!app) {
    app = await buildApp();
    await app.ready();
  }

  // Build headers object
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
  }

  // Use Fastify's inject for serverless
  const response = await app.inject({
    method: req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
    url: req.url || '/',
    headers,
    payload: req.body,
  });

  // Copy response headers
  const responseHeaders = response.headers;
  for (const [key, value] of Object.entries(responseHeaders)) {
    if (value !== undefined) {
      res.setHeader(key, value as string);
    }
  }

  // Handle WWW-Authenticate header for Basic Auth
  if (response.statusCode === 401 && responseHeaders['www-authenticate']) {
    res.setHeader('WWW-Authenticate', responseHeaders['www-authenticate'] as string);
  }

  res.status(response.statusCode).send(response.payload);
}
