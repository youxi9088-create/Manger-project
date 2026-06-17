import { NextResponse } from 'next/server';
import { meetingService } from '@/lib/meeting-service';

// POST /api/meetings/cleanup { retentionDays?: number }
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const retentionDays = typeof body.retentionDays === 'number' ? body.retentionDays : undefined;

        const result = meetingService.cleanupOldMeetingMedia({ retentionDays });
        return NextResponse.json({ success: true, ...result });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'unknown error' }, { status: 500 });
    }
}
