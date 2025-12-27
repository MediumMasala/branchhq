# BranchHQ

A universal WhatsApp smart-link redirector with admin dashboard and click tracking.

## Features

- **Platform-aware redirects**: Automatically detects iOS, Android, and Desktop
- **Bot detection**: Serves OpenGraph preview pages to social media crawlers (LinkedIn, Twitter, Facebook, Slack, Discord, WhatsApp, etc.)
- **Android bridge page**: Self-contained Android handler with intent:// support and fallbacks
- **Click tracking**: Aggregated stats per campaign (total, human, by platform)
- **Admin dashboard**: Create and manage campaigns with Basic Auth protection
- **Rate limiting**: Protection against abuse
- **Security headers**: HSTS, CSP, X-Frame-Options, etc.

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Fastify
- **Language**: TypeScript
- **Database**: PostgreSQL (Neon/Supabase/Vercel Postgres)
- **ORM**: Prisma
- **Validation**: Zod
- **Testing**: Vitest
- **Deployment**: Vercel (serverless)

## Project Structure

```
branchhq/
├── api/
│   └── index.ts          # Vercel serverless handler
├── src/
│   ├── server.ts         # Fastify app bootstrap
│   ├── db/
│   │   ├── client.ts     # Prisma client
│   │   ├── links.ts      # Link CRUD operations
│   │   └── stats.ts      # Click tracking
│   ├── routes/
│   │   ├── health.ts     # Health check endpoint
│   │   ├── redirect.ts   # /r/:slug and /preview/:slug
│   │   ├── android.ts    # /a/:slug Android bridge
│   │   └── admin.ts      # Admin dashboard
│   └── lib/
│       ├── platform.ts   # iOS/Android/Desktop detection
│       ├── isBot.ts      # Bot/crawler detection
│       ├── urlBuilder.ts # WhatsApp URL construction
│       ├── preview.ts    # OpenGraph HTML generation
│       ├── validation.ts # Zod schemas
│       ├── security.ts   # Security headers
│       └── hash.ts       # IP hashing for privacy
├── prisma/
│   └── schema.prisma     # Database schema
├── tests/                # Vitest tests
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

## Local Setup

### Prerequisites

- Node.js 20+
- PostgreSQL database (local or cloud)

### Installation

```bash
# Clone and install dependencies
cd branchhq
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your values
# - DATABASE_URL: Your PostgreSQL connection string
# - ADMIN_USER: Admin username
# - ADMIN_PASS: Admin password
# - BASE_URL: Your deployment URL (e.g., http://localhost:3000 for local)

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Start development server
npm run dev
```

The server will start at `http://localhost:3000`.

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `ADMIN_USER` | Admin dashboard username | `admin` |
| `ADMIN_PASS` | Admin dashboard password | `your-secure-password` |
| `BASE_URL` | Public URL for share links | `https://your-domain.com` |
| `NODE_ENV` | Environment | `development` or `production` |
| `ENABLE_CLICK_EVENTS` | Store individual click events | `true` or `false` (default: true) |

## Database Setup

### Using Neon (Recommended for Vercel)

1. Create a free database at [neon.tech](https://neon.tech)
2. Copy the connection string to `DATABASE_URL`
3. Run migrations: `npm run prisma:migrate`

### Using Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to Settings > Database > Connection string
3. Copy the connection string to `DATABASE_URL`
4. Run migrations: `npm run prisma:migrate`

### Using Local PostgreSQL

```bash
# Create database
createdb branchhq

# Set DATABASE_URL
DATABASE_URL="postgresql://localhost:5432/branchhq"

# Run migrations
npm run prisma:migrate
```

## Routes

### Public Routes

| Route | Description |
|-------|-------------|
| `GET /health` | Health check endpoint |
| `GET /r/:slug` | Main redirect entry point |
| `GET /preview/:slug` | Force OpenGraph preview page |
| `GET /a/:slug` | Android bridge page |

### Admin Routes (Basic Auth)

| Route | Description |
|-------|-------------|
| `GET /admin` | List all campaigns |
| `GET /admin/new` | New campaign form |
| `POST /admin/new` | Create campaign |
| `GET /admin/:slug/edit` | Edit campaign form |
| `POST /admin/:slug/edit` | Update campaign |
| `POST /admin/:slug/deactivate` | Soft delete campaign |
| `POST /admin/:slug/delete` | Hard delete campaign |

## How Redirects Work

### Request Flow

```
User clicks: https://your-domain.com/r/summer-sale
                           │
                           ▼
                    ┌─────────────┐
                    │ Bot Check   │
                    └─────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               │               ▼
       Is Bot?            No          Human User
           │                               │
           ▼                               ▼
    Return OG HTML              ┌─────────────────┐
    (preview page)              │ Platform Check  │
                                └─────────────────┘
                                         │
                 ┌───────────────┬───────┴───────┐
                 ▼               ▼               ▼
              iOS           Android          Desktop
                 │               │               │
                 ▼               ▼               ▼
          wa.me link      /a/:slug         web.whatsapp.com
                         (bridge page)
```

### Bot Detection

The system detects these crawlers and serves OG preview pages:

- Social: LinkedIn, Twitter, Facebook, Slack, Discord, WhatsApp, Telegram, Pinterest
- Apple: Applebot, iMessage link previews
- Search: Google, Bing, Baidu, Yandex, DuckDuckGo
- Tools: curl, wget, Postman, Python requests

### Android Bridge Page

The `/a/:slug` page provides a reliable Android experience:

1. First attempts `intent://` scheme (best for Chrome)
2. Falls back to `api.whatsapp.com`
3. Shows manual "Open WhatsApp" button if auto-open fails
4. Provides alternative link to `wa.me`

## Query Parameters

Override defaults per-request:

| Parameter | Description |
|-----------|-------------|
| `phone` | Override default phone number |
| `text` | Override default message text |
| `force` | Set to `1` to skip bot preview page |
| `utm_*` | UTM tracking parameters (preserved) |

Example:
```
https://your-domain.com/r/summer-sale?phone=14155551234&text=Custom%20message
```

## Deployment to Vercel

### Quick Deploy

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables:
   - `DATABASE_URL`
   - `ADMIN_USER`
   - `ADMIN_PASS`
   - `BASE_URL` (your Vercel domain)
4. Deploy!

### Manual Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set production environment variables
vercel env add DATABASE_URL
vercel env add ADMIN_USER
vercel env add ADMIN_PASS
vercel env add BASE_URL

# Deploy to production
vercel --prod
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run typecheck
```

## Creating a Campaign

1. Go to `/admin` and login with your credentials
2. Click "Add New Campaign"
3. Fill in:
   - **Campaign Name**: Human-readable name
   - **Slug**: URL identifier (auto-generated if blank)
   - **Phone Number**: WhatsApp number with country code (no + or spaces)
   - **Pre-filled Message**: Optional default message
   - **OG Fields**: Title, description, image for social previews
4. Click "Create Campaign"
5. Share the link: `https://your-domain.com/r/your-slug`

## Migrating from Old System

This project is designed to run independently alongside your existing redirect service:

1. **Deploy BranchHQ** to a new domain or subdomain
2. **Create campaigns** manually that match your existing slugs
3. **Test thoroughly** with the new URLs
4. **Gradually migrate** links one by one
5. **Update DNS/proxies** when ready for full cutover

No changes needed to your old production system.

## Security Considerations

- **Rate limiting**: 100 requests/minute per IP
- **Admin auth**: HTTP Basic Auth (use strong passwords)
- **IP hashing**: Client IPs are SHA-256 hashed before storage
- **Input validation**: All inputs validated with Zod
- **Security headers**: HSTS, CSP, X-Frame-Options, X-XSS-Protection
- **Redirect whitelist**: Only allows wa.me, api.whatsapp.com, web.whatsapp.com

## License

MIT
