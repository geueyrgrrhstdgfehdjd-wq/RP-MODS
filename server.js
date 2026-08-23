const express = require('express');
const app = express();
const path = require('path');

app.use(express.json());
app.use(express.static(__dirname));

let keysDatabase = [];

function generateLicenseKey(customPrefix = "RPMODS") {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segment = () => Array.from({length: 4}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    const cleanPrefix = customPrefix.trim().toUpperCase().replace(/\s+/g, '-');
    return `${cleanPrefix}-${segment()}-${segment()}`;
}

app.get('/api/keys', (req, res) => {
    res.json(keysDatabase);
});

app.post('/api/generate-key', (req, res) => {
    const { count, type, days, customPrefix } = req.body;
    let newKeys = [];
    const prefixToUse = customPrefix && customPrefix.trim() !== "" ? customPrefix : "RPMODS";

    for (let i = 0; i < (count || 1); i++) {
        const keyData = {
            id: Date.now() + i,
            key: generateLicenseKey(prefixToUse),
            type: type || 'VIP',
            duration: days || 30,
            status: 'active',
            hwid: 'Unbound',
            createdAt: new Date().toLocaleDateString('th-TH')
        };
        keysDatabase.unshift(keyData);
        newKeys.push(keyData);
    }
    res.json({ success: true, generatedKeys: newKeys });
});

app.delete('/api/delete-key/:id', (req, res) => {
    const keyId = parseInt(req.params.id);
    keysDatabase = keysDatabase.filter(k => k.id !== keyId);
    res.json({ success: true });
});

app.get('/api/dashboard-stats', (req, res) => {
    const total = keysDatabase.length;
    const active = keysDatabase.filter(k => k.status === 'active').length;
    const expired = keysDatabase.filter(k => k.status === 'expired').length;
    const banned = keysDatabase.filter(k => k.status === 'banned').length;
    const freshKeys = keysDatabase.filter(k => k.hwid === 'Unbound').length;

    res.json({
        total, active, expired, banned, freshKeys,
        avgDevice: total > 0 ? ((total - freshKeys) / total).toFixed(1) : "0.0"
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RP MODS Vector 3D Dashboard running on port ${PORT}`));
