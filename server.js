const express = require('express');
const app = express();
const path = require('path');

app.use(express.json());
app.use(express.static(__dirname));

let keysDatabase = [];

// เปลี่ยน Prefix การสร้าง Key เป็น RPMODS
function generateLicenseKey(prefix = "RPMODS") {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segment = () => Array.from({length: 4}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    return `${prefix}-${segment()}-${segment()}-${segment()}`;
}

app.post('/api/generate-key', (req, res) => {
    const { count } = req.body;
    let newKeys = [];
    for (let i = 0; i < (count || 1); i++) {
        const keyData = { key: generateLicenseKey(), status: 'active', hwid: null };
        keysDatabase.push(keyData);
        newKeys.push(keyData);
    }
    res.json({ success: true, generatedKeys: newKeys });
});

app.get('/api/dashboard-stats', (req, res) => {
    const total = keysDatabase.length;
    const active = keysDatabase.filter(k => k.status === 'active').length;
    const expired = keysDatabase.filter(k => k.status === 'expired').length;
    const banned = keysDatabase.filter(k => k.status === 'banned').length;
    const freshKeys = keysDatabase.filter(k => k.hwid === null).length;

    res.json({
        total, active, expired, banned, freshKeys,
        avgDevice: total > 0 ? (keysDatabase.filter(k => k.hwid !== null).length / total).toFixed(1) : "0.0"
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RP MODS Server running on port ${PORT}`));
