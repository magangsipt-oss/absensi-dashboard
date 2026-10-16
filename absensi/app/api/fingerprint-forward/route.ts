import { NextResponse } from "next/server";
type FingerprintAttendanceStatus = "Hadir" | "Terlambat" | "Pulang";

const attendanceTimeZone = "Asia/Makassar";

function getWitaParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: attendanceTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
}

function getFingerprintAttendanceStatus(date: Date): FingerprintAttendanceStatus | null {
  const { hour, minute } = getWitaParts(date);
  const minutes = hour * 60 + minute;
  if (minutes >= 420 && minutes < 490) return "Hadir";
  if (minutes >= 490 && minutes < 1010) return "Terlambat";
  if (minutes >= 1010 && minutes <= 1140) return "Pulang";
  return null;
}
import { prisma } from "../../../lib/attendance-store";

/**
 * Endpoint untuk menerima data sidik jari yang di-forward dari scanner AS608
 * 
 * Body yang diterima:
 * {
 *   fingerprintId: string,
 *   deviceName: string,
 *   timestamp: string (ISO format),
 *   source: string (e.g., "fingerprint-scanner")
 * }
 */

export async function POST(request: Request) {
  try {
    // Verify API Key if provided
    const authHeader = request.headers.get("Authorization");
    if (authHeader && process.env.FINGERPRINT_API_KEY) {
      const expectedAuth = `Bearer ${process.env.FINGERPRINT_API_KEY}`;
      if (authHeader !== expectedAuth) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    const payload = await request.json();

    // Handle test connection
    if (payload.test) {
      return NextResponse.json({
        success: true,
        message: "Connection test successful",
        timestamp: new Date().toISOString(),
      });
    }

    const { fingerprintId, deviceName, timestamp, source } = payload;

    if (!fingerprintId) {
      return NextResponse.json(
        { error: "Fingerprint ID is required" },
        { status: 400 }
      );
    }

    // Log fingerprint scan
    console.log(
      `[${new Date().toISOString()}] Fingerprint received from ${deviceName || "Unknown Device"}:`,
      {
        fingerprintId,
        deviceName,
        timestamp,
        source,
      }
    );

    // Try to find attendance record by fingerprint ID
    try {
      const scanTime = new Date(timestamp || Date.now());
      const attendanceStatus = getFingerprintAttendanceStatus(scanTime);
      if (!attendanceStatus) {
        return NextResponse.json({
          error: "Waktu scan di luar jadwal absensi WITA (07:00-08:09 hadir, 08:10-16:49 terlambat, atau 16:50-19:00 pulang).",
        }, { status: 400 });
      }
      
      // Handle both string fingerprint IDs (TEST-XXXXX) and numeric template IDs (001, 999, etc)
      let templateId: number | string = fingerprintId;
      
      // Try to parse as integer if it looks numeric
      if (/^\d+$/.test(fingerprintId)) {
        templateId = Number(fingerprintId);
      }
      
      // For test mode (TEST-XXXXX), create test attendance record
      if (typeof templateId === 'string' && templateId.startsWith('TEST-')) {
        // In test mode, create a test attendance record for demo purposes
        const testEmployee = await prisma.employee.findFirst();
        if (!testEmployee) {
          return NextResponse.json(
            {
              success: false,
              message: "No employees found. Please add an employee first.",
              fingerprintId,
            },
            { status: 404 }
          );
        }
        
        const testAttendance = await prisma.attendanceRecord.create({
          data: {
            employeeId: testEmployee.id,
            name: testEmployee.name,
            time: scanTime.toLocaleTimeString("id-ID", {
              timeZone: attendanceTimeZone,
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }),
            status: "Hadir",
            note: `Test fingerprint scan from ${deviceName || "test device"}`,
            checkedAt: scanTime,
          },
        });
        
        // Log test verification
        await prisma.fingerprintVerificationLog.create({
          data: {
            employeeId: testEmployee.id,
            deviceId: deviceName || "test-device",
            templateId: 0,
            status: "Berhasil (TEST)",
            note: `Test scan for ${testEmployee.name}`,
            verifiedAt: scanTime,
          },
        });
        
        return NextResponse.json(
          {
            success: true,
            message: "Test fingerprint recorded successfully",
            employeeName: testEmployee.name,
            attendanceId: testAttendance.id,
            timestamp: testAttendance.checkedAt,
            isTest: true,
          },
          { status: 201 }
        );
      }
      
      // For production mode (numeric template ID)
      const mapping = await prisma.fingerprintMapping.findUnique({
        where: { templateId: templateId as number },
      });

      if (mapping && mapping.employeeId !== null && mapping.employeeId !== undefined) {
        const employee = await prisma.employee.findUnique({
          where: { id: mapping.employeeId },
        });

        const startOfToday = new Date(scanTime);
        startOfToday.setHours(0, 0, 0, 0);
        const startOfTomorrow = new Date(startOfToday);
        startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
        const recentAttendance = await prisma.attendanceRecord.findFirst({
          where: {
            employeeId: mapping.employeeId,
            status: {
              in: (attendanceStatus === "Pulang" ? ["Pulang"] : ["Hadir", "Terlambat"]) as never,
            },
            checkedAt: { gte: startOfToday, lt: startOfTomorrow },
          },
          orderBy: {
            checkedAt: "desc",
          },
        });

        if (recentAttendance) {
          // Log duplikat ke verification log
          await prisma.fingerprintVerificationLog.create({
            data: {
              employeeId: mapping.employeeId,
              deviceId: deviceName,
              templateId: templateId as number,
              status: `${attendanceStatus} (Duplikat diblokir)`,
              note: `${attendanceStatus} sudah tercatat hari ini`,
              verifiedAt: scanTime,
            },
          });

          return NextResponse.json(
            {
              success: true,
              message: `${attendanceStatus} sudah tercatat hari ini`,
              employeeName: employee?.name ?? "Unknown Employee",
              attendanceId: recentAttendance.id,
              skipped: true,
              timestamp: recentAttendance.checkedAt,
            },
            { status: 200 }
          );
        }

        const newAttendance = await prisma.attendanceRecord.create({
          data: {
            employeeId: employee?.id ?? mapping.employeeId,
            name: employee?.name ?? "Unknown Employee",
            time: scanTime.toLocaleTimeString("id-ID", {
              timeZone: attendanceTimeZone,
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }),
            status: attendanceStatus as never,
            note: "-",
            checkedAt: scanTime,
          },
        });

        // Log successful verification
        await prisma.fingerprintVerificationLog.create({
          data: {
            employeeId: mapping.employeeId,
            deviceId: deviceName,
            templateId: templateId as number,
            status: attendanceStatus,
            note: `Terverifikasi dari ${deviceName || "unknown device"}`,
            verifiedAt: scanTime,
          },
        });

        return NextResponse.json(
          {
            success: true,
            message: "Fingerprint recognized and attendance recorded",
            employeeName: employee?.name ?? "Unknown Employee",
            attendanceId: newAttendance.id,
            timestamp: newAttendance.checkedAt,
          },
          { status: 201 }
        );
      }

      // Fingerprint not registered
      const unregisteredLog = await prisma.fingerprintVerificationLog.create({
        data: {
          employeeId: null,
          deviceId: deviceName,
          templateId: typeof templateId === 'number' ? templateId : 0,
          status: "Tidak terdaftar",
          note: "Template ID tidak ditemukan di database",
          verifiedAt: scanTime,
        },
      });

      return NextResponse.json(
        {
          success: false,
          message: "Fingerprint not registered",
          fingerprintId,
          action: "Please register this fingerprint first",
        },
        { status: 404 }
      );
    } catch (dbError) {
      console.error("Database error:", dbError);
      // If database error, still acknowledge receipt
      return NextResponse.json(
        {
          success: true,
          message: "Fingerprint data received (database unavailable)",
          fingerprintId,
          warning: "Could not record in database",
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error("Error in fingerprint forward endpoint:", error);
    return NextResponse.json(
      {
        error: "Failed to process fingerprint data",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint untuk health check
 */
export async function GET() {
  return NextResponse.json({
    status: "online",
    endpoint: "/api/fingerprint-forward",
    method: "POST",
    description: "Endpoint untuk menerima data sidik jari dari AS608",
    timestamp: new Date().toISOString(),
  });
}
