const express = require('express');
const app = express();
const path = require('path');

app.use(express.json());
app.use(express.static(__dirname));

// CONFIG KEYS (เก็บลับเฉพาะฝั่ง Server)
const ADMIN_SECRET = "ZDSAWERBHKLJ";
const RESELLER_SECRET = "ResellBBVC";

// Datastores
let keysDatabase = [
    { id: 1, key: "BRMODS-A8K2-99XZ", duration: 30, status: 'active', hwid: 'DEV-8821-X', owner: 'BR MODS', createdAt: '23/08/2026' },
    { id: 2, key: "BRMODS-PL91-11QQ", duration: 1, status: 'active', hwid: 'Unbound', owner: 'BR MODS', createdAt: '23/08/2026' }
];

let resellerPanels = [
    { id: 'resell-01', name: 'VIP GameShop', keyQuota: 500, keysCreated: 42, activeSessionId: null },
    { id: 'resell-02', name: 'Apex Key Store', keyQuota: 500, keysCreated: 120, activeSessionId: null }
];

function generateLicenseKey(prefix = "BRMODS") {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segment = () => Array.from({length: 4}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    return `${prefix.trim().toUpperCase()}-${segment()}-${segment()}`;
}

// ---------------- AUTH & LOCKING ---------------- //

app.post('/api/auth/login', (req, res) => {
    const { secretCode } = req.body;
    if (secretCode === ADMIN_SECRET) return res.json({ success: true, role: 'admin' });
    if (secretCode === RESELLER_SECRET) return res.json({ success: true, role: 'reseller' });
    res.status(401).json({ success: false, message: 'รหัสเข้าใช้งานไม่ถูกต้อง!' });
});

app.post('/api/auth/claim-panel', (req, res) => {
    const { panelId, sessionId } = req.body;
    const panel = resellerPanels.find(p => p.id === panelId);

    if (!panel) return res.status(404).json({ success: false, message: 'ไม่พบแผงที่ระบุ' });
    if (panel.activeSessionId && panel.activeSessionId !== sessionId) {
        return res.status(403).json({ success: false, message: '🔒 แผงนี้กำลังมีผู้อื่นใช้งานอยู่!' });
    }

    panel.activeSessionId = sessionId;
    res.json({ success: true, panel });
});

app.post('/api/auth/release-panel', (req, res) => {
    const { panelId, sessionId } = req.body;
    const panel = resellerPanels.find(p => p.id === panelId);
    if (panel && panel.activeSessionId === sessionId) panel.activeSessionId = null;
    res.json({ success: true });
});

// ---------------- DASHBOARD APIs ---------------- //

app.get('/api/admin/resellers', (req, res) => res.json(resellerPanels));

app.post('/api/admin/create-reseller', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อแผง' });

    const newReseller = {
        id: 'resell-' + Date.now().toString().slice(-4),
        name: name.trim(),
        keyQuota: 500,
        keysCreated: 0,
        activeSessionId: null
    };
    resellerPanels.unshift(newReseller);
    res.json({ success: true, reseller: newReseller });
});

app.delete('/api/admin/delete-reseller/:id', (req, res) => {
    resellerPanels = resellerPanels.filter(r => r.id !== req.params.id);
    res.json({ success: true });
});

app.get('/api/keys', (req, res) => {
    const owner = req.query.owner || 'BR MODS';
    res.json(owner === 'BR MODS' ? keysDatabase : keysDatabase.filter(k => k.owner === owner));
});

app.post('/api/generate-key', (req, res) => {
    const { count, days, prefix, owner } = req.body;
    const qty = parseInt(count) || 1;
    const durationDays = parseInt(days);
    const isReseller = owner !== 'BR MODS';

    if (isReseller) {
        const reseller = resellerPanels.find(r => r.id === owner || r.name === owner);
        if (!reseller) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลแผง' });
        if (![1, 7, 30].includes(durationDays)) {
            return res.status(400).json({ success: false, message: 'Reseller เลือกสร้างได้เฉพาะ 1, 7 หรือ 30 วัน' });
        }
        if (reseller.keysCreated + qty > reseller.keyQuota) {
            return res.status(400).json({ success: false, message: 'โควตาเต็มแล้ว!' });
        }
        reseller.keysCreated += qty;
    }

    let newKeys = [];
    const prefixToUse = prefix && prefix.trim() !== '' ? prefix : (isReseller ? 'RESELL' : 'BRMODS');

    for (let i = 0; i < qty; i++) {
        const keyData = {
            id: Date.now() + i,
            key: generateLicenseKey(prefixToUse),
            duration: durationDays,
            status: 'active',
            hwid: 'Unbound',
            owner: owner || 'BR MODS',
            createdAt: new Date().toLocaleDateString('th-TH')
        };
        keysDatabase.unshift(keyData);
        newKeys.push(keyData);
    }
    res.json({ success: true, keys: newKeys });
});

app.delete('/api/delete-key/:id', (req, res) => {
    keysDatabase = keysDatabase.filter(k => k.id !== parseInt(req.params.id));
    res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
    const owner = req.query.owner || 'BR MODS';
    const targetKeys = owner === 'BR MODS' ? keysDatabase : keysDatabase.filter(k => k.owner === owner);
    const reseller = resellerPanels.find(r => r.id === owner || r.name === owner);

    res.json({
        totalKeys: targetKeys.length,
        activeKeys: targetKeys.filter(k => k.status === 'active').length,
        expiredKeys: targetKeys.filter(k => k.status === 'expired').length,
        bannedKeys: targetKeys.filter(k => k.status === 'banned').length,
        quotaUsed: reseller ? reseller.keysCreated : targetKeys.length,
        quotaMax: reseller ? reseller.keyQuota : '∞'
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(3000, () => console.log('Server running on http://localhost:3000'));
