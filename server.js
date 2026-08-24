const express = require('express');
const app = express();

app.use(express.json());

// ---------------- CONFIG SYSTEM KEYS ---------------- //
const ADMIN_CODE = "ZDSAWERBHKLJ";
const RESELLER_CODE = "ResellBBVC";

// ---------------- DATABASE ---------------- //
let keysDatabase = [];
let resellerPanels = [];
let auditLogs = [
    { id: 1, timestamp: new Date().toLocaleString('th-TH'), action: 'SYSTEM_START', detail: 'ระบบเริ่มต้นการทำงาน', user: 'SYSTEM' }
];

// Helper Functions
function logActivity(action, detail, user) {
    auditLogs.unshift({
        id: Date.now(),
        timestamp: new Date().toLocaleString('th-TH'),
        action, detail, user
    });
    if (auditLogs.length > 50) auditLogs.pop();
}

function generateKey(prefix = "RPMODS") {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const rand = () => Array.from({length: 4}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    return `${prefix.toUpperCase()}-${rand()}-${rand()}`;
}

// ---------------- API ENDPOINTS ---------------- //

app.get('/api/panels', (req, res) => {
    res.json(resellerPanels);
});

app.post('/api/create-panel', (req, res) => {
    const { name, expireDays, isLifetime } = req.body || {};
    if (!name || name.trim() === '') return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อแผง' });

    const exists = resellerPanels.some(p => p.name.toLowerCase() === name.trim().toLowerCase());
    if (exists) return res.status(400).json({ success: false, message: 'ชื่อแผงนี้มีอยู่ในระบบแล้ว' });

    let expireDate = null;
    if (!isLifetime) {
        const days = parseInt(expireDays) || 30;
        expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + days);
        expireDate = expireDate.toISOString();
    }

    const newPanel = {
        id: 'p-' + Date.now().toString().slice(-4),
        name: name.trim(),
        keyQuota: isLifetime ? 99999 : 500,
        keysCreated: 0,
        boundSessionId: null,
        expiresAt: expireDate
    };
    
    resellerPanels.unshift(newPanel);
    logActivity('CREATE_PANEL', `สร้างแผงใหม่: ${name} (${isLifetime ? 'ถาวร/Lifetime' : expireDays + ' วัน'})`, 'ADMIN');
    res.json({ success: true });
});

app.delete('/api/delete-panel/:id', (req, res) => {
    const panel = resellerPanels.find(p => p.id === req.params.id);
    if (panel) logActivity('DELETE_PANEL', `ลบแผง: ${panel.name}`, 'ADMIN');
    resellerPanels = resellerPanels.filter(p => p.id !== req.params.id);
    res.json({ success: true });
});

app.post('/api/claim-panel', (req, res) => {
    const { panelId, sessionId } = req.body || {};
    const panel = resellerPanels.find(p => p.id === panelId);

    if (!panel) return res.status(404).json({ success: false, message: 'ไม่พบแผงในระบบ' });
    
    if (panel.expiresAt && new Date(panel.expiresAt) < new Date()) {
        return res.status(403).json({ success: false, message: 'แผงนี้หมดอายุการใช้งานแล้ว!' });
    }

    if (panel.boundSessionId && panel.boundSessionId !== sessionId) {
        return res.status(403).json({ success: false, message: 'แผงนี้มีผู้ใช้อื่นใช้งานอยู่' });
    }

    panel.boundSessionId = sessionId;
    logActivity('PANEL_CLAIM', `เข้าใช้งานแผง ${panel.name}`, panel.name);
    res.json({ success: true, panel });
});

app.get('/api/keys', (req, res) => {
    const owner = req.query.owner || 'ADMIN';
    res.json(owner === 'ADMIN' ? keysDatabase : keysDatabase.filter(k => k.owner === owner));
});

app.post('/api/generate-key', (req, res) => {
    const { clientName, count, durationValue, unit, isLifetime, prefix, owner } = req.body || {};
    const qty = parseInt(count) || 1;
    const isReseller = owner !== 'ADMIN';
    const targetName = clientName && clientName.trim() !== '' ? clientName.trim() : 'ไม่ระบุชื่อ';

    let durationDays = 0;
    if (isLifetime) {
        durationDays = 99999;
    } else {
        const val = parseInt(durationValue) || 1;
        if (unit === 'month') durationDays = val * 30;
        else if (unit === 'year') durationDays = val * 365;
        else durationDays = val;
    }

    if (isReseller) {
        const panel = resellerPanels.find(p => p.name === owner || p.id === owner);
        if (!panel) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลแผง' });
        
        if (panel.expiresAt && new Date(panel.expiresAt) < new Date()) {
            return res.status(403).json({ success: false, message: 'แผงของคุณหมดอายุแล้ว' });
        }

        if (panel.keysCreated + qty > panel.keyQuota) {
            return res.status(400).json({ success: false, message: 'โควตาแผงนี้เต็มแล้ว!' });
        }
        panel.keysCreated += qty;
    }

    let created = [];
    const keyPrefix = prefix && prefix.trim() !== '' ? prefix : (isReseller ? 'RESELL' : 'RPMODS');
    for (let i = 0; i < qty; i++) {
        const item = {
            id: Date.now() + i,
            key: generateKey(keyPrefix),
            clientName: targetName,
            duration: isLifetime ? 'Lifetime (ถาวร)' : `${durationDays} วัน`,
            owner: owner,
            hwid: 'Unbound',
            status: 'active',
            createdAt: new Date().toLocaleString('th-TH')
        };
        keysDatabase.unshift(item);
        created.push(item);
    }
    logActivity('GENERATE_KEY', `สร้าง Key (${targetName}) จำนวน ${qty} ใบ (${isLifetime ? 'ถาวร' : durationDays + ' วัน'})`, owner);
    res.json({ success: true, keys: created });
});

app.post('/api/reset-key/:id', (req, res) => {
    const keyItem = keysDatabase.find(k => k.id === parseInt(req.params.id));
    if (keyItem) {
        keyItem.status = 'active';
        keyItem.createdAt = new Date().toLocaleString('th-TH');
        logActivity('RESET_KEY', `รีเซ็ตเวลาใช้งาน Key ${keyItem.key} ใหม่`, keyItem.owner);
        return res.json({ success: true, message: 'รีเซ็ตเวลาสำเร็จ' });
    }
    res.status(404).json({ success: false, message: 'ไม่พบ คีย์ ในระบบ' });
});

app.post('/api/ban-key/:id', (req, res) => {
    const keyItem = keysDatabase.find(k => k.id === parseInt(req.params.id));
    if (keyItem) {
        keyItem.status = 'banned';
        logActivity('BAN_KEY', `ระงับ Key ${keyItem.key}`, keyItem.owner);
        return res.json({ success: true });
    }
    res.status(404).json({ success: false, message: 'ไม่พบ คีย์ ในระบบ' });
});

app.delete('/api/delete-key/:id', (req, res) => {
    const keyItem = keysDatabase.find(k => k.id === parseInt(req.params.id));
    if (keyItem) {
        logActivity('DELETE_KEY', `ลบ Key ${keyItem.key}`, keyItem.owner);
        keysDatabase = keysDatabase.filter(k => k.id !== parseInt(req.params.id));
    }
    res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
    const owner = req.query.owner || 'ADMIN';
    const targetKeys = owner === 'ADMIN' ? keysDatabase : keysDatabase.filter(k => k.owner === owner);
    const panel = resellerPanels.find(p => p.name === owner || p.id === owner);

    res.json({
        total: targetKeys.length,
        active: targetKeys.filter(k => k.status === 'active').length,
        expired: targetKeys.filter(k => k.status === 'expired').length,
        banned: targetKeys.filter(k => k.status === 'banned').length,
        used: panel ? panel.keysCreated : targetKeys.length,
        max: panel ? panel.keyQuota : '∞'
    });
});

app.get('/api/logs', (req, res) => {
    const owner = req.query.owner || 'ADMIN';
    res.json(owner === 'ADMIN' ? auditLogs : auditLogs.filter(l => l.user === owner || l.user === 'SYSTEM'));
});

// ---------------- FRONTEND INTERFACE ---------------- //

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>RP MODS Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        * { font-family: 'Kanit', sans-serif; box-sizing: border-box; }
        body { background-color: #f5f3ff; color: #2e1065; overflow-x: hidden; touch-action: manipulation; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #d8b4fe; border-radius: 10px; }
        .glass-card { background: #ffffff; border: 1.5px solid #f3e8ff; box-shadow: 0 8px 20px rgba(168, 85, 247, 0.06); }
        .btn-neon-purple { background: linear-gradient(135deg, #c084fc 0%, #9333ea 100%); color: #ffffff; font-weight: 500; box-shadow: 0 4px 12px rgba(168, 85, 247, 0.3); }
        .sidebar-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 12px; font-size: 14px; font-weight: 400; color: #7e22ce; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .sidebar-item:hover { background: #f3e8ff; }
        .sidebar-item.active { background: #f3e8ff; font-weight: 500; color: #6b21a8; border-left: 4px solid #a855f7; }
        .tab-view { display: none; }
        .tab-view.active { display: block; }
        .sidebar-collapsed { width: 4.5rem !important; }
        .sidebar-collapsed .hide-on-collapse { display: none !important; }
        .sidebar-collapsed .sidebar-item { justify-content: center; padding-left: 0; padding-right: 0; }
    </style>
</head>
<body class="min-h-screen flex text-sm">

    <div id="gate-screen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-purple-950/30 backdrop-blur-sm">
        <div class="glass-card p-7 max-w-sm w-full rounded-3xl text-center space-y-5 border-2 border-purple-200">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-400 to-pink-400 text-white mx-auto flex items-center justify-center text-2xl shadow-md">
                <i class="fa-solid fa-shield-halved"></i>
            </div>
            <div>
                <h2 class="font-semibold text-xl text-purple-950">RP MODS SYSTEM</h2>
                <p class="text-xs text-purple-600 mt-0.5">กรอกรหัสผ่านเพื่อเข้าใช้งาน</p>
            </div>

            <form id="login-form" action="javascript:void(0);" class="space-y-3">
                <input id="pass-code" type="password" placeholder="••••••••••••" autocomplete="off" class="w-full bg-purple-50/50 border border-purple-200 rounded-xl p-3 text-center text-purple-900 outline-none focus:border-purple-400 text-base">
                <p id="login-error-msg" class="text-xs text-rose-500 font-medium hidden"></p>
                <button type="submit" id="btn-submit-login" class="w-full btn-neon-purple py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-transform">
                    <i class="fa-solid fa-right-to-bracket"></i> เข้าสู่ระบบ
                </button>
            </form>
        </div>
    </div>

    <div id="selector-screen" class="fixed inset-0 z-40 flex items-center justify-center p-4 bg-purple-950/30 backdrop-blur-sm hidden">
        <div class="glass-card p-6 max-w-xl w-full rounded-3xl space-y-4 border-2 border-purple-200">
            <div class="flex justify-between items-center border-b border-purple-100 pb-3">
                <h3 class="font-medium text-purple-950 text-sm"><i class="fa-solid fa-store text-purple-500 mr-1.5"></i> เลือกแผง Reseller ที่ต้องการใช้งาน</h3>
                <button onclick="logout()" class="text-xs text-rose-500 font-normal hover:underline"><i class="fa-solid fa-power-off mr-1"></i> ออกจากระบบ</button>
            </div>
            <div id="panel-list" class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto"></div>
        </div>
    </div>

    <div id="dashboard-screen" class="flex w-full h-screen overflow-hidden hidden">
        <aside id="main-sidebar" class="w-56 border-r border-purple-100 p-3 flex flex-col justify-between bg-white/80 shrink-0 transition-all duration-300">
            <div class="space-y-4">
                <div class="flex items-center justify-between px-1">
                    <div class="flex items-center gap-2.5 overflow-hidden">
                        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-400 to-pink-400 text-white flex items-center justify-center font-bold shadow-sm shrink-0">
                            <i class="fa-solid fa-wand-magic-sparkles text-base"></i>
                        </div>
                        <div class="truncate hide-on-collapse">
                            <span class="font-semibold text-base block text-purple-950 leading-tight">RP MODS</span>
                            <span class="text-[10px] text-purple-500 font-normal">แผงควบคุมระบบ</span>
                        </div>
                    </div>
                    <button onclick="toggleSidebar()" class="w-7 h-7 rounded-lg hover:bg-purple-100 text-purple-500 flex items-center justify-center transition shrink-0">
                        <i class="fa-solid fa-bars-staggered"></i>
                    </button>
                </div>

                <div class="bg-purple-50/80 border border-purple-100 p-2 rounded-xl text-center">
                    <div class="text-[9px] text-purple-400 font-normal uppercase hide-on-collapse">แผงที่ใช้งาน</div>
                    <div id="active-panel-name" class="text-xs font-semibold text-purple-900 truncate"><i class="fa-solid fa-user-gear mr-1 text-purple-400"></i><span class="hide-on-collapse">ADMIN</span></div>
                </div>

                <nav class="space-y-1">
                    <div id="nav-dashboard" onclick="switchTab('dashboard')" class="sidebar-item active">
                        <i class="fa-solid fa-chart-pie w-5 text-center text-base"></i>
                        <span class="hide-on-collapse">ภาพรวมระบบ</span>
                    </div>
                    <div id="nav-keys" onclick="switchTab('keys')" class="sidebar-item">
                        <i class="fa-solid fa-key w-5 text-center text-base"></i>
                        <span class="hide-on-collapse">จัดการคีย์</span>
                    </div>
                    <div id="nav-logs" onclick="switchTab('logs')" class="sidebar-item">
                        <i class="fa-solid fa-clock-rotate-left w-5 text-center text-base"></i>
                        <span class="hide-on-collapse">ประวัติระบบ</span>
                    </div>
                </nav>
            </div>

            <button onclick="logout()" class="bg-purple-50/60 hover:bg-rose-50 p-2.5 rounded-xl flex items-center justify-center gap-2 border border-purple-100 text-rose-500 font-medium text-xs transition">
                <i class="fa-solid fa-arrow-right-from-bracket"></i>
                <span class="hide-on-collapse">ออกจากระบบ</span>
            </button>
        </aside>

        <main class="flex-1 p-6 space-y-5 overflow-y-auto">
            <header class="flex justify-between items-center pb-4 border-b border-purple-100">
                <h1 class="text-lg font-semibold text-purple-950 flex items-center gap-2">
                    <i class="fa-solid fa-sliders text-purple-500"></i> แผงควบคุม RP MODS
                </h1>
            </header>

            <div id="tab-dashboard" class="tab-view active space-y-5">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                    <div class="glass-card p-4 rounded-2xl">
                        <div class="text-xs font-normal text-purple-400 flex items-center gap-1.5"><i class="fa-solid fa-database"></i> จำนวนคีย์ทั้งหมด</div>
                        <div id="stat-total" class="text-2xl font-semibold text-purple-950 mt-1">0</div>
                    </div>
                    <div class="glass-card p-4 rounded-2xl">
                        <div class="text-xs font-normal text-emerald-500 flex items-center gap-1.5"><i class="fa-solid fa-circle-check"></i> ใช้งานได้ (Active)</div>
                        <div id="stat-active" class="text-2xl font-semibold text-emerald-600 mt-1">0</div>
                    </div>
                    <div class="glass-card p-4 rounded-2xl">
                        <div class="text-xs font-normal text-amber-500 flex items-center gap-1.5"><i class="fa-solid fa-hourglass-end"></i> หมดอายุ (Expired)</div>
                        <div id="stat-expired" class="text-2xl font-semibold text-amber-600 mt-1">0</div>
                    </div>
                    <div class="glass-card p-4 rounded-2xl">
                        <div class="text-xs font-normal text-rose-400 flex items-center gap-1.5"><i class="fa-solid fa-ban"></i> ถูกระงับ (Banned)</div>
                        <div id="stat-banned" class="text-2xl font-semibold text-rose-500 mt-1">0</div>
                    </div>
                </div>

                <section id="admin-panel-section" class="glass-card p-5 rounded-2xl space-y-3.5 hidden">
                    <div class="flex justify-between items-center pb-2.5 border-b border-purple-100">
                        <h3 class="font-semibold text-purple-950 text-xs flex items-center gap-1.5"><i class="fa-solid fa-users-gear text-purple-500"></i> จัดการแผงร้านค้า Reseller</h3>
                        <button onclick="openPanelModal()" class="btn-neon-purple px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1"><i class="fa-solid fa-plus"></i> สร้างแผงใหม่</button>
                    </div>
                    <div id="admin-panel-list" class="grid grid-cols-1 md:grid-cols-3 gap-3"></div>
                </section>
            </div>

            <div id="tab-keys" class="tab-view space-y-4">
                <div class="glass-card p-5 rounded-2xl">
                    <div class="flex justify-between items-center pb-3 mb-3 border-b border-purple-100">
                        <h3 class="font-semibold text-xs text-purple-950"><i class="fa-solid fa-key text-purple-500 mr-1"></i> รายการคีย์ในระบบ</h3>
                        <button onclick="openKeyModal()" class="btn-neon-purple px-3 py-1.5 rounded-xl text-xs flex items-center gap-1"><i class="fa-solid fa-plus"></i> สร้างคีย์ใหม่</button>
                    </div>
                    <div class="overflow-x-auto overflow-y-visible">
                        <table class="w-full text-left text-xs">
                            <thead class="text-purple-400 border-b border-purple-100 font-normal">
                                <tr>
                                    <th class="p-2.5">คีย์ (KEY)</th>
                                    <th class="p-2.5">ผู้ใช้งาน / หมายเหตุ</th>
                                    <th class="p-2.5">สถานะ</th>
                                    <th class="p-2.5">ระยะเวลา</th>
                                    <th class="p-2.5">เจ้าของแผง</th>
                                    <th class="p-2.5 text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody id="manager-keys-body" class="divide-y divide-purple-50"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div id="tab-logs" class="tab-view space-y-4">
                <div class="glass-card p-5 rounded-2xl">
                    <table class="w-full text-left text-xs">
                        <thead class="text-purple-400 border-b border-purple-100 font-normal">
                            <tr><th class="p-2.5">เวลา</th><th class="p-2.5">ผู้ใช้</th><th class="p-2.5">การกระทำ</th><th class="p-2.5">รายละเอียด</th></tr>
                        </thead>
                        <tbody id="logs-table-body" class="divide-y divide-purple-50"></tbody>
                    </table>
                </div>
            </div>
        </main>
    </div>

    <div id="modal-key" class="fixed inset-0 bg-purple-950/30 backdrop-blur-sm hidden z-50 flex items-center justify-center p-4">
        <div class="glass-card p-6 max-w-sm w-full rounded-3xl space-y-4 border-2 border-purple-200">
            <h3 class="text-purple-950 font-semibold text-sm flex items-center gap-2"><i class="fa-solid fa-key text-purple-500"></i> สร้างคีย์ใหม่</h3>
            <div class="space-y-3 text-xs">
                <div>
                    <label class="block text-purple-800 font-medium mb-1">ชื่อผู้ใช้งาน / หมายเหตุคีย์</label>
                    <input id="key-client-name" type="text" placeholder="เช่น ลูกค้า A / VIP User" class="w-full bg-purple-50/50 border border-purple-200 p-2.5 rounded-xl outline-none focus:border-purple-400">
                </div>
                <div>
                    <label class="block text-purple-800 font-medium mb-1">จำนวนคีย์ที่ต้องการสร้าง (ใบ)</label>
                    <input id="key-count" type="number" value="1" min="1" class="w-full bg-purple-50/50 border border-purple-200 p-2.5 rounded-xl outline-none focus:border-purple-400">
                </div>
                <div class="flex items-center gap-2 p-2 bg-purple-50/50 rounded-xl border border-purple-100">
                    <input id="key-is-lifetime" type="checkbox" onchange="toggleKeyDurationInput(this.checked)" class="w-4 h-4 accent-purple-500 rounded">
                    <label for="key-is-lifetime" class="font-normal text-purple-900 cursor-pointer flex items-center gap-1.5"><i class="fa-solid fa-infinity text-purple-500"></i> คีย์ถาวร (Lifetime)</label>
                </div>
                <div id="key-duration-box">
                    <label class="block text-purple-800 font-medium mb-1">ระยะเวลาใช้งาน</label>
                    <div class="flex gap-2">
                        <input id="key-duration-value" type="number" value="1" min="1" class="flex-1 bg-purple-50/50 border border-purple-200 p-2.5 rounded-xl outline-none focus:border-purple-400">
                        <select id="key-duration-unit" class="bg-purple-50/50 border border-purple-200 p-2.5 rounded-xl outline-none text-purple-900 font-medium focus:border-purple-400">
                            <option value="day">วัน</option>
                            <option value="month">เดือน</option>
                            <option value="year">ปี</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="flex gap-2 pt-1">
                <button onclick="submitGenerateKey()" class="flex-1 btn-neon-purple py-2.5 rounded-xl text-xs">สร้างคีย์</button>
                <button onclick="closeModal('modal-key')" class="bg-purple-100/60 text-purple-700 px-3.5 py-2.5 rounded-xl text-xs">ยกเลิก</button>
            </div>
        </div>
    </div>

    <div id="modal-panel" class="fixed inset-0 bg-purple-950/30 backdrop-blur-sm hidden z-50 flex items-center justify-center p-4">
        <div class="glass-card p-6 max-w-sm w-full rounded-3xl space-y-4 border-2 border-purple-200">
            <h3 class="text-purple-950 font-semibold text-sm flex items-center gap-2"><i class="fa-solid fa-folder-plus text-purple-500"></i> สร้างแผง Reseller ใหม่</h3>
            <div class="space-y-3 text-xs">
                <div>
                    <label class="block text-purple-800 font-medium mb-1">ชื่อแผงร้านค้า</label>
                    <input id="panel-name" type="text" placeholder="เช่น VIP Reseller Shop" class="w-full bg-purple-50/50 border border-purple-200 p-2.5 rounded-xl outline-none focus:border-purple-400">
                </div>
                <div class="flex items-center gap-2 p-2 bg-purple-50/50 rounded-xl border border-purple-100">
                    <input id="panel-is-lifetime" type="checkbox" onchange="toggleDaysInput(this.checked)" class="w-4 h-4 accent-purple-500 rounded">
                    <label for="panel-is-lifetime" class="font-normal text-purple-900 cursor-pointer flex items-center gap-1.5"><i class="fa-solid fa-infinity text-purple-500"></i> แผงถาวร (Lifetime / ไม่หมดอายุ)</label>
                </div>
                <div id="days-input-box">
                    <label class="block text-purple-800 font-medium mb-1">จำนวนวันใช้งาน</label>
                    <input id="panel-expire-days" type="number" value="30" class="w-full bg-purple-50/50 border border-purple-200 p-2.5 rounded-xl outline-none focus:border-purple-400">
                </div>
            </div>
            <div class="flex gap-2 pt-1">
                <button onclick="submitCreatePanel()" class="flex-1 btn-neon-purple py-2.5 rounded-xl text-xs">ตกลงสร้าง</button>
                <button onclick="closeModal('modal-panel')" class="bg-purple-100/60 text-purple-700 px-3.5 py-2.5 rounded-xl text-xs">ยกเลิก</button>
            </div>
        </div>
    </div>

    <script>
        const AUTH_ADMIN = "${ADMIN_CODE}";
        const AUTH_RESELLER = "${RESELLER_CODE}";

        const memStorage = {};
        const storage = {
            get: (key) => { try { return localStorage.getItem(key); } catch(e) { return memStorage[key] || null; } },
            set: (key, val) => { try { localStorage.setItem(key, val); } catch(e) { memStorage[key] = val; } },
            clear: () => { try { localStorage.clear(); } catch(e) {} for (let k in memStorage) delete memStorage[k]; }
        };

        let userRole = storage.get('userRole') || null;
        let currentOwner = storage.get('currentOwner') || 'ADMIN';
        let mySessionId = storage.get('mySessionId');

        if (!mySessionId) {
            mySessionId = 'sess-' + Math.random().toString(36).substring(2, 9);
            storage.set('mySessionId', mySessionId);
        }

        function toggleSidebar() { document.getElementById('main-sidebar').classList.toggle('sidebar-collapsed'); }
        function toggleDaysInput(v) { document.getElementById('days-input-box').classList.toggle('hidden', v); }
        function toggleKeyDurationInput(v) { document.getElementById('key-duration-box').classList.toggle('hidden', v); }

        function initApp() {
            if (userRole) {
                document.getElementById('gate-screen').classList.add('hidden');
                if (userRole === 'admin') showDashboard();
                else loadPanelsForReseller();
            }
        }

        function doLogin() {
            const inputEl = document.getElementById('pass-code');
            const errEl = document.getElementById('login-error-msg');
            errEl.classList.add('hidden');

            if (!inputEl) return;
            const code = inputEl.value.trim();

            if (!code) {
                errEl.innerText = '⚠️ กรุณากรอกรหัสผ่าน';
                errEl.classList.remove('hidden');
                return;
            }

            if (code === AUTH_ADMIN) {
                userRole = 'admin';
                currentOwner = 'ADMIN';
                storage.set('userRole', 'admin');
                storage.set('currentOwner', 'ADMIN');
                document.getElementById('gate-screen').classList.add('hidden');
                showDashboard();
            } else if (code === AUTH_RESELLER) {
                userRole = 'reseller';
                storage.set('userRole', 'reseller');
                document.getElementById('gate-screen').classList.add('hidden');
                loadPanelsForReseller();
            } else {
                errEl.innerText = '⚠️ รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง';
                errEl.classList.remove('hidden');
            }
        }

        document.addEventListener('DOMContentLoaded', function() {
            initApp();
            const form = document.getElementById('login-form');
            if (form) {
                form.addEventListener('submit', function(e) {
                    e.preventDefault();
                    doLogin();
                });
            }
            document.addEventListener('click', function(e) {
                if (!e.target.closest('.key-action-dropdown') && !e.target.closest('button')) {
                    closeAllMenus();
                }
            });
        });

        if (document.readyState === 'interactive' || document.readyState === 'complete') {
            initApp();
        }

        function switchTab(t) {
            document.querySelectorAll('.tab-view').forEach(e => e.classList.remove('active'));
            document.querySelectorAll('.sidebar-item').forEach(e => e.classList.remove('active'));
            document.getElementById('tab-' + t).classList.add('active');
            document.getElementById('nav-' + t).classList.add('active');
        }

        async function loadPanelsForReseller() {
            document.getElementById('selector-screen').classList.remove('hidden');
            const res = await fetch('/api/panels');
            const panels = await res.json();
            if (panels.length === 0) {
                document.getElementById('panel-list').innerHTML = '<div class="col-span-2 text-center text-purple-400 py-6">ยังไม่มีแผงที่ถูกสร้าง กรุณาติดต่อ Admin</div>';
                return;
            }
            document.getElementById('panel-list').innerHTML = panels.map(p => 
                '<div class="glass-card p-3.5 rounded-2xl space-y-2.5">' +
                    '<div class="flex justify-between items-center">' +
                        '<div class="font-medium text-purple-950">' + p.name + '</div>' +
                        '<span class="text-[10px] font-normal px-2 py-0.5 rounded-full ' + (p.expiresAt ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700') + '">' +
                            (p.expiresAt ? 'จำกัดเวลา' : 'ถาวร') +
                        '</span>' +
                    '</div>' +
                    '<button onclick="claimPanel(\'' + p.id + '\', \'' + p.name + '\')" class="w-full btn-neon-purple py-2 rounded-xl text-xs">เข้าใช้งานแผงนี้</button>' +
                '</div>'
            ).join('');
        }

        async function claimPanel(panelId, panelName) {
            const res = await fetch('/api/claim-panel', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({panelId, sessionId: mySessionId}) });
            const data = await res.json();
            if (data.success) {
                currentOwner = panelName;
                storage.set('currentOwner', currentOwner);
                document.getElementById('selector-screen').classList.add('hidden');
                showDashboard();
            } else {
                alert(data.message);
            }
        }

        function showDashboard() {
            document.getElementById('dashboard-screen').classList.remove('hidden');
            document.getElementById('active-panel-name').innerHTML = '<i class="fa-solid fa-user-gear mr-1 text-purple-400"></i><span class="hide-on-collapse">' + currentOwner + '</span>';
            if (userRole === 'admin') document.getElementById('admin-panel-section').classList.remove('hidden');
            refreshData();
        }

        function logout() { storage.clear(); location.reload(); }

        function toggleKeyMenu(event, id) {
            event.stopPropagation();
            const existingMenu = document.getElementById('action-menu-' + id);
            closeAllMenus();
            if (existingMenu) {
                existingMenu.classList.toggle('hidden');
            }
        }

        function closeAllMenus() {
            document.querySelectorAll('.key-action-dropdown').forEach(el => el.classList.add('hidden'));
        }

        async function refreshData() {
            const resStat = await fetch('/api/stats?owner=' + currentOwner);
            const stat = await resStat.json();
            document.getElementById('stat-total').innerText = stat.total;
            document.getElementById('stat-active').innerText = stat.active;
            document.getElementById('stat-expired').innerText = stat.expired;
            document.getElementById('stat-banned').innerText = stat.banned;

            const resKeys = await fetch('/api/keys?owner=' + currentOwner);
            const keys = await resKeys.json();
            document.getElementById('manager-keys-body').innerHTML = keys.map(k => 
                '<tr>' +
                    '<td class="p-2.5 font-mono font-medium text-purple-900">' + k.key + '</td>' +
                    '<td class="p-2.5 text-purple-800 font-medium"><i class="fa-regular fa-user mr-1 text-purple-400"></i>' + (k.clientName || 'ไม่ระบุชื่อ') + '</td>' +
                    '<td class="p-2.5"><span class="px-2 py-0.5 rounded-full text-[10px] ' + (k.status === 'active' ? 'bg-emerald-100 text-emerald-700' : k.status === 'banned' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700') + '">' + k.status.toUpperCase() + '</span></td>' +
                    '<td class="p-2.5 text-purple-700 font-medium">' + k.duration + '</td>' +
                    '<td class="p-2.5 text-purple-600">' + k.owner + '</td>' +
                    '<td class="p-2.5 text-center relative">' +
                        '<button onclick="toggleKeyMenu(event, ' + k.id + ')" class="w-8 h-8 rounded-xl bg-purple-100/70 hover:bg-purple-200 text-purple-700 inline-flex items-center justify-center transition shadow-sm">' +
                            '<i class="fa-solid fa-key"></i>' +
                        '</button>' +
                        '<div id="action-menu-' + k.id + '" class="key-action-dropdown hidden absolute right-2 mt-1 w-36 bg-white border border-purple-100 rounded-xl shadow-xl z-30 overflow-hidden text-xs text-left">' +
                            '<button onclick="resetKey(' + k.id + ')" class="w-full px-3 py-2 hover:bg-purple-50 text-purple-700 flex items-center gap-2 border-b border-purple-50"><i class="fa-solid fa-rotate text-purple-500"></i> รีเซ็ตเวลา</button>' +
                            (k.status !== 'banned' ? '<button onclick="banKey(' + k.id + ')" class="w-full px-3 py-2 hover:bg-amber-50 text-amber-600 flex items-center gap-2 border-b border-purple-50"><i class="fa-solid fa-ban text-amber-500"></i> ระงับคีย์</button>' : '') +
                            '<button onclick="deleteKey(' + k.id + ')" class="w-full px-3 py-2 hover:bg-rose-50 text-rose-500 flex items-center gap-2"><i class="fa-solid fa-trash text-rose-400"></i> ลบคีย์</button>' +
                        '</div>' +
                    '</td>' +
                '</tr>'
            ).join('');

            const resLogs = await fetch('/api/logs?owner=' + currentOwner);
            const logs = await resLogs.json();
            document.getElementById('logs-table-body').innerHTML = logs.map(l => 
                '<tr><td class="p-2.5 text-purple-400">' + l.timestamp + '</td><td class="p-2.5 font-medium text-purple-900">' + l.user + '</td><td class="p-2.5 font-semibold text-purple-700">' + l.action + '</td><td class="p-2.5 text-purple-600">' + l.detail + '</td></tr>'
            ).join('');

            if (userRole === 'admin') {
                const resP = await fetch('/api/panels');
                const panels = await resP.json();
                document.getElementById('admin-panel-list').innerHTML = panels.map(p => 
                    '<div class="bg-purple-50/60 p-3.5 rounded-xl border border-purple-100 space-y-1.5">' +
                        '<div class="flex justify-between items-start"><div class="font-medium text-xs text-purple-950">' + p.name + '</div></div>' +
                        '<div class="text-[10px] text-purple-600">โควตา: ' + p.keysCreated + '/' + p.keyQuota + '</div>' +
                        '<button onclick="deletePanel(\'' + p.id + '\')" class="text-rose-500 text-xs hover:underline">ลบแผง</button>' +
                    '</div>'
                ).join('');
            }
        }

        function openKeyModal() { document.getElementById('modal-key').classList.remove('hidden'); }
        function openPanelModal() { document.getElementById('modal-panel').classList.remove('hidden'); }
        function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

        async function submitGenerateKey() {
            const clientName = document.getElementById('key-client-name').value;
            const count = document.getElementById('key-count').value;
            const isLifetime = document.getElementById('key-is-lifetime').checked;
            const durationValue = document.getElementById('key-duration-value').value;
            const unit = document.getElementById('key-duration-unit').value;

            const res = await fetch('/api/generate-key', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ clientName, count, durationValue, unit, isLifetime, owner: currentOwner })
            });
            const data = await res.json();
            if (data.success) { closeModal('modal-key'); refreshData(); } else alert(data.message);
        }

        async function resetKey(id) { 
            closeAllMenus();
            if (confirm('ต้องการรีเซ็ตเวลาของคีย์นี้ให้เริ่มใหม่ใช่หรือไม่?')) { 
                await fetch('/api/reset-key/' + id, { method: 'POST' }); 
                refreshData(); 
            } 
        }
        async function banKey(id) { 
            closeAllMenus();
            if (confirm('ระงับคีย์นี้?')) { 
                await fetch('/api/ban-key/' + id, { method: 'POST' }); 
                refreshData(); 
            } 
        }
        async function deleteKey(id) { 
            closeAllMenus();
            if (confirm('ลบคีย์นี้?')) { 
                await fetch('/api/delete-key/' + id, { method: 'DELETE' }); 
                refreshData(); 
            } 
        }
        
        async function submitCreatePanel() {
            const name = document.getElementById('panel-name').value;
            const expireDays = document.getElementById('panel-expire-days').value;
            const isLifetime = document.getElementById('panel-is-lifetime').checked;
            const res = await fetch('/api/create-panel', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, expireDays, isLifetime }) });
            const data = await res.json();
            if (data.success) { closeModal('modal-panel'); refreshData(); } else alert(data.message);
        }

        async function deletePanel(id) { if (confirm('ลบแผงนี้?')) { await fetch('/api/delete-panel/' + id, { method: 'DELETE' }); refreshData(); } }
    </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
