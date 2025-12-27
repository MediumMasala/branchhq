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

  // Build all the possible URLs
  const apiWhatsAppUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  const waMeUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;

  // Android intent URL with fallback
  const intentUrl = `intent://send?phone=${cleanPhone}&text=${encodedText}#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=${encodeURIComponent(apiWhatsAppUrl)};end;`;

  const html = generateAndroidBridgeHtml({
    phone: cleanPhone,
    text,
    intentUrl,
    apiWhatsAppUrl,
    waMeUrl,
  });

  return reply.status(200).type('text/html').send(html);
}

interface AndroidBridgeHtmlOptions {
  phone: string;
  text: string;
  intentUrl: string;
  apiWhatsAppUrl: string;
  waMeUrl: string;
}

function generateAndroidBridgeHtml(options: AndroidBridgeHtmlOptions): string {
  const { intentUrl, apiWhatsAppUrl, waMeUrl } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Opening WhatsApp...</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #075E54;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      max-width: 380px;
      width: 100%;
      padding: 32px 24px;
      text-align: center;
    }
    .whatsapp-icon {
      width: 64px;
      height: 64px;
      margin-bottom: 20px;
    }
    h1 {
      color: #1a1a1a;
      font-size: 1.4rem;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .subtitle {
      color: #666;
      font-size: 0.95rem;
      margin-bottom: 24px;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e0e0e0;
      border-top-color: #25D366;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 24px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .btn {
      display: block;
      width: 100%;
      padding: 14px 20px;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      margin-bottom: 12px;
      transition: transform 0.1s, box-shadow 0.1s;
    }
    .btn:active {
      transform: scale(0.98);
    }
    .btn-primary {
      background: #25D366;
      color: white;
    }
    .btn-primary:hover {
      background: #128C7E;
    }
    .btn-secondary {
      background: #f5f5f5;
      color: #333;
    }
    .btn-secondary:hover {
      background: #e8e8e8;
    }
    .hidden {
      display: none !important;
    }
    .status {
      color: #666;
      font-size: 0.85rem;
      margin-top: 16px;
    }
    .retry-count {
      color: #999;
      font-size: 0.75rem;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <svg class="whatsapp-icon" viewBox="0 0 24 24" fill="#25D366">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>

    <div id="loading">
      <h1>Opening WhatsApp...</h1>
      <p class="subtitle">Please wait a moment</p>
      <div class="spinner"></div>
      <p class="status" id="status">Attempting to open WhatsApp app...</p>
      <p class="retry-count" id="retry-count"></p>
    </div>

    <div id="manual" class="hidden">
      <h1>Tap to Open WhatsApp</h1>
      <p class="subtitle">If WhatsApp didn't open automatically, tap the button below</p>

      <a href="${escapeHtml(apiWhatsAppUrl)}" class="btn btn-primary" id="open-btn">
        Open WhatsApp
      </a>

      <a href="${escapeHtml(waMeUrl)}" class="btn btn-secondary">
        Try Alternative Link
      </a>

      <p class="status">Don't have WhatsApp? <a href="https://www.whatsapp.com/download" target="_blank">Download it here</a></p>
    </div>
  </div>

  <script>
    (function() {
      var intentUrl = ${JSON.stringify(intentUrl)};
      var apiUrl = ${JSON.stringify(apiWhatsAppUrl)};
      var retryCount = 0;
      var maxRetries = 2;
      var openTimeout = 2500;

      function updateStatus(msg) {
        var el = document.getElementById('status');
        if (el) el.textContent = msg;
      }

      function updateRetryCount() {
        var el = document.getElementById('retry-count');
        if (el && retryCount > 0) {
          el.textContent = 'Attempt ' + (retryCount + 1) + ' of ' + (maxRetries + 1);
        }
      }

      function showManualButtons() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('manual').classList.remove('hidden');
      }

      function tryOpenWhatsApp() {
        updateRetryCount();

        // Try intent:// scheme first (works best on Android Chrome)
        if (retryCount === 0) {
          updateStatus('Opening WhatsApp app...');
          window.location.href = intentUrl;
        }
        // Second attempt: try api.whatsapp.com
        else if (retryCount === 1) {
          updateStatus('Trying alternative method...');
          window.location.href = apiUrl;
        }
        // Give up and show manual buttons
        else {
          showManualButtons();
          return;
        }

        retryCount++;

        // Set timeout to try next method or show buttons
        setTimeout(function() {
          // If we're still on this page, the previous attempt likely failed
          if (document.visibilityState !== 'hidden') {
            if (retryCount <= maxRetries) {
              tryOpenWhatsApp();
            } else {
              showManualButtons();
            }
          }
        }, openTimeout);
      }

      // Handle visibility change (user might have switched to WhatsApp)
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
          // User likely switched apps - success!
        }
      });

      // Handle page show (back button from WhatsApp)
      window.addEventListener('pageshow', function(event) {
        if (event.persisted) {
          // Page was restored from cache (back button)
          showManualButtons();
        }
      });

      // Start the opening process
      setTimeout(tryOpenWhatsApp, 300);
    })();
  </script>
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
