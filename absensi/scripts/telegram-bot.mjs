import { Telegraf } from "telegraf";
import { PrismaClient } from "@prisma/client";

const token = process.env.TELEGRAM_BOT_TOKEN;
const prisma = new PrismaClient();

if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN first.");
  process.exit(1);
}

const bot = new Telegraf(token);
const registrationSessions = new Map();

function guard(handler) {
  return async (ctx) => {
    try {
      await handler(ctx);
    } catch (error) {
      console.error("Telegram command error:", error);
      await ctx.reply("Terjadi kesalahan saat memproses perintah. Coba lagi.");
    }
  };
}

bot.start(guard(async (ctx) => {
  await ctx.reply("Klik /daftar untuk daftar.");
}));

bot.command("daftar", guard(async (ctx) => {
  registrationSessions.set(String(ctx.chat.id), { step: "fingerprintId" });
  await ctx.reply("Daftarkan jari dulu di alat. Setelah ID muncul di layar alat, kirim Fingerprint ID tersebut.");
}));

bot.on("text", guard(async (ctx) => {
  const session = registrationSessions.get(String(ctx.chat.id));
  if (!session) return;

  const value = ctx.message.text.trim();
  if (!value || value.startsWith("/")) return;

  if (session.step === "name") {
    session.name = value;
    session.step = "email";
    await ctx.reply("Kirim email pegawai.");
    return;
  }

  if (session.step === "fingerprintId") {
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 127) {
      await ctx.reply("Fingerprint ID harus angka 1 sampai 127.");
      return;
    }
    const fingerprintId = Number(value);
    const mapping = await prisma.fingerprintMapping.findUnique({ where: { templateId: fingerprintId } });
    if (!mapping) {
      await ctx.reply(`Fingerprint ID ${fingerprintId} belum ada di localhost. Daftarkan jari di alat terlebih dahulu.`);
      return;
    }
    if (mapping.employeeId) {
      await ctx.reply(`Fingerprint ID ${fingerprintId} sudah terhubung ke karyawan.`);
      registrationSessions.delete(String(ctx.chat.id));
      return;
    }
    session.fingerprintId = fingerprintId;
    session.step = "name";
    await ctx.reply("ID ditemukan. Sekarang kirim nama lengkap karyawan.");
    return;
  }

  if (session.step === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      await ctx.reply("Format email belum benar. Contoh: nama@perusahaan.com");
      return;
    }
    session.email = value.toLowerCase();
    session.step = "department";
    await ctx.reply("Kirim departemen atau bagian pegawai.");
    return;
  }

  if (session.step === "department") {
    session.department = value;
    session.step = "enrolling";

    const existingEmployee = await prisma.employee.findUnique({ where: { email: session.email } });
    if (existingEmployee) {
      registrationSessions.delete(String(ctx.chat.id));
      await ctx.reply("Email tersebut sudah terdaftar. Gunakan email lain.");
      return;
    }

    try {
      const employee = await prisma.employee.create({
        data: {
          name: session.name,
          email: session.email,
          department: session.department,
        },
      });
      await prisma.fingerprintMapping.upsert({
        where: { templateId: session.fingerprintId },
        create: {
          deviceId: "ESP32-01",
          templateId: session.fingerprintId,
          employeeId: employee.id,
        },
        update: { employeeId: employee.id, deviceId: "ESP32-01" },
      });
      registrationSessions.delete(String(ctx.chat.id));
      await ctx.reply(`Berhasil. ${employee.name} terdaftar dengan Fingerprint ID ${session.fingerprintId}. Data sudah tersimpan di web dan siap digunakan.`);
    } catch (error) {
      registrationSessions.delete(String(ctx.chat.id));
      await ctx.reply(`Pendaftaran gagal: ${error instanceof Error ? error.message : "coba lagi"}`);
    }
  }
}));

bot.catch((error) => console.error("Telegram bot error:", error));

try {
  await bot.telegram.setMyCommands([
    { command: "start", description: "Mulai pendaftaran" },
    { command: "daftar", description: "Daftarkan pegawai dari fingerprint" },
  ]);
} catch (error) {
  console.error("Gagal mendaftarkan menu Telegram:", error);
}

await bot.launch();
console.log("Telegram bot aktif.");

const shutdown = async (signal) => {
  bot.stop(signal);
  await prisma.$disconnect();
  process.exit(0);
};
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
