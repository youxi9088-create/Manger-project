function storeEndpoint() {
    const origin = process.env.OPENCLAW_INTERNAL_STORE_ORIGIN;
    const secret = process.env.OPENCLAW_INTERNAL_STORE_SECRET;
    if (!origin || !secret)
        return null;
    return `${origin}/api/internal/u9-conversations`;
}
export async function listRemoteU9Conversations() {
    const endpoint = storeEndpoint();
    if (!endpoint)
        return [];
    try {
        const response = await fetch(endpoint, {
            headers: { 'x-openclaw-internal-store': process.env.OPENCLAW_INTERNAL_STORE_SECRET || '' },
        });
        if (!response.ok)
            return [];
        const data = await response.json();
        return Array.isArray(data.conversations) ? data.conversations : [];
    }
    catch {
        return [];
    }
}
export async function saveRemoteU9Conversations(conversations) {
    const endpoint = storeEndpoint();
    if (!endpoint || conversations.length === 0)
        return false;
    const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
            'content-type': 'application/json',
            'x-openclaw-internal-store': process.env.OPENCLAW_INTERNAL_STORE_SECRET || '',
        },
        body: JSON.stringify({ conversations }),
    });
    if (!response.ok)
        throw new Error('U9 会话目录持久化失败，请稍后重试。');
    return true;
}
//# sourceMappingURL=u9-conversation-store.js.map