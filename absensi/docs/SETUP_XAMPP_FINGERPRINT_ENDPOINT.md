# 📝 Setup XAMPP untuk Menerima Data Fingerprint AS608

Panduan lengkap untuk setup website target di XAMPP agar bisa menerima data sidik jari dari sensor AS608.

---

## 🎯 Tujuan Setup

Setup XAMPP agar:
- ✅ Bisa menerima request HTTP dari AS608
- ✅ Process data fingerprint
- ✅ Record attendance atau simpan ke database
- ✅ Reply response ke AS608

---

## 📋 Persyaratan

- [x] XAMPP sudah terinstall (Apache + MySQL + PHP)
- [x] XAMPP sudah running
- [x] Aplikasi Absensi sudah running (localhost:3000)
- [x] COM port Arduino sudah configured
- [x] Tahu nama folder project XAMPP

---

## 🚀 Langkah-Langkah Setup

### **Langkah 1: Pastikan XAMPP Running**

1. **Buka XAMPP Control Panel**
   ```
   Windows: Start → XAMPP Control Panel
   atau
   Klik: C:\xampp\xampp-control.exe
   ```

2. **Cek status Apache dan MySQL**
   ```
   ✅ Apache      [Start] ← Klik jika belum running
   ✅ MySQL       [Start] ← Klik jika belum running
   ```

3. **Verifikasi XAMPP Running**
   - Buka browser
   - Ketik: `http://localhost/` atau `http://localhost:80/`
   - Seharusnya muncul halaman XAMPP dashboard

---

### **Langkah 2: Buat Folder Project di XAMPP**

Lokasi folder XAMPP:
- **Windows**: `C:\xampp\htdocs\`

**Buat folder baru untuk project fingerprint:**

```bash
# Di PowerShell atau Command Prompt
cd C:\xampp\htdocs
mkdir fingerprint-api
cd fingerprint-api

# Atau manual: Buka File Explorer
# Navigasi ke C:\xampp\htdocs
# Klik kanan → New Folder → Beri nama "fingerprint-api"
```

---

### **Langkah 3: Buat File PHP Endpoint**

Di folder `C:\xampp\htdocs\fingerprint-api\`, buat file baru:

**Nama file:** `receive.php`

**Isi file:**

```php
<?php
/**
 * Endpoint untuk menerima data sidik jari dari AS608 Scanner
 * 
 * POST /fingerprint-api/receive.php
 * 
 * Request body (JSON):
 * {
 *   "fingerprintId": "001",
 *   "deviceName": "Arduino Fingerprint",
 *   "timestamp": "2026-08-18T10:30:45.123Z",
 *   "source": "fingerprint-scanner"
 * }
 */

// Set header untuk JSON response
header('Content-Type: application/json');

// Enable CORS (allow requests dari IP lain)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Hanya terima POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    // Get JSON body
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    // Handle test connection
    if (isset($data['test']) && $data['test'] === true) {
        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'Connection test successful',
            'timestamp' => date('c')
        ]);
        exit;
    }

    // Validasi API Key (jika dikonfigurasi)
    $apiKey = getenv('FINGERPRINT_API_KEY'); // Dari .env atau environment variable
    if (!empty($apiKey)) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        $expectedAuth = 'Bearer ' . $apiKey;
        
        if ($authHeader !== $expectedAuth) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized - Invalid API Key']);
            exit;
        }
    }

    // Validasi data
    if (empty($data['fingerprintId'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Fingerprint ID is required']);
        exit;
    }

    $fingerprintId = $data['fingerprintId'];
    $deviceName = $data['deviceName'] ?? 'Unknown Device';
    $timestamp = $data['timestamp'] ?? date('c');
    $source = $data['source'] ?? 'unknown';

    // ========== PROCESS FINGERPRINT DATA ==========
    // TODO: Implement your logic here:
    // 1. Connect ke database MySQL
    // 2. Lookup employee berdasarkan fingerprintId
    // 3. Record attendance
    // 4. Update employee status
    // ============================================

    // Contoh: Logging ke file untuk testing
    $logFile = __DIR__ . '/fingerprint-log.txt';
    $logEntry = sprintf(
        "[%s] ID: %s | Device: %s | Source: %s\n",
        date('Y-m-d H:i:s'),
        $fingerprintId,
        $deviceName,
        $source
    );
    file_put_contents($logFile, $logEntry, FILE_APPEND);

    // Contoh: Simpan ke file JSON
    $dataFile = __DIR__ . '/fingerprints.json';
    $allData = file_exists($dataFile) ? json_decode(file_get_contents($dataFile), true) : [];
    $allData[] = [
        'fingerprintId' => $fingerprintId,
        'deviceName' => $deviceName,
        'timestamp' => $timestamp,
        'source' => $source,
        'receivedAt' => date('c')
    ];
    file_put_contents($dataFile, json_encode($allData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

    // Response sukses
    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => 'Fingerprint data received successfully',
        'fingerprintId' => $fingerprintId,
        'timestamp' => date('c')
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Internal server error',
        'message' => $e->getMessage()
    ]);
}
?>
```

---

### **Langkah 4: Buat File index.php (Dashboard)**

**Nama file:** `index.php` (di folder sama: `C:\xampp\htdocs\fingerprint-api\`)

**Isi file:**

```php
<?php
/**
 * Simple Dashboard untuk monitor fingerprint data
 */
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fingerprint API Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .header h1 {
            color: #333;
            margin-bottom: 5px;
        }
        .header p {
            color: #666;
            font-size: 14px;
        }
        .status-box {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .status-card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .status-card h3 {
            color: #667eea;
            font-size: 14px;
            margin-bottom: 10px;
            text-transform: uppercase;
        }
        .status-card .value {
            font-size: 32px;
            font-weight: bold;
            color: #333;
        }
        .status-card.success {
            border-left: 4px solid #10b981;
        }
        .status-card.warning {
            border-left: 4px solid #f59e0b;
        }
        .logs {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .logs h2 {
            color: #333;
            margin-bottom: 15px;
        }
        .log-item {
            padding: 10px;
            border-bottom: 1px solid #eee;
            font-size: 13px;
            font-family: 'Courier New', monospace;
            color: #666;
        }
        .log-item:last-child {
            border-bottom: none;
        }
        .log-item .time {
            color: #667eea;
            font-weight: bold;
        }
        .log-item .id {
            color: #10b981;
        }
        .button {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            margin-top: 10px;
        }
        .button:hover {
            background: #764ba2;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 Fingerprint API Dashboard</h1>
            <p>Monitor data sidik jari yang diterima dari AS608 Scanner</p>
        </div>

        <div class="status-box">
            <div class="status-card success">
                <h3>Status</h3>
                <div class="value">🟢 Online</div>
            </div>
            <div class="status-card">
                <h3>Total Data</h3>
                <div class="value">
                    <?php
                    $dataFile = __DIR__ . '/fingerprints.json';
                    $count = 0;
                    if (file_exists($dataFile)) {
                        $data = json_decode(file_get_contents($dataFile), true);
                        $count = count($data);
                    }
                    echo $count;
                    ?>
                </div>
            </div>
            <div class="status-card">
                <h3>Endpoint</h3>
                <div class="value" style="font-size: 14px;">
                    POST /fingerprint-api/receive.php
                </div>
            </div>
        </div>

        <div class="logs">
            <h2>📋 Recent Fingerprint Logs</h2>
            <?php
            $logFile = __DIR__ . '/fingerprint-log.txt';
            if (file_exists($logFile)) {
                $logs = array_reverse(file($logFile, FILE_IGNORE_NEW_LINES));
                $logs = array_slice($logs, 0, 20); // Show last 20 entries

                foreach ($logs as $log) {
                    echo '<div class="log-item">' . htmlspecialchars($log) . '</div>';
                }
            } else {
                echo '<div class="log-item">Belum ada data fingerprint diterima</div>';
            }
            ?>
            
            <button class="button" onclick="location.reload()">🔄 Refresh</button>
            <button class="button" onclick="clearLogs()" style="background: #ef4444;">🗑️ Clear Logs</button>
        </div>
    </div>

    <script>
        function clearLogs() {
            if (confirm('Yakin ingin menghapus semua logs?')) {
                fetch('clear-logs.php', { method: 'POST' })
                    .then(r => r.json())
                    .then(d => {
                        alert('Logs cleared');
                        location.reload();
                    });
            }
        }

        // Auto refresh setiap 5 detik
        setInterval(() => {
            location.reload();
        }, 5000);
    </script>
</body>
</html>
```

---

### **Langkah 5: Buat File clear-logs.php**

**Nama file:** `clear-logs.php`

```php
<?php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $logFile = __DIR__ . '/fingerprint-log.txt';
    $dataFile = __DIR__ . '/fingerprints.json';
    
    if (file_exists($logFile)) {
        unlink($logFile);
    }
    if (file_exists($dataFile)) {
        unlink($dataFile);
    }
    
    echo json_encode(['success' => true, 'message' => 'Logs cleared']);
} else {
    echo json_encode(['error' => 'Method not allowed']);
}
?>
```

---

### **Langkah 6: Test Endpoint**

**Buka browser dan test:**

1. **Buka Dashboard:**
   ```
   http://localhost/fingerprint-api/
   ```
   Seharusnya muncul dashboard dengan status "Online"

2. **Test koneksi dari Absensi App:**
   - Buka: `http://localhost:3000/admin/settings`
   - Di bagian **"Konfigurasi Website Target"**
   - Masukkan URL: `http://localhost/fingerprint-api/receive.php`
   - (Opsional) Masukkan API Key jika diperlukan
   - Centang **"Auto forward data"**
   - Klik **"🔗 Test Koneksi ke Website"**
   - Seharusnya status berubah ke **"Reachable"** ✅

---

### **Langkah 7: Configure XAMPP untuk Akses dari IP Lokal**

**Jika ingin akses dari device lain di jaringan yang sama:**

1. **Buka file konfigurasi Apache:**
   ```
   C:\xampp\apache\conf\httpd.conf
   ```

2. **Cari section berikut dan ubah:**
   ```
   # SEBELUM:
   Listen 80
   
   # SESUDAH (akses dari IP lokal):
   Listen 0.0.0.0:80
   
   # ATAU set IP spesifik:
   Listen 192.168.1.100:80
   ```

3. **Restart Apache** di XAMPP Control Panel

4. **Test akses dari device lain:**
   ```
   http://192.168.1.100/fingerprint-api/
   http://10.88.133.108/fingerprint-api/  (ganti dengan IP device Anda)
   ```

---

## 📝 Struktur Folder XAMPP

Setelah setup, struktur folder:

```
C:\xampp\
├── htdocs\
│   ├── index.php (default XAMPP dashboard)
│   ├── fingerprint-api\          ← NEW
│   │   ├── index.php             ← Dashboard
│   │   ├── receive.php           ← Main endpoint
│   │   ├── clear-logs.php        ← Clear logs helper
│   │   ├── fingerprint-log.txt   ← Auto-created log file
│   │   └── fingerprints.json     ← Auto-created data file
```

---

## 🔐 Security Tips

### 1️⃣ Protect dengan API Key

**Edit receive.php**, uncomment API Key validation:

```php
// Uncomment di receive.php
$apiKey = 'your-secret-key-here';
if (!empty($apiKey)) {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $expectedAuth = 'Bearer ' . $apiKey;
    
    if ($authHeader !== $expectedAuth) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
}
```

Kemudian set di Absensi Settings dengan API Key yang sama.

### 2️⃣ Validate Origin

```php
// Di receive.php, tambah:
$allowedOrigins = ['http://localhost:3000', 'http://192.168.1.100:3000'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (!in_array($origin, $allowedOrigins)) {
    http_response_code(403);
    exit;
}
```

### 3️⃣ Rate Limiting

```php
// Limit 100 requests per minute per IP
$ip = $_SERVER['REMOTE_ADDR'];
$file = sys_get_temp_dir() . '/rate-limit-' . md5($ip) . '.txt';
// ... implement rate limiting logic
```

---

## 📊 Contoh Database Integration

**Jika ingin simpan ke MySQL:**

```php
<?php
// connection.php
$mysqli = new mysqli("localhost", "root", "", "absensi_db");

if ($mysqli->connect_error) {
    die("Connection failed: " . $mysqli->connect_error);
}

// Dalam receive.php:
$fingerprintId = $data['fingerprintId'];
$query = "SELECT * FROM employees WHERE fingerprint_id = ?";
$stmt = $mysqli->prepare($query);
$stmt->bind_param("s", $fingerprintId);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows > 0) {
    $employee = $result->fetch_assoc();
    // Record attendance
    $sql = "INSERT INTO attendance (employee_id, status, jam, method) VALUES (?, ?, NOW(), 'fingerprint')";
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param("is", $employee['id'], "hadir");
    $stmt->execute();
}
?>
```

---

## 🆘 Troubleshooting

### ❌ "Cannot access http://localhost/fingerprint-api/"

**Solusi:**
1. Pastikan Apache running di XAMPP
2. Pastikan folder `fingerprint-api` ada di `C:\xampp\htdocs\`
3. Pastikan file `index.php` ada di dalam folder
4. Restart Apache

### ❌ "403 Forbidden"

**Solusi:**
1. Cek permission folder di Windows
2. Klik kanan folder → Properties → Security → Edit
3. Beri Full Control untuk user

### ❌ "500 Internal Server Error"

**Solusi:**
1. Cek PHP error log: `C:\xampp\apache\logs\error.log`
2. Buka halaman error lebih detail dengan menambah di receive.php:
   ```php
   error_reporting(E_ALL);
   ini_set('display_errors', 1);
   ```

### ❌ Data tidak diterima dari AS608

**Solusi:**
1. Cek network connectivity antara AS608 device dan PC
2. Ping test dari CMD: `ping 192.168.1.100`
3. Cek firewall Windows - allow port 80
4. Test manual dengan cURL:
   ```bash
   curl -X POST http://localhost/fingerprint-api/receive.php \
     -H "Content-Type: application/json" \
     -d '{"fingerprintId":"001","deviceName":"test"}'
   ```

---

## ✅ Checklist Setup XAMPP

- [ ] XAMPP terinstall dan running
- [ ] Apache & MySQL running
- [ ] Buka http://localhost/ → berhasil
- [ ] Folder `fingerprint-api` dibuat di `C:\xampp\htdocs\`
- [ ] File `receive.php` dibuat di folder tersebut
- [ ] File `index.php` (dashboard) dibuat
- [ ] Buka http://localhost/fingerprint-api/ → dashboard muncul
- [ ] Buka Absensi Settings → masukkan URL target
- [ ] Test koneksi dari Absensi → berhasil
- [ ] Simpan konfigurasi website target

---

## 🚀 Next Steps

1. **Setup database MySQL** (jika belum):
   - Buka phpMyAdmin: http://localhost/phpmyadmin/
   - Buat database baru
   - Import schema untuk employees, attendance, fingerprints

2. **Integrate dengan database**:
   - Update receive.php untuk query database
   - Implement employee lookup dan attendance recording

3. **Test end-to-end**:
   - Scan fingerprint di AS608
   - Cek apakah data diterima di XAMPP dashboard
   - Cek apakah data tercatat di database

4. **Monitor & logging**:
   - Cek file log untuk debugging
   - Setup alert jika ada error
   - Monitor performance

---

**Semoga berhasil setup XAMPP! Jika ada pertanyaan, jangan ragu untuk bertanya.** 🎉
