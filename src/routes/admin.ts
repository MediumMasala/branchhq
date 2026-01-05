import type { FastifyInstance } from 'fastify';
import { getAllLinks, getLinkBySlug, createLink, updateLink, deactivateLink, deleteLink, slugExists } from '../db/links.js';
import {
  addPhones,
  updatePhoneStatus,
  deletePhone,
  getPhonesWithStats,
} from '../db/phones.js';
import { getStatsForDateRange, getAllLinksStatsForDateRange, DateFilteredStats } from '../db/stats.js';
import { setSecurityHeaders } from '../lib/security.js';
import { linkSchema, generateSlug } from '../lib/validation.js';
import { cleanPhoneNumber } from '../lib/urlBuilder.js';

// IST is UTC+5:30
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function getISTDateRange(filter: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);

  // Get IST date parts
  const istYear = istNow.getUTCFullYear();
  const istMonth = istNow.getUTCMonth();
  const istDay = istNow.getUTCDate();

  let startIST: Date;
  let endIST: Date;
  let label: string;

  if (filter === 'yesterday') {
    // Yesterday in IST
    startIST = new Date(Date.UTC(istYear, istMonth, istDay - 1, 0, 0, 0, 0));
    endIST = new Date(Date.UTC(istYear, istMonth, istDay, 0, 0, 0, 0));
    label = 'Yesterday';
  } else if (filter && filter.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Custom date (YYYY-MM-DD format, treated as IST)
    const [year, month, day] = filter.split('-').map(Number);
    startIST = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    endIST = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
    label = filter;
  } else {
    // Default: Today in IST
    startIST = new Date(Date.UTC(istYear, istMonth, istDay, 0, 0, 0, 0));
    endIST = new Date(Date.UTC(istYear, istMonth, istDay + 1, 0, 0, 0, 0));
    label = 'Today';
  }

  // Convert IST times back to UTC for database query
  const startUTC = new Date(startIST.getTime() - IST_OFFSET_MS);
  const endUTC = new Date(endIST.getTime() - IST_OFFSET_MS);

  return { start: startUTC, end: endUTC, label };
}

export async function adminRoutes(fastify: FastifyInstance) {
  // Apply basic auth to all admin routes
  fastify.addHook('onRequest', fastify.basicAuth);

  // List all campaigns
  // V3: Added date filtering support
  fastify.get<{ Querystring: { date?: string } }>('/admin', async (request, reply) => {
    setSecurityHeaders(reply);
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    const links = await getAllLinks();
    const baseUrl = (process.env.BASE_URL || `${request.protocol}://${request.hostname}`).trim();

    // V3: Get date filter from query params
    const dateFilter = (request.query as { date?: string }).date || 'today';
    const { start, end, label } = getISTDateRange(dateFilter);
    const filteredStatsMap = await getAllLinksStatsForDateRange(start, end);

    return reply.type('text/html').send(generateAdminListHtml(links, baseUrl, filteredStatsMap, dateFilter, label));
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

  // V2: Campaign detail page with phone management
  // V3: Added date filtering support
  fastify.get<{ Params: { slug: string }; Querystring: { date?: string } }>('/admin/:slug', async (request, reply) => {
    setSecurityHeaders(reply);
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    const link = await getLinkBySlug(request.params.slug);
    if (!link) {
      return reply.status(404).send('Campaign not found');
    }

    const phones = await getPhonesWithStats(link.id);
    const baseUrl = (process.env.BASE_URL || `${request.protocol}://${request.hostname}`).trim();

    // V3: Get date filter from query params
    const dateFilter = (request.query as { date?: string }).date || 'today';
    const { start, end, label } = getISTDateRange(dateFilter);
    const filteredStats = await getStatsForDateRange(link.id, start, end);

    return reply.type('text/html').send(generateCampaignDetailHtml(link, phones, baseUrl, filteredStats, dateFilter, label));
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

  // V2: Add phones to campaign
  fastify.post<{ Params: { slug: string }; Body: { phones: string } }>(
    '/admin/:slug/phones',
    async (request, reply) => {
      const link = await getLinkBySlug(request.params.slug);
      if (!link) {
        return reply.status(404).send('Campaign not found');
      }

      const phonesText = request.body.phones || '';
      const phoneNumbers = phonesText
        .split(/[\n,]+/)
        .map((p) => cleanPhoneNumber(p.trim()))
        .filter((p) => p.length >= 7);

      if (phoneNumbers.length > 0) {
        await addPhones(link.id, phoneNumbers);
      }

      return reply.status(302).redirect(`/admin/${request.params.slug}`);
    }
  );

  // V2: Pause phone
  fastify.post<{ Params: { slug: string; phoneId: string } }>(
    '/admin/:slug/phones/:phoneId/pause',
    async (request, reply) => {
      await updatePhoneStatus(request.params.phoneId, 'PAUSED');
      return reply.status(302).redirect(`/admin/${request.params.slug}`);
    }
  );

  // V2: Unpause phone
  fastify.post<{ Params: { slug: string; phoneId: string } }>(
    '/admin/:slug/phones/:phoneId/unpause',
    async (request, reply) => {
      await updatePhoneStatus(request.params.phoneId, 'ACTIVE');
      return reply.status(302).redirect(`/admin/${request.params.slug}`);
    }
  );

  // V2: Delete phone
  fastify.post<{ Params: { slug: string; phoneId: string } }>(
    '/admin/:slug/phones/:phoneId/delete',
    async (request, reply) => {
      await deletePhone(request.params.phoneId);
      return reply.status(302).redirect(`/admin/${request.params.slug}`);
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
    androidRetryClicks: bigint;
    lastClickAt: Date | null;
  } | null;
}

interface PhoneWithStats {
  id: string;
  phoneNumber: string;
  status: string;
  weight: number;
  totalClicks: bigint;
  lastClickAt: Date | null;
  percentShare?: number;
}

function generateAdminListHtml(
  links: LinkWithStats[],
  baseUrl: string,
  filteredStatsMap?: Map<string, DateFilteredStats>,
  dateFilter?: string,
  dateLabel?: string
): string {
  const currentFilter = dateFilter || 'today';
  const currentLabel = dateLabel || 'Today';

  // Get today's date in IST for the date picker max value
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const todayIST = istNow.toISOString().split('T')[0];

  const rows = links
    .map((link) => {
      const shareUrl = `${baseUrl}/r/${link.slug}`;
      const allTimeStats = link.stats;
      const lastClick = allTimeStats?.lastClickAt
        ? new Date(allTimeStats.lastClickAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        : 'Never';

      // Use filtered stats if available, otherwise show 0 for the selected period
      const stats = filteredStatsMap?.get(link.id) || {
        totalClicks: 0,
        humanClicks: 0,
        iosClicks: 0,
        androidClicks: 0,
        desktopClicks: 0,
        androidRetryClicks: 0,
      };

      return `
        <tr class="${link.isActive ? '' : 'inactive'}">
          <td>
            <a href="/admin/${escapeHtml(link.slug)}" class="campaign-link">
              <strong>${escapeHtml(link.campaignName)}</strong>
            </a>
            ${!link.isActive ? '<span class="badge inactive">Inactive</span>' : ''}
          </td>
          <td><code>${escapeHtml(link.slug)}</code></td>
          <td>
            <div class="copy-container">
              <input type="text" value="${escapeHtml(shareUrl)}" readonly class="copy-input" />
              <button onclick="copyToClipboard('${escapeHtml(shareUrl)}')" class="copy-btn">Copy</button>
            </div>
          </td>
          <td class="num">${stats.totalClicks}</td>
          <td class="num">${stats.humanClicks}</td>
          <td class="num platform">${stats.iosClicks}</td>
          <td class="num platform">${stats.androidClicks}</td>
          <td class="num platform">${stats.desktopClicks}</td>
          <td class="num platform highlight-cell">${stats.androidRetryClicks}</td>
          <td class="date">${lastClick}</td>
          <td class="actions">
            <a href="/admin/${escapeHtml(link.slug)}" class="btn btn-sm">Manage</a>
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
    .btn-refresh { background: #10b981; }
    .btn-refresh:hover { background: #059669; }
    .header-actions { display: flex; gap: 10px; }
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
    .campaign-link { color: inherit; text-decoration: none; }
    .campaign-link:hover { color: #4f46e5; }
    .date-filter-container {
      background: white;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .date-filter { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .filter-label { font-weight: 500; color: #374151; }
    .filter-buttons { display: flex; gap: 8px; align-items: center; }
    .filter-btn {
      padding: 8px 16px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      text-decoration: none;
      color: #374151;
      font-size: 14px;
      background: white;
      transition: all 0.2s;
    }
    .filter-btn:hover { background: #f3f4f6; border-color: #9ca3af; }
    .filter-btn.active { background: #4f46e5; color: white; border-color: #4f46e5; }
    .date-input {
      padding: 7px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    }
    .date-input:hover { border-color: #9ca3af; }
    .current-filter { font-size: 14px; color: #6b7280; }
    .current-filter strong { color: #1a1a2e; }
    .highlight-cell { background: #fef3c7; }
    @media (max-width: 1200px) {
      .platform { display: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>BranchHQ Campaigns</h1>
      <div class="header-actions">
        <button onclick="window.location.href='/admin?date=${currentFilter}&t='+Date.now()" class="btn btn-refresh">Refresh</button>
        <a href="/admin/new" class="btn">+ Add New Campaign</a>
      </div>
    </div>

    <!-- Date Filter -->
    <div class="date-filter-container">
      <div class="date-filter">
        <span class="filter-label">Filter by date (IST):</span>
        <div class="filter-buttons">
          <a href="/admin?date=today" class="filter-btn ${currentFilter === 'today' ? 'active' : ''}">Today</a>
          <a href="/admin?date=yesterday" class="filter-btn ${currentFilter === 'yesterday' ? 'active' : ''}">Yesterday</a>
          <input type="date" id="customDate" max="${todayIST}" value="${currentFilter.match(/^\\d{4}-\\d{2}-\\d{2}$/) ? currentFilter : ''}" onchange="if(this.value) window.location.href='/admin?date='+this.value" class="date-input" title="Pick a specific date" />
        </div>
        <span class="current-filter">Showing: <strong>${escapeHtml(currentLabel)}</strong></span>
      </div>
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
          <th class="num platform" title="Android users who tapped the button on the bridge page">Android Retry</th>
          <th>Last Click</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="11" class="empty">No campaigns yet. Create your first one!</td></tr>'}
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

function generateCampaignDetailHtml(
  link: LinkWithStats,
  phones: PhoneWithStats[],
  baseUrl: string,
  filteredStats?: DateFilteredStats,
  dateFilter?: string,
  dateLabel?: string
): string {
  const shareUrl = `${baseUrl}/r/${link.slug}`;
  const stats = link.stats;
  const activePhones = phones.filter((p) => p.status === 'ACTIVE').length;

  // Use filtered stats if provided, otherwise fall back to all-time stats
  const displayStats = filteredStats || {
    totalClicks: Number(stats?.totalClicks || 0),
    humanClicks: Number(stats?.humanClicks || 0),
    iosClicks: Number(stats?.iosClicks || 0),
    androidClicks: Number(stats?.androidClicks || 0),
    desktopClicks: Number(stats?.desktopClicks || 0),
    androidRetryClicks: Number(stats?.androidRetryClicks || 0),
  };

  const currentFilter = dateFilter || 'today';
  const currentLabel = dateLabel || 'Today';

  // Get today's date in IST for the date picker max value
  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const todayIST = istNow.toISOString().split('T')[0];

  const phoneRows = phones
    .map((phone) => {
      const lastClick = phone.lastClickAt
        ? new Date(phone.lastClickAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        : 'Never';
      const isPaused = phone.status === 'PAUSED';

      return `
        <tr class="${isPaused ? 'paused' : ''}">
          <td><code>${escapeHtml(phone.phoneNumber)}</code></td>
          <td>
            <span class="status-badge ${isPaused ? 'paused' : 'active'}">
              ${phone.status}
            </span>
          </td>
          <td class="num">${phone.totalClicks.toString()}</td>
          <td class="num">${phone.percentShare?.toFixed(1) || '0'}%</td>
          <td class="date">${lastClick}</td>
          <td class="actions">
            ${isPaused
              ? `<form method="POST" action="/admin/${escapeHtml(link.slug)}/phones/${phone.id}/unpause" style="display:inline">
                   <button type="submit" class="btn btn-sm btn-success">Activate</button>
                 </form>`
              : `<form method="POST" action="/admin/${escapeHtml(link.slug)}/phones/${phone.id}/pause" style="display:inline">
                   <button type="submit" class="btn btn-sm btn-warning">Pause</button>
                 </form>`
            }
            <form method="POST" action="/admin/${escapeHtml(link.slug)}/phones/${phone.id}/delete" style="display:inline">
              <button type="submit" class="btn btn-sm btn-danger" onclick="return confirm('Delete this phone?')">Delete</button>
            </form>
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
  <title>${escapeHtml(link.campaignName)} - BranchHQ Admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fa;
      padding: 20px;
      color: #333;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1, h2 { color: #1a1a2e; }
    h1 { margin-bottom: 8px; }
    h2 { margin: 24px 0 16px; font-size: 18px; }
    .subtitle { color: #6b7280; margin-bottom: 20px; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
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
    .btn-secondary { background: #6b7280; }
    .btn-secondary:hover { background: #4b5563; }
    .btn-success { background: #10b981; }
    .btn-success:hover { background: #059669; }
    .btn-warning { background: #f59e0b; }
    .btn-warning:hover { background: #d97706; }
    .btn-danger { background: #ef4444; }
    .btn-danger:hover { background: #dc2626; }
    .card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
    }
    .stat-box {
      background: #f9fafb;
      padding: 16px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-value { font-size: 28px; font-weight: 700; color: #1a1a2e; }
    .stat-label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-top: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; }
    td { font-size: 14px; }
    tr:last-child td { border-bottom: none; }
    tr.paused { opacity: 0.6; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .date { font-size: 12px; color: #6b7280; white-space: nowrap; }
    .actions { white-space: nowrap; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
    }
    .status-badge.active { background: #dcfce7; color: #166534; }
    .status-badge.paused { background: #fef3c7; color: #92400e; }
    .form-row { display: flex; gap: 12px; margin-bottom: 16px; align-items: flex-end; }
    .form-group { flex: 1; }
    .form-group label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: #374151;
      font-size: 14px;
    }
    textarea, select, input[type="number"] {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
    }
    textarea { resize: vertical; min-height: 80px; font-family: monospace; }
    .hint { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .config-row {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    }
    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .checkbox-group input { width: auto; }
    .action-buttons { display: flex; gap: 8px; margin-top: 16px; }
    .date-filter { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .filter-label { font-weight: 500; color: #374151; }
    .filter-buttons { display: flex; gap: 8px; align-items: center; }
    .filter-btn {
      padding: 8px 16px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      text-decoration: none;
      color: #374151;
      font-size: 14px;
      background: white;
      transition: all 0.2s;
    }
    .filter-btn:hover { background: #f3f4f6; border-color: #9ca3af; }
    .filter-btn.active { background: #4f46e5; color: white; border-color: #4f46e5; }
    .date-input {
      padding: 7px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    }
    .date-input:hover { border-color: #9ca3af; }
    .current-filter { font-size: 14px; color: #6b7280; }
    .current-filter strong { color: #1a1a2e; }
    .stat-box.highlight { background: #fef3c7; border: 1px solid #fcd34d; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>${escapeHtml(link.campaignName)}</h1>
        <p class="subtitle">
          <code>${escapeHtml(shareUrl)}</code>
        </p>
      </div>
      <div style="display: flex; gap: 10px;">
        <a href="/admin/${escapeHtml(link.slug)}/edit" class="btn btn-secondary">Edit Campaign</a>
        <a href="/admin" class="btn">Back to List</a>
      </div>
    </div>

    <!-- Date Filter -->
    <div class="card" style="margin-bottom: 16px;">
      <div class="date-filter">
        <span class="filter-label">Filter by date (IST):</span>
        <div class="filter-buttons">
          <a href="/admin/${escapeHtml(link.slug)}?date=today" class="filter-btn ${currentFilter === 'today' ? 'active' : ''}">Today</a>
          <a href="/admin/${escapeHtml(link.slug)}?date=yesterday" class="filter-btn ${currentFilter === 'yesterday' ? 'active' : ''}">Yesterday</a>
          <a href="/admin/${escapeHtml(link.slug)}" class="filter-btn ${currentFilter !== 'today' && currentFilter !== 'yesterday' && !currentFilter.match(/^\\d{4}-\\d{2}-\\d{2}$/) ? 'active' : ''}" style="display:none;">All Time</a>
          <input type="date" id="customDate" max="${todayIST}" value="${currentFilter.match(/^\\d{4}-\\d{2}-\\d{2}$/) ? currentFilter : ''}" onchange="if(this.value) window.location.href='/admin/${escapeHtml(link.slug)}?date='+this.value" class="date-input" title="Pick a specific date" />
        </div>
        <span class="current-filter">Showing: <strong>${escapeHtml(currentLabel)}</strong></span>
      </div>
    </div>

    <!-- Stats -->
    <div class="card">
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${displayStats.totalClicks}</div>
          <div class="stat-label">Total Clicks</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${displayStats.humanClicks}</div>
          <div class="stat-label">Human Clicks</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${displayStats.iosClicks}</div>
          <div class="stat-label">iOS Clicks</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${displayStats.androidClicks}</div>
          <div class="stat-label">Android Clicks</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${displayStats.desktopClicks}</div>
          <div class="stat-label">Desktop Clicks</div>
        </div>
        <div class="stat-box highlight">
          <div class="stat-value">${displayStats.androidRetryClicks}</div>
          <div class="stat-label">Android Retry</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${activePhones}</div>
          <div class="stat-label">Active Phones</div>
        </div>
      </div>
    </div>

    <!-- Phone Pool -->
    <h2>Phone Pool</h2>
    <div class="card">
      <form method="POST" action="/admin/${escapeHtml(link.slug)}/phones">
        <div class="form-row">
          <div class="form-group">
            <label for="phones">Add Phone Numbers</label>
            <textarea id="phones" name="phones" placeholder="Enter phone numbers (one per line or comma-separated)&#10;e.g., 919876543210, 919876543211"></textarea>
            <p class="hint">Include country code without + or spaces. Numbers will be added with ACTIVE status.</p>
          </div>
        </div>
        <button type="submit" class="btn">Add Phones</button>
      </form>
    </div>

    ${phones.length > 0 ? `
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Phone Number</th>
            <th>Status</th>
            <th class="num">Clicks</th>
            <th class="num">Share %</th>
            <th>Last Click</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${phoneRows}
        </tbody>
      </table>
    </div>
    ` : '<p style="color: #6b7280; margin-bottom: 20px;">No phones added yet. Add phones above to enable rotation.</p>'}
  </div>
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
          <label for="defaultPhone">Default WhatsApp Phone Number *</label>
          <input type="text" id="defaultPhone" name="defaultPhone" required
            value="${escapeHtml(link?.defaultPhone || '')}"
            placeholder="e.g., 14155551234 (country code + number)" />
          <p class="hint">Fallback phone if no rotation phones configured. Include country code without + or spaces.</p>
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
