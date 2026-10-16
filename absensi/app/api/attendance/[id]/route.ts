import { NextResponse, NextRequest } from "next/server";
import { deleteAttendanceRecord } from "../../../../lib/attendance-store";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const recordId = parseInt(id, 10);
    const state = await deleteAttendanceRecord(recordId);
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json({ error: "Gagal menghapus absensi" }, { status: 500 });
  }
}
