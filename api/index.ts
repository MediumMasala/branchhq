import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildApp } from '../src/server.js';

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Lazily build the app on first request
  if (!app) {
    app = await buildApp();
    await app.ready();
  }

  // Build headers object, excluding content-length (inject will calculate it)
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined && key.toLowerCase() !== 'content-length') {
      headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
  }

  // Handle the payload - Vercel may have already parsed it
  let payload: string | Buffer | undefined;
  if (req.body !== undefined && req.body !== null) {
    const contentType = headers['content-type'] || '';

    if (typeof req.body === 'string') {
      payload = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      payload = req.body;
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      // Form data - convert object back to URL encoded string
      payload = new URLSearchParams(req.body as Record<string, string>).toString();
    } else if (contentType.includes('application/json')) {
      payload = JSON.stringify(req.body);
    } else if (typeof req.body === 'object') {
      // Default: try URL encoding for form submissions
      payload = new URLSearchParams(req.body as Record<string, string>).toString();
    }
  }

  // Use Fastify's inject for serverless
  const response = await app.inject({
    method: req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
    url: req.url || '/',
    headers,
    payload,
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
