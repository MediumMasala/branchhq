import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildApp } from '../src/server.js';

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Lazily build the app on first request
  if (!app) {
    app = await buildApp();
    await app.ready();
  }

  // Convert headers to the format Fastify expects
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      headers[key] = Array.isArray(value) ? value.join(', ') : value;
    }
  }

  // Use Fastify's inject method for serverless
  const response = await app.inject({
    method: req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
    url: req.url || '/',
    headers,
    payload: req.body ? JSON.stringify(req.body) : undefined,
    query: req.query as Record<string, string>,
  });

  // Set response headers
  for (const [key, value] of Object.entries(response.headers)) {
    if (value) {
      res.setHeader(key, value);
    }
  }

  // Send response
  res.status(response.statusCode).send(response.payload);
}
