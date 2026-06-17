import { NextResponse } from 'next/server';
import { ProxyAgent } from 'undici';

function getProxyDispatcher(url: string) {
    // Node 内置 fetch 不会自动读取 HTTP(S)_PROXY，这里显式接入 undici 代理。
    // https 目标优先用 HTTPS_PROXY，其次 HTTP_PROXY。
    const proxy = (url.startsWith('https:') ? process.env.HTTPS_PROXY : process.env.HTTP_PROXY) || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (!proxy) return undefined;
    return new ProxyAgent(proxy);
}

function normalizeChatEndpoint(input?: string | null) {
    const raw = (input ?? '').trim();
    if (!raw) return '';
    const noTrail = raw.replace(/\/+$/, '');
    const noPath = noTrail.replace(/\/(v1)(\/chat\/completions)?$/, '');
    const origin = noPath.replace(/\/(v1\/chat\/completions)$/, '');
    return `${origin}/v1/chat/completions`;
}

const DEFAULT_CHAT_ENDPOINT = normalizeChatEndpoint(process.env.OPENAI_BASE_URL || '');

export async function POST(req: Request) {
    try {
        const body: any = await req.json();

        const headerBaseUrl = req.headers.get('x-base-url') || req.headers.get('x-openai-base-url');
        const endpoint = normalizeChatEndpoint(headerBaseUrl) || DEFAULT_CHAT_ENDPOINT;

        if (!endpoint) {
            return NextResponse.json(
                { error: 'Missing baseUrl: set OPENAI_BASE_URL env or pass x-base-url header.' },
                { status: 400 },
            );
        }

        const apiKey = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || process.env.OPENAI_API_KEY || '';
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Missing API key: set OPENAI_API_KEY env or pass Authorization: Bearer <key>.' },
                { status: 400 },
            );
        }

        let upstream: Response;
        try {
            upstream = await fetch(endpoint, {
                method: 'POST',
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                dispatcher: getProxyDispatcher(endpoint),
                headers: {
                    'content-type': 'application/json',
                    accept: body?.stream ? 'text/event-stream' : 'application/json',
                    authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
            });
        } catch (err: any) {
            return NextResponse.json(
                {
                    error: 'Upstream fetch failed',
                    endpoint,
                    proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || undefined,
                    detail: err?.message || String(err),
                    cause: err?.cause ? String(err.cause) : undefined,
                },
                { status: 502 },
            );
        }

        if (body?.stream) {
            return new NextResponse(upstream.body, {
                status: upstream.status,
                headers: {
                    'content-type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
                    'cache-control': 'no-cache, no-transform',
                    connection: 'keep-alive',
                },
            });
        }

        const contentType = upstream.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await upstream.json();
            return NextResponse.json(data, { status: upstream.status });
        }

        const text = await upstream.text();
        return new NextResponse(text, {
            status: upstream.status,
            headers: { 'content-type': contentType || 'text/plain; charset=utf-8' },
        });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
    }
}
