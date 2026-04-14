import { NextRequest, NextResponse } from 'next/server';

/** Express API (must match backend port). Rewrites can break POST bodies in dev; this proxy is reliable. */
const BACKEND = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:5000';

export const dynamic = 'force-dynamic';

function isConnectionRefused(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const o = err as { code?: string; cause?: { code?: string; message?: string } };
  if (o.code === 'ECONNREFUSED') return true;
  if (o.cause?.code === 'ECONNREFUSED') return true;
  const msg = String((err as Error).message || o.cause?.message || '');
  return /ECONNREFUSED|fetch failed/i.test(msg);
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const subpath = pathParts.join('/');
  const targetUrl = `${BACKEND}/api/${subpath}${req.nextUrl.search}`;

  const headers: Record<string, string> = {};
  const ct = req.headers.get('content-type');
  if (ct) headers['content-type'] = ct;
  const auth = req.headers.get('authorization');
  if (auth) headers['authorization'] = auth;

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  try {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      const isMultipart = (ct || '').toLowerCase().includes('multipart/form-data');
      init.body = isMultipart ? await req.arrayBuffer() : await req.text();
    }

    const backendRes = await fetch(targetUrl, init);
    const buf = await backendRes.arrayBuffer();
    const out = new NextResponse(buf, { status: backendRes.status });

    const pass = ['content-type', 'content-disposition'];
    for (const h of pass) {
      const v = backendRes.headers.get(h);
      if (v) out.headers.set(h, v);
    }

    return out;
  } catch (err) {
    if (isConnectionRefused(err)) {
      return NextResponse.json(
        {
          success: false,
          code: 'BACKEND_UNAVAILABLE',
          message: 'Service temporarily unavailable. Please try again shortly.',
        },
        { status: 503 }
      );
    }
    throw err;
  }
}

type Ctx = { params: { path: string[] } };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path ?? []);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
