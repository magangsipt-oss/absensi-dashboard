import { NextResponse, NextRequest } from "next/server";
import { deleteAttendanceRecord } from "../../../../lib/attendance-store";
import { assertProductionDatabaseTarget } from "../../../../lib/database-safety";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertProductionDatabaseTarget();
    if (request.headers.get("x-confirm-delete") !== "DELETE_SINGLE_ATTENDANCE_RECORD") {
      return NextResponse.json(
        { error: "Konfirmasi penghapusan absensi tidak valid." },
        { status: 400 }
      );
    }
    const { id } = await params;
    const recordId = parseInt(id, 10);
    if (!Number.isInteger(recordId) || recordId < 1) {
      return NextResponse.json({ error: "ID absensi tidak valid." }, { status: 400 });
    }
    const state = await deleteAttendanceRecord(recordId);
    return NextResponse.json(state);
  } catch (error) {
    console.error("Error deleting attendance record:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal menghapus absensi." },
      { status: 500 }
    );
  }
}
