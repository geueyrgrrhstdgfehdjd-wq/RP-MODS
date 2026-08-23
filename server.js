const express = require('express');
const app = express();

app.use(express.json());

// ---------------- CONFIG SYSTEM KEYS ---------------- //
const ADMIN_CODE = "ZDSAWERBHKLJ";
const RESELLER_CODE = "ResellBBVC";

// ---------------- DATABASE (START EMPTY) ---------------- //
let keysDatabase = [];     // เคลียร์ว่าง - ไม่มี Key ค้าง
let resellerPanels = [];   // ✅ เคลียร์ว่าง - ไม่สร้างแผงให้อัตโนมัติอีกต่อไป
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

// 1. Login
app.post('/api/login', (req, res) => {
    const { code } = req.body;
    if (code === ADMIN_CODE) {
        logActivity('LOGIN', 'Admin เข้าสู่ระบบ', 'ADMIN');
        return res.json({ success: true, role: 'admin' });
    }
    if (code === RESELLER_CODE) {
        logActivity('LOGIN', 'Reseller เข้าสู่ระบบ', 'RESELLER');
        return res.json({ success: true, role: 'reseller' });
    }
    res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง!' });
});

// 2. Panel Management
app.get('/api/panels', (req, res) => {
    res.json(resellerPanels);
});

app.post('/api/create-panel', (req, res) => {
    const { name, expireDays, isLifetime } = req.body;
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
        expiresAt: expireDate // null = ถาวร
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
    const { panelId, sessionId } = req.body;
    const panel = resellerPanels.find(p => p.id === panelId);

    if (!panel) return res.status(404).json({ success: false, message: 'ไม่พบแผงในระบบ' });
    
    if (panel.expiresAt && new Date(panel.expiresAt) < new Date()) {
        return res.status(403).json({ success: false, message: '⏳ แผงนี้หมดอายุการใช้งานแล้ว!' });
    }

    if (panel.boundSessionId && panel.boundSessionId !== sessionId) {
        return res.status(403).json({ success: false, message: '🔒 แผงนี้มีผู้ใช้อื่นใช้งานอยู่' });
    }

    panel.boundSessionId = sessionId;
    logActivity('PANEL_CLAIM', `เข้าใช้งานแผง ${panel.name}`, panel.name);
    res.json({ success: true, panel });
});

// 3. Key Management
app.get('/api/keys', (req, res) => {
    const owner = req.query.owner || 'ADMIN';
    res.json(owner === 'ADMIN' ? keysDatabase : keysDatabase.filter(k => k.owner === owner));
});

app.post('/api/generate-key', (req, res) => {
    const { count, days, prefix, owner } = req.body;
    const qty = parseInt(count) || 1;
    const durationDays = parseInt(days) || 1;
    const isReseller = owner !== 'ADMIN';

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
            duration: durationDays,
            owner: owner,
            hwid: 'Unbound',
            status: 'active',
            createdAt: new Date().toLocaleString('th-TH')
        };
        keysDatabase.unshift(item);
        created.push(item);
    }
    logActivity('GENERATE_KEY', `สร้าง Key จำนวน ${qty} ใบ (${durationDays} วัน)`, owner);
    res.json({ success: true, keys: created });
});

app.delete('/api/delete-key/:id', (req, res) => {
    const keyItem = keysDatabase.find(k => k.id === parseInt(req.params.id));
    if (keyItem) logActivity('DELETE_KEY', `ลบ Key ${keyItem.key}`, keyItem.owner);
    keysDatabase = keysDatabase.filter(k => k.id !== parseInt(req.params.id));
    res.json({ success: true });
});

// 4. Stats & Logs
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
    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>RP MODS Dashboard</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
            * { font-family: 'Plus Jakarta Sans', sans-serif; box-sizing: border-box; }
            body { background-color: #f3f0ff; color: #2e1065; overflow-x: hidden; }
            ::-webkit-scrollbar { width: 6px; }
            ::-webkit-scrollbar-thumb { background: #c084fc; border-radius: 10px; }
            .glass-card { background: #ffffff; border: 1px solid #e9d5ff; box-shadow: 0 10px 25px rgba(147, 51, 234, 0.08); }
            .btn-neon-purple { background: linear-gradient(135deg, #a855f7 0%, #7e22ce 100%); color: #ffffff; font-weight: 700; box-shadow: 0 4px 15px rgba(168, 85, 247, 0.35); }
            .sidebar-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 14px; font-size: 13px; font-weight: 600; color: #6b21a8; cursor: pointer; }
            .sidebar-item.active { background: #f3e8ff; border-left: 4px solid #a855f7; }
            .tab-view { display: none; }
            .tab-view.active { display: block; }
        </style>
    </head>
    <body class="min-h-screen flex text-sm" onload="checkAutoLogin()">

        <!-- LOGIN GATE -->
        <div id="gate-screen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-purple-950/40">
            <div class="glass-card p-8 max-w-md w-full rounded-3xl text-center space-y-6 border-2 border-purple-300">
                <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 text-white mx-auto flex items-center justify-center text-3xl shadow-lg">
                    <i class="fa-solid fa-shield-halved"></i>
                </div>
                <div>
                    <h2 class="font-extrabold text-2xl text-purple-950">RP MODS SYSTEM</h2>
                    <p class="text-xs text-purple-700 mt-1">กรอกรหัสผ่านเพื่อเข้าสู่ระบบ</p>
                </div>
                <div class="space-y-4">
                    <input id="pass-code" type="password" placeholder="••••••••••••" class="w-full bg-purple-50 border border-purple-300 rounded-xl p-3.5 text-center text-purple-950 outline-none">
                    <button onclick="login()" class="w-full btn-neon-purple py-3.5 rounded-xl text-xs uppercase font-bold">LOGIN NOW</button>
                </div>
            </div>
        </div>

        <!-- RESELLER PANEL SELECTOR -->
        <div id="selector-screen" class="fixed inset-0 z-40 flex items-center justify-center p-4 bg-purple-950/40 hidden">
            <div class="glass-card p-6 max-w-2xl w-full rounded-3xl space-y-5 border-2 border-purple-300">
                <div class="flex justify-between items-center border-b border-purple-200 pb-4">
                    <h3 class="font-bold text-purple-950"><i class="fa-solid fa-store text-purple-600"></i> เลือกแผง Reseller ที่ต้องการเข้าใช้งาน</h3>
                    <button onclick="logout()" class="text-xs text-rose-600 font-semibold"><i class="fa-solid fa-power-off"></i> ออกจากระบบ</button>
                </div>
                <div id="panel-list" class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto"></div>
            </div>
        </div>

        <!-- MAIN DASHBOARD HUB -->
        <div id="dashboard-screen" class="flex w-full h-screen overflow-hidden hidden">
            <aside class="w-64 border-r border-purple-200 p-4 flex flex-col justify-between bg-white shrink-0">
                <div class="space-y-6">
                    <div class="flex items-center gap-3 px-2">
                        <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 text-white flex items-center justify-center font-extrabold">
                            <i class="fa-solid fa-cube text-xl"></i>
                        </div>
                        <div>
                            <span class="font-extrabold text-lg block text-purple-950 leading-none">RP MODS</span>
                            <span class="text-[10px] text-purple-600 font-bold">STABLE SYSTEM</span>
                        </div>
                    </div>

                    <div class="bg-purple-50 border border-purple-200 p-3 rounded-2xl">
                        <div class="text-[9px] text-purple-600 font-bold uppercase">ACTIVE NODE</div>
                        <div id="active-panel-name" class="text-xs font-bold text-purple-950 truncate">ADMIN</div>
                    </div>

                    <nav class="space-y-1">
                        <div id="nav-dashboard" onclick="switchTab('dashboard')" class="sidebar-item active"><i class="fa-solid fa-chart-line w-5 text-center"></i> Live Dashboard</div>
                        <div id="nav-keys" onclick="switchTab('keys')" class="sidebar-item"><i class="fa-solid fa-key w-5 text-center"></i> License Keys</div>
                        <div id="nav-logs" onclick="switchTab('logs')" class="sidebar-item"><i class="fa-solid fa-shield-halved w-5 text-center"></i> Audit Logs</div>
                    </nav>
                </div>

                <button onclick="logout()" class="bg-purple-50 p-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-rose-50 border border-purple-200 text-rose-600 font-bold text-xs">
                    <i class="fa-solid fa-arrow-right-from-bracket"></i> Exit System
                </button>
            </aside>

            <main class="flex-1 p-8 space-y-6 overflow-y-auto">
                <header class="flex justify-between items-center pb-5 border-b border-purple-200">
                    <h1 class="text-xl font-extrabold text-purple-950">RP MODS Dashboard</h1>
                    <button onclick="openKeyModal()" class="btn-neon-purple px-4 py-2.5 rounded-xl text-xs">+ Generate Key</button>
                </header>

                <div id="tab-dashboard" class="tab-view active space-y-6">
                    <div class="grid grid-cols-4 gap-4">
                        <div class="glass-card p-5 rounded-2xl">
                            <div class="text-xs font-bold text-purple-500">TOTAL KEYS</div>
                            <div id="stat-total" class="text-3xl font-extrabold text-purple-950 mt-1">0</div>
                        </div>
                        <div class="glass-card p-5 rounded-2xl">
                            <div class="text-xs font-bold text-emerald-500">ACTIVE</div>
                            <div id="stat-active" class="text-3xl font-extrabold text-emerald-600 mt-1">0</div>
                        </div>
                        <div class="glass-card p-5 rounded-2xl">
                            <div class="text-xs font-bold text-amber-500">EXPIRED</div>
                            <div id="stat-expired" class="text-3xl font-extrabold text-amber-600 mt-1">0</div>
                        </div>
                        <div class="glass-card p-5 rounded-2xl">
                            <div class="text-xs font-bold text-rose-500">BANNED</div>
                            <div id="stat-banned" class="text-3xl font-extrabold text-rose-600 mt-1">0</div>
                        </div>
                    </div>

                    <section id="admin-panel-section" class="glass-card p-6 rounded-2xl space-y-4 hidden">
                        <div class="flex justify-between items-center pb-3 border-b border-purple-200">
                            <h3 class="font-bold text-purple-950 text-sm"><i class="fa-solid fa-users-gear text-purple-600"></i> จัดการแผง Reseller</h3>
                            <button onclick="openPanelModal()" class="btn-neon-purple px-4 py-2 rounded-xl text-xs">+ สร้างแผงใหม่</button>
                        </div>
                        <div id="admin-panel-list" class="grid grid-cols-3 gap-4"></div>
                    </section>
                </div>

                <div id="tab-keys" class="tab-view space-y-4">
                    <div class="glass-card p-6 rounded-2xl">
                        <table class="w-full text-left text-xs font-mono">
                            <thead class="text-purple-600 border-b border-purple-200">
                                <tr><th class="p-3">KEY</th><th class="p-3">DURATION</th><th class="p-3">OWNER</th><th class="p-3">ACTION</th></tr>
                            </thead>
                            <tbody id="manager-keys-body" class="divide-y divide-purple-100"></tbody>
                        </table>
                    </div>
                </div>

                <div id="tab-logs" class="tab-view space-y-4">
                    <div class="glass-card p-6 rounded-2xl">
                        <table class="w-full text-left text-xs font-mono">
                            <thead class="text-purple-600 border-b border-purple-200">
                                <tr><th class="p-3">TIMESTAMP</th><th class="p-3">USER</th><th class="p-3">ACTION</th><th class="p-3">DETAIL</th></tr>
                            </thead>
                            <tbody id="logs-table-body" class="divide-y divide-purple-100"></tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>

        <!-- MODAL CREATE PANEL -->
        <div id="modal-panel" class="fixed inset-0 bg-purple-950/40 hidden z-50 flex items-center justify-center p-4">
            <div class="glass-card p-6 max-w-md w-full rounded-3xl space-y-4 border-2 border-purple-300">
                <h3 class="text-purple-950 font-bold text-sm">สร้างแผง Reseller ใหม่</h3>
                <div class="space-y-3 text-xs">
                    <div>
                        <label class="block text-purple-800 font-bold mb-1">ชื่อแผงร้านค้า</label>
                        <input id="panel-name" type="text" placeholder="เช่น VIP Reseller Shop" class="w-full bg-purple-50 border border-purple-300 p-3 rounded-xl outline-none">
                    </div>

                    <div class="flex items-center gap-2 p-2 bg-purple-50 rounded-xl border border-purple-200">
                        <input id="panel-is-lifetime" type="checkbox" onchange="toggleDaysInput(this.checked)" class="w-4 h-4 accent-purple-600">
                        <label for="panel-is-lifetime" class="font-bold text-purple-950 cursor-pointer">♾️ ตั้งเป็นแผงถาวร (Lifetime / ไม่หมดอายุ)</label>
                    </div>

                    <div id="days-input-box">
                        <label class="block text-purple-800 font-bold mb-1">จำนวนวันใช้งาน</label>
                        <input id="panel-expire-days" type="number" value="30" class="w-full bg-purple-50 border border-purple-300 p-3 rounded-xl outline-none">
                    </div>
                </div>
                <div class="flex gap-2 pt-2">
                    <button onclick="submitCreatePanel()" class="flex-1 btn-neon-purple py-3 rounded-xl text-xs">ตกลงสร้าง</button>
                    <button onclick="closeModal('modal-panel')" class="bg-purple-100 text-purple-800 px-4 py-3 rounded-xl text-xs">ยกเลิก</button>
                </div>
            </div>
        </div>

        <script>
            let userRole = localStorage.getItem('userRole') || null;
            let currentOwner = localStorage.getItem('currentOwner') || 'ADMIN';
            let mySessionId = localStorage.getItem('mySessionId');

            if (!mySessionId) {
                mySessionId = 'sess-' + Math.random().toString(36).substring(2, 9);
                localStorage.setItem('mySessionId', mySessionId);
            }

            function toast(msg) { alert(msg); }

            function toggleDaysInput(isLifetime) {
                const daysBox = document.getElementById('days-input-box');
                if (isLifetime) daysBox.classList.add('hidden');
                else daysBox.classList.remove('hidden');
            }

            function checkAutoLogin() {
                if (userRole) {
                    document.getElementById('gate-screen').classList.add('hidden');
                    if (userRole === 'admin') showDashboard();
                    else loadPanelsForReseller();
                }
            }

            function switchTab(tabName) {
                document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));
                document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
                document.getElementById('tab-' + tabName).classList.add('active');
                document.getElementById('nav-' + tabName).classList.add('active');
            }

            async function login() {
                const code = document.getElementById('pass-code').value.trim();
                const res = await fetch('/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({code}) });
                const data = await res.json();
                if (data.success) {
                    userRole = data.role;
                    localStorage.setItem('userRole', userRole);
                    document.getElementById('gate-screen').classList.add('hidden');
                    if (userRole === 'admin') { currentOwner = 'ADMIN'; localStorage.setItem('currentOwner', 'ADMIN'); showDashboard(); }
                    else loadPanelsForReseller();
                } else toast(data.message);
            }

            async function loadPanelsForReseller() {
                document.getElementById('selector-screen').classList.remove('hidden');
                const res = await fetch('/api/panels');
                const panels = await res.json();
                
                if (panels.length === 0) {
                    document.getElementById('panel-list').innerHTML = `<div class="col-span-2 text-center text-purple-500 py-6">ยังไม่มีแผงที่ถูกสร้าง กรุณาติดต่อ Admin</div>`;
                    return;
                }

                document.getElementById('panel-list').innerHTML = panels.map(p => `
                    <div class="glass-card p-4 rounded-2xl space-y-3">
                        <div class="flex justify-between items-center">
                            <div class="font-bold text-purple-950">${p.name}</div>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${p.expiresAt ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}">
                                ${p.expiresAt ? 'จำกัดเวลา' : '♾️ ถาวร'}
                            </span>
                        </div>
                        <button onclick="claimPanel('${p.id}', '${p.name}')" class="w-full btn-neon-purple py-2 rounded-xl text-xs">เข้าใช้งานแผงนี้</button>
                    </div>
                `).join('');
            }

            async function claimPanel(panelId, panelName) {
                const res = await fetch('/api/claim-panel', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({panelId, sessionId: mySessionId}) });
                const data = await res.json();
                if (data.success) {
                    currentOwner = panelName;
                    localStorage.setItem('currentOwner', currentOwner);
                    document.getElementById('selector-screen').classList.add('hidden');
                    showDashboard();
                } else toast(data.message);
            }

            function showDashboard() {
                document.getElementById('dashboard-screen').classList.remove('hidden');
                document.getElementById('active-panel-name').innerText = currentOwner;
                if (userRole === 'admin') document.getElementById('admin-panel-section').classList.remove('hidden');
                refreshData();
            }

            function logout() {
                localStorage.clear();
                location.reload();
            }

            async function refreshData() {
                const resStat = await fetch('/api/stats?owner=' + currentOwner);
                const stat = await resStat.json();
                document.getElementById('stat-total').innerText = stat.total;
                document.getElementById('stat-active').innerText = stat.active;
                document.getElementById('stat-expired').innerText = stat.expired;
                document.getElementById('stat-banned').innerText = stat.banned;

                if (userRole === 'admin') {
                    const resP = await fetch('/api/panels');
                    const panels = await resP.json();
                    if (panels.length === 0) {
                        document.getElementById('admin-panel-list').innerHTML = `<div class="col-span-3 text-center text-purple-400 text-xs py-4">ไม่มีแผงในระบบ (กดปุ่ม + สร้างแผงใหม่ ด้านบน)</div>`;
                    } else {
                        document.getElementById('admin-panel-list').innerHTML = panels.map(p => `
                            <div class="bg-purple-50 p-4 rounded-xl border border-purple-200 space-y-2">
                                <div class="flex justify-between items-start">
                                    <div class="font-bold text-xs text-purple-950">${p.name}</div>
                                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${p.expiresAt ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">
                                        ${p.expiresAt ? 'จำกัดวัน' : '♾️ ถาวร'}
                                    </span>
                                </div>
                                <div class="text-[10px] text-purple-700">Quota: ${p.keysCreated}/${p.keyQuota}</div>
                                <button onclick="deletePanel('${p.id}')" class="text-rose-600 text-xs font-bold">ลบแผง</button>
                            </div>
                        `).join('');
                    }
                }
            }

            async function submitCreatePanel() {
                const name = document.getElementById('panel-name').value;
                const expireDays = document.getElementById('panel-expire-days').value;
                const isLifetime = document.getElementById('panel-is-lifetime').checked;

                const res = await fetch('/api/create-panel', { 
                    method: 'POST', 
                    headers: {'Content-Type':'application/json'}, 
                    body: JSON.stringify({ name, expireDays, isLifetime }) 
                });
                const data = await res.json();
                if (data.success) { closeModal('modal-panel'); refreshData(); }
                else toast(data.message);
            }

            async function deletePanel(id) {
                if (confirm('ลบแผงนี้?')) {
                    await fetch('/api/delete-panel/' + id, { method: 'DELETE' });
                    refreshData();
                }
            }

            function openPanelModal() { document.getElementById('modal-panel').classList.remove('hidden'); }
            function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
        </script>
    </body>
    </html>
    `);
});

app.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));
