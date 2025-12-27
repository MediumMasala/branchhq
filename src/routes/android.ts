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

  // Android intent URL (simple format without fallback - the UI handles retries)
  const intentUrl = `intent://send?phone=${cleanPhone}&text=${encodedText}#Intent;scheme=whatsapp;package=com.whatsapp;end`;

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
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Open WhatsApp</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: linear-gradient(135deg, #ff9a56 0%, #ff6b35 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
        }

        .container {
            background: white;
            border-radius: 20px;
            padding: 24px 20px;
            max-width: 360px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }

        .header {
            text-align: center;
            margin-bottom: 20px;
        }

        .header h1 {
            font-size: 22px;
            font-weight: 700;
            color: #1a1a1a;
        }

        /* Flow visual */
        .flow {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-bottom: 20px;
            padding: 16px;
            background: #f8fafc;
            border-radius: 12px;
        }

        .flow-step {
            text-align: center;
        }

        .flow-step .icon {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            margin: 0 auto 6px;
        }

        .flow-step .icon.green {
            background: #dcfce7;
        }

        .flow-step .icon.blue {
            background: #dbeafe;
        }

        .flow-step .label {
            font-size: 11px;
            color: #64748b;
            font-weight: 500;
        }

        .flow-arrow {
            color: #cbd5e1;
            font-size: 18px;
        }

        /* LinkedIn Preview */
        .preview-label {
            font-size: 13px;
            color: #64748b;
            margin-bottom: 8px;
            text-align: center;
        }

        .linkedin-preview {
            background: #f5f5f5;
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 20px;
            border: 1px solid #e5e5e5;
        }

        .linkedin-bar {
            background: #fff;
            padding: 10px 12px;
            display: flex;
            align-items: center;
            border-bottom: 1px solid #e5e5e5;
            font-size: 12px;
            color: #333;
            font-weight: 500;
        }

        .linkedin-bar .x {
            width: 24px;
            height: 24px;
            background: #f0f0f0;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 12px;
            font-size: 14px;
            color: #666;
        }

        .linkedin-content {
            padding: 24px 16px;
            text-align: center;
            background: #fff;
        }

        .linkedin-content .people {
            font-size: 48px;
            margin-bottom: 12px;
        }

        .linkedin-content .msg {
            font-size: 14px;
            color: #666;
            margin-bottom: 16px;
            line-height: 1.4;
        }

        .linkedin-content .retry {
            display: inline-block;
            background: white;
            border: 2px solid #0a66c2;
            color: #0a66c2;
            padding: 10px 32px;
            border-radius: 24px;
            font-size: 15px;
            font-weight: 600;
        }

        .tap-here {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            margin-top: 12px;
            font-size: 13px;
            color: #0a66c2;
            font-weight: 600;
        }

        .tap-here .finger {
            animation: point 0.8s ease-in-out infinite;
        }

        @keyframes point {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-3px); }
        }

        /* CTA */
        .cta {
            background: #25D366;
            color: white;
            padding: 18px;
            border: none;
            border-radius: 14px;
            font-weight: 700;
            font-size: 17px;
            cursor: pointer;
            text-decoration: none;
            text-align: center;
            display: block;
            width: 100%;
        }

        .cta:active {
            opacity: 0.9;
        }

        .hint {
            text-align: center;
            margin-top: 12px;
            font-size: 13px;
            color: #94a3b8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Open WhatsApp</h1>
        </div>

        <!-- Visual flow -->
        <div class="flow">
            <div class="flow-step">
                <div class="icon green">📱</div>
                <div class="label">Tap below</div>
            </div>
            <div class="flow-arrow">→</div>
            <div class="flow-step">
                <div class="icon blue">🔄</div>
                <div class="label">Tap Retry</div>
            </div>
            <div class="flow-arrow">→</div>
            <div class="flow-step">
                <div class="icon green">✓</div>
                <div class="label">Tap again</div>
            </div>
        </div>

        <!-- LinkedIn Screenshot -->
        <p class="preview-label">You'll see this screen — tap Retry</p>
        <div class="linkedin-preview">
            <div class="linkedin-bar">
                <div class="x">✕</div>
                Web page not available
            </div>
            <div class="linkedin-content">
                <div class="people">👨‍💻🔧👩‍💻</div>
                <div class="msg">Sorry, we couldn't find that page.<br>Let's try again...</div>
                <div class="retry">Retry</div>
                <div class="tap-here">
                    <span class="finger">👆</span> Tap this
                </div>
            </div>
        </div>

        <a class="cta" href="${escapeHtml(intentUrl)}">
            Open WhatsApp
        </a>

        <p class="hint">Tap the button twice to connect</p>
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
