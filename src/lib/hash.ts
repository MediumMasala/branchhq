import { createHash } from 'crypto';

export function hashIp(ip: string): string {
  // Use SHA-256 to hash IP addresses for privacy
  return createHash('sha256').update(ip).digest('hex');
}

export function getClientIp(request: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  // Check X-Forwarded-For header (common with reverse proxies/load balancers)
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ip.trim();
  }

  // Check X-Real-IP header
  const realIp = request.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fall back to request.ip
  return request.ip || 'unknown';
}
