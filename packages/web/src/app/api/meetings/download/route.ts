import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { meetingService } from '@/lib/meeting-service';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const meetingId = searchParams.get('meetingId');
    const format = (searchParams.get('format') || 'audio') as 'audio' | 'video';

    if (!meetingId) {
        return NextResponse.json({ success: false, error: 'missing meetingId' }, { status: 400 });
    }

    // 优先直接读取已落盘文件（process 阶段通常已下载完成），避免再次触发 downloadMedia 导致重复下载/写入。
    const dataDir = process.env.MEETING_DATA_DIR || path.resolve(process.cwd(), '..', '..', 'data', 'meetings');
    const candidates = [
        path.join(dataDir, `${meetingId}_${format}.mp3`),
        path.join(dataDir, `${meetingId}_${format}.m4a`),
        path.join(dataDir, `${meetingId}_${format}.wav`),
        path.join(dataDir, `${meetingId}_${format}.mp4`),
    ];

    let filePath = candidates.find((p) => fs.existsSync(p));

    // 若本地没有，再回退触发服务端下载（落盘）
    if (!filePath) {
        filePath = await meetingService.downloadMedia(meetingId, format);
    }

    if (!filePath || !fs.existsSync(filePath)) {
        return NextResponse.json({ success: false, error: 'file not found', filePath }, { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    const buf = fs.readFileSync(filePath);

    return new NextResponse(buf, {
        status: 200,
        headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(stat.size),
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
            'Cache-Control': 'no-store',
        },
    });
}
