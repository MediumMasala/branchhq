import type { FastifyInstance } from 'fastify';
import { getAllLinks, getLinkBySlug, createLink, updateLink, deactivateLink, deleteLink, slugExists } from '../db/links.js';
import { setSecurityHeaders } from '../lib/security.js';
import { linkSchema, generateSlug } from '../lib/validation.js';

export async function adminRoutes(fastify: FastifyInstance) {
  // Apply basic auth to all admin routes
  fastify.addHook('onRequest', fastify.basicAuth);

  // List all campaigns
  fastify.get('/admin', async (request, reply) => {
    setSecurityHeaders(reply);
    const links = await getAllLinks();
    const baseUrl = process.env.BASE_URL || `${request.protocol}://${request.hostname}`;
    return reply.type('text/html').send(generateAdminListHtml(links, baseUrl));
  });

  // New campaign form
  fastify.get('/admin/new', async (_request, reply) => {
    setSecurityHeaders(reply);
    return reply.type('text/html').send(generateAdminFormHtml(null, null));
  });

  // Create campaign
  fastify.post<{ Body: Record<string, string> }>('/admin/new', async (request, reply) => {
    setSecurityHeaders(reply);

    try {
      const body = request.body;

      // Auto-generate slug if not provided
      let slug = body.slug?.trim();
      if (!slug && body.campaignName) {
        slug = generateSlug(body.campaignName);
      }

      // Check if slug exists
      if (slug && await slugExists(slug)) {
        return reply.type('text/html').send(
          generateAdminFormHtml(null, 'A campaign with this slug already exists')
        );
      }

      const data = linkSchema.parse({
        slug,
        campaignName: body.campaignName,
        defaultPhone: body.defaultPhone,
        defaultText: body.defaultText || '',
        isActive: body.isActive === 'on' || body.isActive === 'true',
        ogTitle: body.ogTitle || null,
        ogDescription: body.ogDescription || null,
        ogImage: body.ogImage || null,
      });

      await createLink(data);
      return reply.status(302).redirect('/admin');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create campaign';
      return reply.type('text/html').send(generateAdminFormHtml(null, message));
    }
  });

  // Edit campaign form
  fastify.get<{ Params: { slug: string } }>('/admin/:slug/edit', async (request, reply) => {
    setSecurityHeaders(reply);
    const link = await getLinkBySlug(request.params.slug);

    if (!link) {
      return reply.status(404).send('Campaign not found');
    }

    return reply.type('text/html').send(generateAdminFormHtml(link, null));
  });

  // Update campaign
  fastify.post<{ Params: { slug: string }; Body: Record<string, string> }>(
    '/admin/:slug/edit',
    async (request, reply) => {
      setSecurityHeaders(reply);

      try {
        const existingLink = await getLinkBySlug(request.params.slug);
        if (!existingLink) {
          return reply.status(404).send('Campaign not found');
        }

        const body = request.body;

        // Check if new slug conflicts (if changed)
        const newSlug = body.slug?.trim();
        if (newSlug && newSlug !== request.params.slug && await slugExists(newSlug)) {
          return reply.type('text/html').send(
            generateAdminFormHtml(existingLink, 'A campaign with this slug already exists')
          );
        }

        await updateLink(request.params.slug, {
          slug: newSlug || request.params.slug,
          campaignName: body.campaignName,
          defaultPhone: body.defaultPhone,
          defaultText: body.defaultText || '',
          isActive: body.isActive === 'on' || body.isActive === 'true',
          ogTitle: body.ogTitle || null,
          ogDescription: body.ogDescription || null,
          ogImage: body.ogImage || null,
        });

        return reply.status(302).redirect('/admin');
      } catch (err) {
        const existingLink = await getLinkBySlug(request.params.slug);
        const message = err instanceof Error ? err.message : 'Failed to update campaign';
        return reply.type('text/html').send(generateAdminFormHtml(existingLink, message));
      }
    }
  );

  // Deactivate campaign
  fastify.post<{ Params: { slug: string } }>('/admin/:slug/deactivate', async (request, reply) => {
    await deactivateLink(request.params.slug);
    return reply.status(302).redirect('/admin');
  });

  // Delete campaign (hard delete)
  fastify.post<{ Params: { slug: string } }>('/admin/:slug/delete', async (request, reply) => {
    await deleteLink(request.params.slug);
    return reply.status(302).redirect('/admin');
  });
}

interface LinkWithStats {
  id: string;
  slug: string;
  campaignName: string;
  defaultPhone: string;
  defaultText: string;
  isActive: boolean;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  createdAt: Date;
  updatedAt: Date;
  stats: {
    totalClicks: bigint;
    humanClicks: bigint;
    iosClicks: bigint;
    androidClicks: bigint;
    desktopClicks: bigint;
    lastClickAt: Date | null;
  } | null;
}

function generateAdminListHtml(links: LinkWithStats[], baseUrl: string): string {
  const rows = links
    .map((link) => {
      const shareUrl = `${baseUrl}/r/${link.slug}`;
      const stats = link.stats;
      const lastClick = stats?.lastClickAt
        ? new Date(stats.lastClickAt).toLocaleString()
        : 'Never';

      return `
        <tr class="${link.isActive ? '' : 'inactive'}">
          <td>
            <strong>${escapeHtml(link.campaignName)}</strong>
            ${!link.isActive ? '<span class="badge inactive">Inactive</span>' : ''}
          </td>
          <td><code>${escapeHtml(link.slug)}</code></td>
          <td>
            <div class="copy-container">
              <input type="text" value="${escapeHtml(shareUrl)}" readonly class="copy-input" />
              <button onclick="copyToClipboard('${escapeHtml(shareUrl)}')" class="copy-btn">Copy</button>
            </div>
          </td>
          <td class="num">${stats?.totalClicks.toString() || '0'}</td>
          <td class="num">${stats?.humanClicks.toString() || '0'}</td>
          <td class="num platform">${stats?.iosClicks.toString() || '0'}</td>
          <td class="num platform">${stats?.androidClicks.toString() || '0'}</td>
          <td class="num platform">${stats?.desktopClicks.toString() || '0'}</td>
          <td class="date">${lastClick}</td>
          <td class="actions">
            <a href="/admin/${escapeHtml(link.slug)}/edit" class="btn btn-sm">Edit</a>
            ${link.isActive
              ? `<form method="POST" action="/admin/${escapeHtml(link.slug)}/deactivate" style="display:inline">
                   <button type="submit" class="btn btn-sm btn-warning" onclick="return confirm('Deactivate this campaign?')">Disable</button>
                 </form>`
              : `<form method="POST" action="/admin/${escapeHtml(link.slug)}/delete" style="display:inline">
                   <button type="submit" class="btn btn-sm btn-danger" onclick="return confirm('Permanently delete this campaign?')">Delete</button>
                 </form>`
            }
          </td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BranchHQ Admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fa;
      padding: 20px;
      color: #333;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { margin-bottom: 20px; color: #1a1a2e; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .btn {
      display: inline-block;
      padding: 10px 20px;
      background: #4f46e5;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      border: none;
      cursor: pointer;
      font-size: 14px;
    }
    .btn:hover { background: #4338ca; }
    .btn-sm { padding: 6px 12px; font-size: 12px; }
    .btn-warning { background: #f59e0b; }
    .btn-warning:hover { background: #d97706; }
    .btn-danger { background: #ef4444; }
    .btn-danger:hover { background: #dc2626; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; }
    td { font-size: 14px; }
    tr:last-child td { border-bottom: none; }
    tr.inactive { opacity: 0.6; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .date { font-size: 12px; color: #6b7280; white-space: nowrap; }
    .platform { font-size: 12px; }
    .actions { white-space: nowrap; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      margin-left: 8px;
    }
    .badge.inactive { background: #fef3c7; color: #92400e; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    .copy-container { display: flex; gap: 8px; align-items: center; }
    .copy-input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      font-size: 12px;
      min-width: 200px;
      background: #f9fafb;
    }
    .copy-btn {
      padding: 6px 12px;
      background: #e5e7eb;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .copy-btn:hover { background: #d1d5db; }
    .empty { padding: 40px; text-align: center; color: #6b7280; }
    @media (max-width: 1200px) {
      .platform { display: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>BranchHQ Campaigns</h1>
      <a href="/admin/new" class="btn">+ Add New Campaign</a>
    </div>

    <table>
      <thead>
        <tr>
          <th>Campaign</th>
          <th>Slug</th>
          <th>Share Link</th>
          <th class="num">Total</th>
          <th class="num">Human</th>
          <th class="num platform">iOS</th>
          <th class="num platform">Android</th>
          <th class="num platform">Desktop</th>
          <th>Last Click</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="10" class="empty">No campaigns yet. Create your first one!</td></tr>'}
      </tbody>
    </table>
  </div>

  <script>
    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(function() {
        alert('Link copied!');
      }).catch(function() {
        prompt('Copy this link:', text);
      });
    }
  </script>
</body>
</html>`;
}

function generateAdminFormHtml(link: LinkWithStats | null, error: string | null): string {
  const isEdit = !!link;
  const title = isEdit ? 'Edit Campaign' : 'New Campaign';
  const action = isEdit ? `/admin/${link.slug}/edit` : '/admin/new';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - BranchHQ Admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fa;
      padding: 20px;
      color: #333;
    }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { margin-bottom: 20px; color: #1a1a2e; }
    .card {
      background: white;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .form-group { margin-bottom: 20px; }
    label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: #374151;
    }
    input[type="text"], input[type="url"], textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
    }
    input:focus, textarea:focus {
      outline: none;
      border-color: #4f46e5;
      box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
    }
    textarea { resize: vertical; min-height: 80px; }
    .hint { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .checkbox-group input { width: auto; }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }
    .btn {
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 500;
      border: none;
      cursor: pointer;
      font-size: 14px;
      text-decoration: none;
    }
    .btn-primary { background: #4f46e5; color: white; }
    .btn-primary:hover { background: #4338ca; }
    .btn-secondary { background: #e5e7eb; color: #374151; }
    .btn-secondary:hover { background: #d1d5db; }
    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 24px 0 16px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>

    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}

    <div class="card">
      <form method="POST" action="${action}">
        <div class="form-group">
          <label for="campaignName">Campaign Name *</label>
          <input type="text" id="campaignName" name="campaignName" required
            value="${escapeHtml(link?.campaignName || '')}"
            placeholder="e.g., Summer Sale 2024" />
        </div>

        <div class="form-group">
          <label for="slug">Slug</label>
          <input type="text" id="slug" name="slug"
            value="${escapeHtml(link?.slug || '')}"
            placeholder="e.g., summer-sale (auto-generated if blank)" />
          <p class="hint">URL-friendly identifier. Leave blank to auto-generate from campaign name.</p>
        </div>

        <div class="form-group">
          <label for="defaultPhone">WhatsApp Phone Number *</label>
          <input type="text" id="defaultPhone" name="defaultPhone" required
            value="${escapeHtml(link?.defaultPhone || '')}"
            placeholder="e.g., 14155551234 (country code + number)" />
          <p class="hint">Include country code without + or spaces</p>
        </div>

        <div class="form-group">
          <label for="defaultText">Pre-filled Message</label>
          <textarea id="defaultText" name="defaultText"
            placeholder="e.g., Hi! I'm interested in...">${escapeHtml(link?.defaultText || '')}</textarea>
        </div>

        <div class="form-group">
          <div class="checkbox-group">
            <input type="checkbox" id="isActive" name="isActive"
              ${link?.isActive !== false ? 'checked' : ''} />
            <label for="isActive" style="margin: 0;">Active</label>
          </div>
        </div>

        <h3 class="section-title">Social Preview (OpenGraph)</h3>

        <div class="form-group">
          <label for="ogTitle">Preview Title</label>
          <input type="text" id="ogTitle" name="ogTitle"
            value="${escapeHtml(link?.ogTitle || '')}"
            placeholder="Title shown in social media previews" />
        </div>

        <div class="form-group">
          <label for="ogDescription">Preview Description</label>
          <textarea id="ogDescription" name="ogDescription"
            placeholder="Description shown in social media previews">${escapeHtml(link?.ogDescription || '')}</textarea>
        </div>

        <div class="form-group">
          <label for="ogImage">Preview Image URL</label>
          <input type="url" id="ogImage" name="ogImage"
            value="${escapeHtml(link?.ogImage || '')}"
            placeholder="https://example.com/image.jpg" />
          <p class="hint">Recommended size: 1200x630 pixels</p>
        </div>

        <div class="actions">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Update Campaign' : 'Create Campaign'}</button>
          <a href="/admin" class="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </div>
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
