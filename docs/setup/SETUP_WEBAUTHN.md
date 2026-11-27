Setup WebAuthn (Fingerprint) integration

1) Install dependencies

Run in project root:

```bash
cd d:\Absensi\absensi
npm install @simplewebauthn/server @simplewebauthn/browser
```

2) Update .env.local (or .env)

Add these entries (adjust origin/rpid for production domain):

```
WEBAUTHN_ORIGIN=http://localhost:3000
WEBAUTHN_RPID=localhost
```

3) Add Prisma migration

Prisma schema already updated with `WebAuthnCredential` model. Run:

```bash
npx prisma migrate dev --name add_webauthn_credentials
npx prisma generate
```

4) Restart dev server

```bash
npm run dev
```

5) Test

- Open admin: http://localhost:3000/admin
- In "Daftar pegawai aktif" klik "Register Biometric" untuk salah satu pegawai, browser akan tampilkan dialog platform authenticator (Windows Hello / Touch ID / Android).
- Setelah terdaftar, klik "Check-in (Fingerprint)" untuk melakukan check-in.

Notes & Troubleshooting:
- WebAuthn requires secure context: localhost is supported in modern browsers.
- If navigator.credentials is undefined, gunakan Chrome/Edge/Firefox terbaru.
- For production use sessions or a server-side store (Redis) for challenges instead of in-memory global.
- Ensure DATABASE_URL is set and migrations ran before testing.
