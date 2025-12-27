import type { FastifyReply } from 'fastify';

export function setSecurityHeaders(reply: FastifyReply): void {
  // HSTS - enforce HTTPS
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Prevent clickjacking
  reply.header('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  reply.header('X-Content-Type-Options', 'nosniff');

  // XSS Protection (legacy but still useful)
  reply.header('X-XSS-Protection', '1; mode=block');

  // Referrer Policy
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Basic CSP - allow inline styles for our simple pages
  reply.header(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'"
  );

  // Permissions Policy
  reply.header(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  );
}

export interface RateLimitConfig {
  max: number;
  timeWindow: string;
}

export const defaultRateLimitConfig: RateLimitConfig = {
  max: 100,
  timeWindow: '1 minute',
};

export const adminRateLimitConfig: RateLimitConfig = {
  max: 50,
  timeWindow: '1 minute',
};
