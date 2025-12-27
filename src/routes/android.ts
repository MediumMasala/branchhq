import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { setSecurityHeaders } from '../lib/security.js';
import { cleanPhoneNumber } from '../lib/urlBuilder.js';
import { androidBridgeQuerySchema } from '../lib/validation.js';

interface AndroidParams {
  slug: string;
}

export async function androidRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: AndroidParams; Querystring: Record<string, string> }>(
    '/a/:slug',
    async (request, reply) => {
      return handleAndroidBridge(request, reply);
    }
  );
}

async function handleAndroidBridge(
  request: FastifyRequest<{ Params: AndroidParams; Querystring: Record<string, string> }>,
  reply: FastifyReply
) {
  setSecurityHeaders(reply);

  const queryResult = androidBridgeQuerySchema.safeParse(request.query);

  if (!queryResult.success) {
    return reply.status(400).send({ error: 'Missing required parameters' });
  }

  const { phone, text } = queryResult.data;
  const cleanPhone = cleanPhoneNumber(phone);
  const encodedText = encodeURIComponent(text);

  // Android intent URL with fallback to api.whatsapp.com
  const fallbackUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  const encodedFallback = encodeURIComponent(fallbackUrl);
  const intentUrl = `intent://send?phone=${cleanPhone}&text=${encodedText}#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=${encodedFallback};end;`;

  const html = generateAndroidBridgeHtml({
    phone: cleanPhone,
    text,
    intentUrl,
  });

  return reply.status(200).type('text/html').send(html);
}

interface AndroidBridgeHtmlOptions {
  phone: string;
  text: string;
  intentUrl: string;
}

function generateAndroidBridgeHtml(options: AndroidBridgeHtmlOptions): string {
  const { intentUrl } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Open Tal on WhatsApp</title>
    <meta name="description" content="Start chatting with Tal on WhatsApp">
    <meta name="theme-color" content="#ff6b35">
    <style>
        :root {
            --retry-x: 50%;
            --retry-y: 82%;
            --retry-w: 90px;
            --retry-h: 44px;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        html, body { height: 100%; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #ff9a56 0%, #ff6b35 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
        }

        .card {
            background: #ffffff;
            border-radius: 24px;
            padding: 32px 24px;
            max-width: 400px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
        }

        .logo {
            width: 64px;
            height: 64px;
            margin: 0 auto 16px;
            border-radius: 50%;
            overflow: hidden;
        }

        .logo img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        h1 {
            font-size: 22px;
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 8px;
            letter-spacing: -0.5px;
        }

        .instruction {
            font-size: 15px;
            color: #555555;
            margin-bottom: 16px;
            line-height: 1.5;
        }

        .instruction strong {
            color: #1a1a1a;
            background: #fff3cd;
            padding: 2px 6px;
            border-radius: 4px;
        }

        .screenshot-container {
            position: relative;
            margin: 0 auto 24px;
            max-width: 280px;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            border: 3px solid #e0e0e0;
        }

        .screenshot-img {
            display: block;
            width: 100%;
            height: auto;
        }

        .scan-line {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg,
                transparent 0%,
                rgba(37, 211, 102, 0.8) 50%,
                transparent 100%
            );
            box-shadow: 0 0 10px rgba(37, 211, 102, 0.6);
            animation: scan 2.5s ease-in-out infinite;
            pointer-events: none;
        }

        @keyframes scan {
            0% { top: 0; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }

        .retry-highlight {
            position: absolute;
            left: var(--retry-x);
            top: var(--retry-y);
            width: var(--retry-w);
            height: var(--retry-h);
            transform: translate(-50%, -50%);
            border: 3px solid #25D366;
            border-radius: 8px;
            animation: pulse-ring 1.5s ease-out infinite;
            pointer-events: none;
        }

        .retry-highlight::before {
            content: '';
            position: absolute;
            inset: -8px;
            border: 2px solid rgba(37, 211, 102, 0.4);
            border-radius: 12px;
            animation: pulse-ring-outer 1.5s ease-out infinite;
        }

        @keyframes pulse-ring {
            0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            50% { transform: translate(-50%, -50%) scale(1.05); opacity: 0.8; }
            100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }

        @keyframes pulse-ring-outer {
            0% { transform: scale(1); opacity: 0.6; }
            50% { transform: scale(1.1); opacity: 0.3; }
            100% { transform: scale(1); opacity: 0.6; }
        }

        .tap-cursor {
            position: absolute;
            left: calc(var(--retry-x) + 30px);
            top: calc(var(--retry-y) + 20px);
            width: 32px;
            height: 32px;
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
            animation: tap-motion 2s ease-in-out infinite;
            pointer-events: none;
        }

        .tap-cursor svg {
            width: 100%;
            height: 100%;
        }

        @keyframes tap-motion {
            0% { transform: translate(20px, 20px) scale(1); opacity: 0; }
            20% { opacity: 1; }
            40% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(0, 0) scale(0.85); }
            60% { transform: translate(0, 0) scale(1); }
            80% { opacity: 1; }
            100% { transform: translate(20px, 20px) scale(1); opacity: 0; }
        }

        .btn-primary {
            display: block;
            width: 100%;
            background: #25D366;
            color: #ffffff;
            font-size: 18px;
            font-weight: 600;
            padding: 16px 24px;
            border: none;
            border-radius: 14px;
            cursor: pointer;
            text-decoration: none;
            transition: background 0.2s ease, transform 0.1s ease;
            -webkit-tap-highlight-color: transparent;
        }

        .btn-primary:hover {
            background: #22c55e;
        }

        .btn-primary:active {
            transform: scale(0.98);
        }

        @media (max-width: 480px) {
            body { padding: 16px; }
            .card { padding: 28px 20px; border-radius: 20px; }
            .logo { width: 56px; height: 56px; }
            h1 { font-size: 20px; }
            .instruction { font-size: 14px; }
            .screenshot-container { max-width: 260px; }
            .btn-primary { font-size: 17px; padding: 14px 20px; }
            .tap-cursor { width: 28px; height: 28px; }
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">
            <img src="data:image/jpeg;base64,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" alt="Tal logo">
        </div>

        <h1>Get jobs on WhatsApp</h1>

        <p class="instruction">You'll have to do this twice. When this pops up, tap <strong>Retry</strong>.</p>

        <a href="${escapeHtml(intentUrl)}" id="screenshotLink">
            <div class="screenshot-container">
                <img src="https://raw.githubusercontent.com/MediumMasala/linkedin-whatsapp-redirect/main/Screenshot.jpeg" alt="Tap Retry when you see this popup" class="screenshot-img">
                <div class="scan-line"></div>
                <div class="retry-highlight"></div>
                <div class="tap-cursor">
                    <svg viewBox="0 0 24 24" width="32" height="32">
                        <path fill="#000000" stroke="#ffffff" stroke-width="1" d="M4 2l14 11-6 1 4 8-3 1-4-8-5 4V2z"/>
                    </svg>
                </div>
            </div>
        </a>

        <a href="${escapeHtml(intentUrl)}" class="btn-primary" id="whatsappBtn">
            Open WhatsApp
        </a>
    </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
}
