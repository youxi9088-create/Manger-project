import { NextResponse } from 'next/server';
import { meetingService } from '@/lib/meeting-service';

export async function POST() {
    try {
        // 这里走服务端拉取会议列表（若未登录会返回 mock）
        const records = await meetingService.fetchMeetingListFromWeb();
        return NextResponse.json({ success: true, records });
    } catch (e: any) {
        return NextResponse.json(
            { success: false, error: e?.message || 'unknown error', records: [] },
            { status: 500 },
        );
    }
}
