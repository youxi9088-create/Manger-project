import { NextResponse } from 'next/server';
import { ProxyAgent } from 'undici';

function maskKey(key: string) {
    const k = (key || '').trim();
    if (!k) return '';
    if (k.length <= 10) return `${k.slice(0, 2)}***${k.slice(-2)}`;
    return `${k.slice(0, 6)}***${k.slice(-4)}`;
}

function getProxyDispatcher(url: string) {
    const proxy =
        (url.startsWith('https:') ? process.env.HTTPS_PROXY : process.env.HTTP_PROXY) ||
        process.env.HTTPS_PROXY ||
        process.env.HTTP_PROXY;
    if (!proxy) return undefined;
    return new ProxyAgent(proxy);
}

function normalizeEndpoint(baseUrl: string, path: string) {
    const raw = (baseUrl || '').trim();
    if (!raw) return '';
    const noTrail = raw.replace(/\/+$/, '');
    const origin = noTrail.replace(/\/(v1)(\/.*)?$/, '');
    return `${origin}${path}`;
}

async function probeModels(modelsUrl: string, apiKey: string) {
    const r = await fetch(modelsUrl, {
        method: 'GET',
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        dispatcher: getProxyDispatcher(modelsUrl),
        headers: {
            accept: 'application/json',
            authorization: `Bearer ${apiKey}`,
        },
    });
    const text = await r.text();
    let json: any = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = null;
    }
    return { ok: r.ok, status: r.status, body: json ?? text.slice(0, 800) };
}

async function probeChat(chatUrl: string, apiKey: string) {
    const r = await fetch(chatUrl, {
        method: 'POST',
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        dispatcher: getProxyDispatcher(chatUrl),
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'ping' }],
            temperature: 0,
        }),
    });
    const text = await r.text();
    let json: any = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = null;
    }
    return { ok: r.ok, status: r.status, body: json ?? text.slice(0, 800) };
}

async function probeResponses(responsesUrl: string, apiKey: string) {
    const r = await fetch(responsesUrl, {
        method: 'POST',
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        dispatcher: getProxyDispatcher(responsesUrl),
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-5.3-codex',
            stream: false,
            input: [{ role: 'user', content: [{ type: 'input_text', text: 'ping' }] }],
            tools: [],
            text: { format: { type: 'text' }, verbosity: 'low' },
        }),
    });
    const text = await r.text();
    let json: any = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = null;
    }
    return { ok: r.ok, status: r.status, body: json ?? text.slice(0, 800) };
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const probe = url.searchParams.get('probe') || 'models';
    const baseUrl = process.env.OPENAI_BASE_URL || '';
    const apiKey = (process.env.OPENAI_API_KEY || '').trim();

    const modelsUrl = normalizeEndpoint(baseUrl, '/v1/models');
    const chatUrl = normalizeEndpoint(baseUrl, '/v1/chat/completions');
    const responsesUrl = normalizeEndpoint(baseUrl, '/v1/responses');

    if (!modelsUrl) {
        return NextResponse.json({ ok: false, error: 'Missing OPENAI_BASE_URL' }, { status: 400 });
    }
    if (!apiKey) {
        return NextResponse.json({ ok: false, error: 'Missing OPENAI_API_KEY' }, { status: 400 });
    }

    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';

    try {
        const result =
            probe === 'chat'
                ? await probeChat(chatUrl, apiKey)
                : probe === 'responses'
                    ? await probeResponses(responsesUrl, apiKey)
                    : await probeModels(modelsUrl, apiKey);

        return NextResponse.json({
            ok: result.ok,
            status: result.status,
            probe,
            baseUrl,
            endpoints: { modelsUrl, chatUrl, responsesUrl },
            proxy: proxy || undefined,
            apiKey: { present: true, masked: maskKey(apiKey), length: apiKey.length },
            upstream: result.body,
        });
    } catch (e: any) {
        return NextResponse.json(
            {
                ok: false,
                probe,
                baseUrl,
                endpoints: { modelsUrl, chatUrl, responsesUrl },
                proxy: proxy || undefined,
                apiKey: { present: true, masked: maskKey(apiKey), length: apiKey.length },
                error: 'Upstream fetch failed',
                detail: e?.message || String(e),
                cause: e?.cause ? String(e.cause) : undefined,
            },
            { status: 502 },
        );
    }
}
