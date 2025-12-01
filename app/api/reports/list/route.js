// file: app/api/reports/list/route.js
import { NextResponse } from 'next/server';
import {
  listQuestionReportsForAdmin as listQuestionReports,
  updateQuestionReportForAdmin as updateQuestionReportStatus,
} from '@/lib/reports.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const limit = Number(searchParams.get('limit') || '100');
    const offset = Number(searchParams.get('offset') || '0');

    const reports = listQuestionReports({ status, limit, offset });

    return NextResponse.json({ reports });
  } catch (err) {
    console.error('GET /api/reports/list error:', err);
    return NextResponse.json(
      { error: '問題不備報告の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// ステータス更新（PUT）
export async function PUT(request) {
  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: 'id と status は必須です' },
        { status: 400 }
      );
    }

    const updated = updateQuestionReportStatus({ id, status });

    return NextResponse.json({ report: updated });
  } catch (err) {
    console.error('PUT /api/reports/list error:', err);
    return NextResponse.json(
      { error: '問題不備報告ステータスの更新に失敗しました' },
      { status: 500 }
    );
  }
}
