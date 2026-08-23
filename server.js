const express = require('express');
const app = express();
const path = require('path');

app.use(express.json());
app.use(express.static(__dirname));

// จำลอง Database
let keysDatabase = [];
let usersDatabase = [
    { username: 'admin', password: '123', role: 'admin', maxQuota: Infinity },
    { username: 'reseller1', password: '123', role: 'reseller', maxQuota: 500, createdCount: 0 }
];

function generateLicenseKey(customPrefix = "RPMODS") {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segment = () => Array.from({length: 4}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    const cleanPrefix = customPrefix.trim().toUpperCase().replace(/\s+/g, '-');
    return `${cleanPrefix}-${segment()}-${segment()}`;
}

// 1. API Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = usersDatabase.find(u => u.username === username && u.password === password);
    
    if (!user) {
        return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    
    res.json({
        success: true,
        user: {
            username: user.username,
            role: user.role,
            maxQuota: user.maxQuota,
            createdCount: user.createdCount || 0
        }
    });
});

// 2. API Fetch Keys (ดึงข้อมูลแยกตาม Role)
app.post('/api/keys', (req, res) => {
    const { username, role } = req.body;
    if (role === 'admin') {
        return res.json(keysDatabase);
    }
    // Reseller เห็นเฉพาะคีย์ที่ตัวเองสร้าง
    const resellerKeys = keysDatabase.filter(k => k.createdBy === username);
    res.json(resellerKeys);
});

// 3. API Generate Key (พร้อม Validation กฎของ Reseller)
app.post('/api/generate-key', (req, res) => {
    const { count, type, days, customPrefix, username, role } = req.body;
    const qty = parseInt(count) || 1;
    const durationDays = parseInt(days);

    // ตรวจสอบสิทธิ์และโควตาสำหรับ Reseller
    if (role === 'reseller') {
        const user = usersDatabase.find(u => u.username === username);
        
        // กฎข้อที่ 1: จำกัดความยาว 1, 7, 30 วันเท่านั้น
        const allowedDays = [1, 7, 30];
        if (!allowedDays.includes(durationDays)) {
            return res.status(400).json({ 
                success: false, 
                message: ' Reseller อนุญาตให้สร้างคีย์อายุ 1 วัน, 7 วัน หรือ 30 วัน เท่านั้น!' 
            });
        }

        // กฎข้อที่ 2: จำกัดจำนวนคีย์ไม่เกิน 500 คีย์
        if (user.createdCount + qty > user.maxQuota) {
            return res.status(400).json({ 
                success: false, 
                message: ` โควตาไม่พอ! คุณสร้างไปแล้ว ${user.createdCount}/${user.maxQuota} คีย์ (คงเหลือ ${user.maxQuota - user.createdCount} คีย์)` 
            });
        }

        // อัปเดตยอดโควตาที่ใช้ไป
        user.createdCount += qty;
    }

    let newKeys = [];
    const prefixToUse = customPrefix && customPrefix.trim() !== "" ? customPrefix : "RPMODS";

    for (let i = 0; i < qty; i++) {
        const keyData = {
            id: Date.now() + i,
            key: generateLicenseKey(prefixToUse),
            type: type || 'VIP',
            duration: durationDays,
            status: 'active',
            hwid: 'Unbound',
            createdBy: username,
            createdAt: new Date().toLocaleDateString('th-TH')
        };
        keysDatabase.unshift(keyData);
        newKeys.push(keyData);
    }

    const currentUser = usersDatabase.find(u => u.username === username);
    res.json({ 
        success: true, 
        generatedKeys: newKeys,
        updatedQuota: currentUser ? currentUser.createdCount : null
    });
});

// 4. API Delete Key
app.delete('/api/delete-key/:id', (req, res) => {
    const keyId = parseInt(req.params.id);
    keysDatabase = keysDatabase.filter(k => k.id !== keyId);
    res.json({ success: true });
});

// 5. API Dashboard Stats
app.post('/api/dashboard-stats', (req, res) => {
    const { username, role } = req.body;
    const targetDatabase = role === 'admin' ? keysDatabase : keysDatabase.filter(k => k.createdBy === username);

    const total = targetDatabase.length;
    const active = targetDatabase.filter(k => k.status === 'active').length;
    const expired = targetDatabase.filter(k => k.status === 'expired').length;
    const banned = targetDatabase.filter(k => k.status === 'banned').length;
    const freshKeys = targetDatabase.filter(k => k.hwid === 'Unbound').length;

    const user = usersDatabase.find(u => u.username === username);

    res.json({
        total, active, expired, banned, freshKeys,
        avgDevice: total > 0 ? ((total - freshKeys) / total).toFixed(1) : "0.0",
        quotaUsed: user ? user.createdCount : total,
        quotaMax: user ? user.maxQuota : Infinity
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RP MODS Dashboard running on port ${PORT}`));
