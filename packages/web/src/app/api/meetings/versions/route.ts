import { NextResponse } from 'next/server';
import { meetingService } from '@/lib/meeting-service';

// GET /api/meetings/versions?title=...&startTime=...
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const title = searchParams.get('title') || '';
        const startTime = searchParams.get('startTime') || '';

        if (!title || !startTime) {
            return NextResponse.json({ success: false, error: 'missing title/startTime' }, { status: 400 });
        }

        const versions = meetingService.listMeetingResultVersions({ title, startTime });
        return NextResponse.json({ success: true, versions });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'unknown error' }, { status: 500 });
    }
}
