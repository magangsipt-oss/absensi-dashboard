# Setup Integrasi AS608 Fingerprint Scanner ke Website via Jaringan/IP

Panduan lengkap untuk menghubungkan sensor sidik jari AS608 ke website Anda melalui jaringan atau IP address.

## 📋 Persyaratan

- Arduino/ESP32 dengan sensor AS608 terhubung via serial (COM7)
- Aplikasi Absensi running di `http://localhost:3000`
- Website target sudah memiliki endpoint untuk menerima data fingerprint
- Kedua device berada di jaringan yang sama (untuk IP lokal) atau bisa diakses via internet (untuk IP publik)

## 🚀 Langkah-langkah Setup

### 1. Konfigurasi Serial Port Arduino

1. Buka Admin Dashboard: `http://localhost:3000/admin`
2. Klik **⚙️ Pengaturan** → bagian "Konfigurasi Arduino Serial"
3. Atur:
   - **Serial Port**: COM7 (atau sesuai device Anda)
   - **Baud Rate**: 115200 (standar)
   - **Nama Device**: Arduino Fingerprint (atau nama lainnya)
4. Klik **🔗 Test Koneksi** untuk verifikasi
5. Klik **💾 Simpan Konfigurasi**

### 2. Konfigurasi Website Target

Di halaman yang sama, scroll ke bawah ke section **🌐 Konfigurasi Website Target**:

#### 2a. Masukkan Target URL
- **URL Website Target**: Alamat endpoint website yang akan menerima data fingerprint
  - Format IP lokal: `http://192.168.1.100:3000/api/fingerprint`
  - Format domain: `https://example.com/api/fingerprint-receive`
  - Format IP publik: `http://203.0.113.50:8080/api/fingerprint`

#### 2b. (Opsional) Masukkan API Key
Jika website target membutuhkan autentikasi:
- Masukkan API Key yang disediakan
- Format: Akan dikirim sebagai header `Authorization: Bearer [API_KEY]`

#### 2c. Aktifkan Auto Forward
- Centang **✅ Auto forward data sidik jari ke website target**
- Ini memastikan setiap scan langsung dikirim ke website target

#### 2d. Test Koneksi
- Klik **🔗 Test Koneksi ke Website**
- Sistem akan mengirim test request ke website target
- Jika berhasil, status akan menunjukkan "Reachable"

#### 2e. Simpan
- Klik **💾 Simpan Konfigurasi Target**

## 📡 Format Data yang Dikirim

Ketika AS608 melakukan scan, data akan di-forward ke website target dalam format JSON:

```json
{
  "fingerprintId": "001",
  "deviceName": "Arduino Fingerprint",
  "timestamp": "2026-08-18T10:30:45.123Z",
  "source": "fingerprint-scanner"
}
```

### Header HTTP
```
Content-Type: application/json
Authorization: Bearer [API_KEY] (jika dikonfigurasi)
```

## 💻 Contoh Endpoint di Website Target

### Express.js / Node.js
```javascript
app.post('/api/fingerprint', (req, res) => {
  const { fingerprintId, deviceName, timestamp, source } = req.body;
  
  // Verify API Key if needed
  const authHeader = req.get('Authorization');
  if (process.env.FINGERPRINT_API_KEY) {
    const expectedAuth = `Bearer ${process.env.FINGERPRINT_API_KEY}`;
    if (authHeader !== expectedAuth) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  
  console.log(`Fingerprint received: ${fingerprintId} from ${deviceName}`);
  
  // Process fingerprint data
  // - Lookup employee by fingerprint ID
  // - Record attendance
  // - Update database
  
  res.json({
    success: true,
    message: 'Fingerprint processed',
    fingerprintId
  });
});
```

### Django / Python
```python
from flask import Flask, request, jsonify

@app.route('/api/fingerprint', methods=['POST'])
def receive_fingerprint():
    # Verify API Key
    auth_header = request.headers.get('Authorization', '')
    if app.config.get('FINGERPRINT_API_KEY'):
        expected = f"Bearer {app.config['FINGERPRINT_API_KEY']}"
        if auth_header != expected:
            return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    fingerprint_id = data.get('fingerprintId')
    device_name = data.get('deviceName')
    timestamp = data.get('timestamp')
    
    print(f"Fingerprint received: {fingerprint_id} from {device_name}")
    
    # Process fingerprint data
    # - Lookup employee
    # - Record attendance
    
    return jsonify({
        'success': True,
        'message': 'Fingerprint processed',
        'fingerprintId': fingerprint_id
    }), 200
```

### PHP
```php
<?php
// Verify API Key if needed
if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    if (isset($apiKey)) {
        $expected = "Bearer " . $apiKey;
        if ($authHeader !== $expected) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
    }
}

// Get JSON payload
$data = json_decode(file_get_contents('php://input'), true);

$fingerprintId = $data['fingerprintId'] ?? null;
$deviceName = $data['deviceName'] ?? null;
$timestamp = $data['timestamp'] ?? null;

if (!$fingerprintId) {
    http_response_code(400);
    echo json_encode(['error' => 'Fingerprint ID required']);
    exit;
}

echo json_encode([
    'success' => true,
    'message' => 'Fingerprint processed',
    'fingerprintId' => $fingerprintId
]);
?>
```

## 🔍 Testing & Troubleshooting

### 1. Test Koneksi Endpoint
Gunakan tombol **🔗 Test Koneksi ke Website** di Settings untuk memverifikasi:
- Endpoint URL accessible
- Server merespons
- API Key (jika ada) terverifikasi

### 2. Monitor Logs
- Di aplikasi Absensi: Lihat browser console untuk response
- Di website target: Cek server logs untuk request yang masuk

### 3. Common Issues

#### Status: Unreachable
- Pastikan website target sudah running
- Cek firewall settings
- Verifikasi URL format benar
- Pastikan network connectivity (ping test)

#### Status: 401 Unauthorized
- API Key mungkin salah
- Format authorization header tidak sesuai
- Website target menolak request

#### Fingerprint tidak di-forward
- Pastikan checkbox "Auto forward" sudah dicentang
- Lihat console logs untuk error messages
- Verifikasi AS608 scan berfungsi (test di scan-fingerprint page)

## 🔐 Keamanan

1. **API Key**: Gunakan API key yang kuat jika endpoint publik
2. **HTTPS**: Gunakan HTTPS untuk koneksi ke website public
3. **Validation**: Selalu validasi fingerprint ID di website target
4. **Rate Limiting**: Implementasikan rate limiting jika diperlukan

## 📝 Environment Variable (Optional)

Untuk website target, bisa set API key di environment:

```bash
# .env
FINGERPRINT_API_KEY=your_secure_api_key_here
```

Kemudian set API key yang sama di Settings Admin Dashboard.

## 🎯 Workflow Lengkap

```
1. User scan fingerprint di sensor AS608
   ↓
2. Arduino mengirim SCAN command via serial
   ↓
3. AS608 merespon dengan fingerprint ID (misal: "001")
   ↓
4. Aplikasi Absensi menerima response dari Arduino
   ↓
5. Jika autoForwardData ON: Forward ke website target
   ↓
6. Website target menerima JSON payload
   ↓
7. Website target process data (lookup employee, record attendance)
   ↓
8. Balas response ke Absensi app
   ↓
9. Display hasil ke user (success/error message)
```

## ✅ Checklist Setup

- [ ] Arduino/ESP32 terhubung via serial port
- [ ] AS608 sensor berfungsi
- [ ] Website target sudah setup endpoint `/api/fingerprint`
- [ ] Serial port diatur di Admin Settings
- [ ] Test koneksi serial port berhasil
- [ ] Target URL dimasukkan di Settings
- [ ] (Optional) API Key dikonfigurasi
- [ ] Auto forward checkbox dicentang
- [ ] Test koneksi ke website berhasil
- [ ] Konfigurasi disimpan
- [ ] Test scan fingerprint dan verifikasi data ter-forward

## 📞 Support

Jika mengalami masalah:
1. Cek serial communication di `/app/scan-fingerprint` page
2. Lihat logs di Settings page (status koneksi)
3. Verifikasi network connectivity dengan ping
4. Test endpoint target dengan curl atau Postman
