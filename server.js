const express = require('express');
const app = express();

app.use(express.json());

// CONFIG KEYS
const ADMIN_CODE = "ZDSAWERBHKLJ";
const RESELLER_CODE = "ResellBBVC";

// Datastores
let keysDatabase = [
    { id: 1, key: "BRMODS-A8K2-99XZ", duration: 30, status: 'active', hwid: 'DEV-8821-X', owner: 'ADMIN' },
    { id: 2, key: "BRMODS-PL91-11QQ", duration: 1, status: 'active', hwid: 'Unbound', owner: 'ADMIN' }
];
let resellerPanels = [
    { id: 'p1', name: 'VIP GameShop', keyQuota: 500, keysCreated: 42, activeSessionId: null },
    { id: 'p2', name: 'Apex Key Store', keyQuota: 500, keysCreated: 120, activeSessionId: null }
];

function generateKey(prefix = "BRMODS") {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const rand = () => Array.from({length: 4}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    return `${prefix.toUpperCase()}-${rand()}-${rand()}`;
}

// ---------------- API ---------------- //

app.post('/api/login', (req, res) => {
    const { code } = req.body;
    if (code === ADMIN_CODE) return res.json({ success: true, role: 'admin' });
    if (code === RESELLER_CODE) return res.json({ success: true, role: 'reseller' });
    res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง!' });
});

app.get('/api/panels', (req, res) => res.json(resellerPanels));

app.post('/api/claim-panel', (req, res) => {
    const { panelId, sessionId } = req.body;
    const panel = resellerPanels.find(p => p.id === panelId);

    if (!panel) return res.status(404).json({ success: false, message: 'ไม่พบแผง' });
    if (panel.activeSessionId && panel.activeSessionId !== sessionId) {
        return res.status(403).json({ success: false, message: '🔒 แผงนี้กำลังมีผู้อื่นใช้งานอยู่!' });
    }

    panel.activeSessionId = sessionId;
    res.json({ success: true, panel });
});

app.post('/api/release-panel', (req, res) => {
    const { panelId, sessionId } = req.body;
    const panel = resellerPanels.find(p => p.id === panelId);
    if (panel && panel.activeSessionId === sessionId) panel.activeSessionId = null;
    res.json({ success: true });
});

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
        if (![1, 7, 30].includes(durationDays)) {
            return res.status(400).json({ success: false, message: 'Reseller เลือกสร้างได้เฉพาะ 1, 7 หรือ 30 วัน' });
        }
        if (panel.keysCreated + qty > panel.keyQuota) {
            return res.status(400).json({ success: false, message: 'โควตาแผงนี้เต็มแล้ว!' });
        }
        panel.keysCreated += qty;
    }

    let created = [];
    const keyPrefix = prefix && prefix.trim() !== '' ? prefix : (isReseller ? 'RESELL' : 'BRMODS');
    for (let i = 0; i < qty; i++) {
        const item = {
            id: Date.now() + i,
            key: generateKey(keyPrefix),
            duration: durationDays,
            owner: owner,
            hwid: 'Unbound',
            status: 'active'
        };
        keysDatabase.unshift(item);
        created.push(item);
    }
    res.json({ success: true, keys: created });
});

app.delete('/api/delete-key/:id', (req, res) => {
    keysDatabase = keysDatabase.filter(k => k.id !== parseInt(req.params.id));
    res.json({ success: true });
});

app.post('/api/create-panel', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อแผง' });
    const newPanel = {
        id: 'p-' + Date.now().toString().slice(-4),
        name: name.trim(),
        keyQuota: 500,
        keysCreated: 0,
        activeSessionId: null
    };
    resellerPanels.unshift(newPanel);
    res.json({ success: true });
});

app.delete('/api/delete-panel/:id', (req, res) => {
    resellerPanels = resellerPanels.filter(p => p.id !== req.params.id);
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

// ---------------- FRONTEND UI ---------------- //

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BR MODS - 3D Control Center</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
            * { font-family: 'Plus Jakarta Sans', sans-serif; }
            body { background-color: #0b0d14; color: #94a3b8; }
            ::-webkit-scrollbar { width: 5px; }
            ::-webkit-scrollbar-track { background: #0b0d14; }
            ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
            .cyber-card { background: #111520; border: 1px solid #1e2638; border-radius: 12px; }
            .sidebar-item { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; color: #64748b; transition: all 0.2s; }
            .sidebar-item:hover, .sidebar-item.active { background: #182032; color: #00f2fe; }
            .btn-cyan { background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%); color: #050b14; font-weight: 700; }
            .btn-cyan:hover { box-shadow: 0 0 15px rgba(0, 242, 254, 0.4); }
        </style>
    </head>
    <body class="min-h-screen flex text-sm">

        <div id="toast-box" class="fixed top-4 right-4 z-50 space-y-2"></div>

        <!-- 1. LOGIN GATE -->
        <div id="gate-screen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080a0f]">
            <div class="cyber-card p-8 max-w-sm w-full text-center space-y-6 shadow-2xl">
                <div class="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mx-auto flex items-center justify-center text-2xl">
                    <i class="fa-solid fa-shield-halved"></i>
                </div>
                <div>
                    <h2 class="text-white font-bold text-lg">ACCESS CONTROL</h2>
                    <p class="text-xs text-slate-500 mt-1">กรอกรหัสผ่านส่วนตัวเพื่อเปิดใช้งานแผง</p>
                </div>
                <div class="space-y-3">
                    <input id="pass-code" type="password" placeholder="••••••••••••" class="w-full bg-[#080a0f] border border-slate-800 rounded-xl p-3 text-center text-cyan-400 font-mono tracking-widest outline-none focus:border-cyan-500">
                    <button onclick="login()" class="w-full btn-cyan py-3 rounded-xl text-xs uppercase tracking-wider">เข้าสู่ระบบ</button>
                </div>
            </div>
        </div>

        <!-- 2. RESELLER PANEL SELECTOR -->
        <div id="selector-screen" class="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#080a0f] hidden">
            <div class="cyber-card p-6 max-w-xl w-full space-y-4">
                <div class="flex justify-between items-center border-b border-slate-800 pb-3">
                    <h3 class="text-white font-bold flex items-center gap-2"><i class="fa-solid fa-store text-cyan-400"></i> เลือกแผง Reseller ที่ต้องการใช้งาน</h3>
                    <button onclick="logout()" class="text-xs text-rose-400 hover:underline">ออกจากระบบ</button>
                </div>
                <div id="panel-list" class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto"></div>
            </div>
        </div>

        <!-- 3. DASHBOARD MAIN UI -->
        <div id="dashboard-screen" class="flex w-full hidden">
            <!-- SIDEBAR -->
            <aside class="w-64 border-r border-slate-800/60 p-4 flex flex-col justify-between shrink-0 bg-[#090b11]">
                <div class="space-y-6">
                    <div class="flex items-center gap-3 px-2">
                        <div class="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center font-bold">
                            <i class="fa-solid fa-shield-cat text-lg"></i>
                        </div>
                        <span class="text-white font-extrabold text-base tracking-wider">BR MODS</span>
                    </div>

                    <div class="bg-[#111622] border border-slate-800 p-3 rounded-xl flex items-center gap-3">
                        <div class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                        <div>
                            <div class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">ACTIVE NODE</div>
                            <div id="active-panel-name" class="text-xs font-bold text-white">ADMIN</div>
                        </div>
                    </div>

                    <nav class="space-y-4">
                        <div>
                            <div class="text-[10px] font-bold text-slate-600 px-3 mb-2 tracking-wider">CONTROL CENTER</div>
                            <div class="space-y-1">
                                <a href="#" class="sidebar-item active"><i class="fa-solid fa-chart-pie"></i> 3D Dashboard</a>
                                <a href="#" class="sidebar-item"><i class="fa-solid fa-key"></i> Key Manager <span id="nav-key-count" class="ml-auto text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">0</span></a>
                                <a href="#" onclick="openKeyModal()" class="sidebar-item"><i class="fa-solid fa-wand-magic-sparkles"></i> Key Generator Hub</a>
                            </div>
                        </div>

                        <div>
                            <div class="text-[10px] font-bold text-slate-600 px-3 mb-2 tracking-wider">ADVANCED TOOLS</div>
                            <div class="space-y-1">
                                <a href="#" class="sidebar-item"><i class="fa-solid fa-file-export"></i> Data Export Center</a>
                                <a href="#" class="sidebar-item"><i class="fa-solid fa-clock-rotate-left"></i> Activity Audit Log</a>
                            </div>
                        </div>
                    </nav>
                </div>

                <button onclick="logout()" class="cyber-card p-3 flex items-center justify-between hover:border-rose-500/40 group transition-all">
                    <div class="flex items-center gap-2">
                        <i class="fa-solid fa-right-from-bracket text-rose-400"></i>
                        <span class="text-xs text-slate-300 font-semibold group-hover:text-rose-400">Exit / Release Panel</span>
                    </div>
                </button>
            </aside>

            <!-- MAIN CONTENT AREA -->
            <main class="flex-1 p-6 space-y-6 overflow-y-auto">
                <header class="flex justify-between items-center pb-4 border-b border-slate-800/60">
                    <div>
                        <h1 class="text-lg font-bold text-white flex items-center gap-2">3D Control Center</h1>
                        <p class="text-xs text-slate-500">Next-Generation License Security & HWID Authentication Platform</p>
                    </div>

                    <div class="flex items-center gap-3">
                        <div class="bg-[#111622] border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs">
                            <i class="fa-solid fa-wifi text-emerald-400 text-[10px]"></i>
                            <span class="text-slate-400">Sync: 30s</span>
                        </div>
                        <button onclick="openKeyModal()" class="btn-cyan px-4 py-2 rounded-lg text-xs flex items-center gap-2">
                            <i class="fa-solid fa-plus"></i> Generate Key
                        </button>
                    </div>
                </header>

                <!-- Quick Actions Toolbar -->
                <div class="cyber-card p-3 flex items-center justify-between">
                    <div class="flex items-center gap-2 text-xs font-semibold text-slate-400">
                        <i class="fa-solid fa-bolt text-cyan-400"></i> Quick Actions:
                    </div>
                    <div class="flex gap-2">
                        <button onclick="quickGenerate(1)" class="bg-[#161f30] hover:bg-[#1e2a42] text-cyan-400 border border-cyan-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                            <i class="fa-solid fa-plus text-[10px]"></i> +1 Day Trial Key
                        </button>
                        <button onclick="quickGenerate(30)" class="bg-[#241e12] hover:bg-[#332b1a] text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                            <i class="fa-solid fa-crown text-[10px]"></i> +30 Days VIP Key
                        </button>
                    </div>
                </div>

                <!-- Stats Grid 4 Cards -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div class="cyber-card p-5 relative overflow-hidden">
                        <div class="flex justify-between items-start">
                            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">TOTAL LICENSES</span>
                            <div class="w-8 h-8 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-xs border border-cyan-500/20"><i class="fa-solid fa-database"></i></div>
                        </div>
                        <div id="stat-total" class="text-3xl font-extrabold text-white mt-3">0</div>
                        <div class="w-full bg-slate-800 h-1 rounded-full mt-4 overflow-hidden"><div class="bg-cyan-400 h-full w-full"></div></div>
                        <p class="text-[10px] text-slate-500 mt-2">All database records</p>
                    </div>

                    <div class="cyber-card p-5 relative overflow-hidden">
                        <div class="flex justify-between items-start">
                            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">ACTIVE & OPERATIONAL</span>
                            <div class="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs border border-emerald-500/20"><i class="fa-solid fa-check"></i></div>
                        </div>
                        <div class="flex items-baseline gap-2 mt-3">
                            <span id="stat-active" class="text-3xl font-extrabold text-emerald-400">0</span>
                            <span class="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">100% Active</span>
                        </div>
                        <div class="w-full bg-slate-800 h-1 rounded-full mt-4 overflow-hidden"><div class="bg-emerald-400 h-full w-full"></div></div>
                        <p class="text-[10px] text-emerald-500/80 mt-2"><i class="fa-solid fa-bolt mr-1"></i> Operational in Client</p>
                    </div>

                    <div class="cyber-card p-5 relative overflow-hidden">
                        <div class="flex justify-between items-start">
                            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">EXPIRED LICENSES</span>
                            <div class="w-8 h-8 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs border border-amber-500/20"><i class="fa-solid fa-rotate-left"></i></div>
                        </div>
                        <div id="stat-expired" class="text-3xl font-extrabold text-amber-400 mt-3">0</div>
                        <div class="w-full bg-slate-800 h-1 rounded-full mt-4 overflow-hidden"><div class="bg-amber-400 h-full w-12"></div></div>
                        <p class="text-[10px] text-amber-500/80 mt-2">Requires Extension</p>
                    </div>

                    <div class="cyber-card p-5 relative overflow-hidden">
                        <div class="flex justify-between items-start">
                            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">BANNED / BLOCKED</span>
                            <div class="w-8 h-8 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center text-xs border border-rose-500/20"><i class="fa-solid fa-ban"></i></div>
                        </div>
                        <div id="stat-banned" class="text-3xl font-extrabold text-rose-500 mt-3">0</div>
                        <div class="w-full bg-slate-800 h-1 rounded-full mt-4 overflow-hidden"><div class="bg-rose-500 h-full w-0"></div></div>
                        <p class="text-[10px] text-rose-500/80 mt-2">Blacklisted Hardware</p>
                    </div>
                </div>

                <!-- Admin Section: Manage Reseller Panels (เฉพาะ Admin เท่านั้น) -->
                <section id="admin-panel-section" class="cyber-card p-5 space-y-4 hidden">
                    <div class="flex justify-between items-center pb-3 border-b border-slate-800/80">
                        <h3 class="font-bold text-white text-sm flex items-center gap-2"><i class="fa-solid fa-users-gear text-purple-400"></i> จัดการแผง Reseller (เฉพาะ Admin)</h3>
                        <button onclick="openPanelModal()" class="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs">+ สร้างแผงใหม่</button>
                    </div>
                    <div id="admin-panel-list" class="grid grid-cols-1 md:grid-cols-3 gap-3"></div>
                </section>

                <!-- Keys Table -->
                <section class="cyber-card p-5 space-y-4">
                    <div class="flex justify-between items-center pb-3 border-b border-slate-800/80">
                        <h3 class="font-bold text-white text-sm flex items-center gap-2"><i class="fa-solid fa-list text-cyan-400"></i> License Database Records</h3>
                        <div class="text-xs text-slate-500 font-mono">Quota Used: <span id="stat-quota" class="text-cyan-400 font-bold">0 / ∞</span></div>
                    </div>

                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs font-mono">
                            <thead class="text-slate-500 uppercase font-semibold border-b border-slate-800">
                                <tr>
                                    <th class="p-3">LICENSE KEY</th>
                                    <th class="p-3">DURATION</th>
                                    <th class="p-3">OWNER</th>
                                    <th class="p-3">HWID STATUS</th>
                                    <th class="p-3 text-center">ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody id="keys-table-body" class="divide-y divide-slate-800/50"></tbody>
                        </table>
                    </div>
                </section>
            </main>
        </div>

        <!-- MODAL: Generate Key -->
        <div id="modal-key" class="fixed inset-0 bg-black/80 backdrop-blur-sm hidden z-50 flex items-center justify-center p-4">
            <div class="cyber-card p-6 max-w-md w-full space-y-4">
                <h3 class="text-white font-bold text-sm border-b border-slate-800 pb-2">Generate License Keys</h3>
                <div class="space-y-3 text-xs">
                    <div>
                        <label class="text-slate-400 block mb-1">Key Prefix</label>
                        <input id="key-prefix" type="text" placeholder="BRMODS" class="w-full bg-[#080a0f] border border-slate-800 p-2.5 rounded-lg text-cyan-400 font-mono outline-none">
                    </div>
                    <div>
                        <label class="text-slate-400 block mb-1">Duration (Days)</label>
                        <select id="key-days" class="w-full bg-[#080a0f] border border-slate-800 p-2.5 rounded-lg text-white outline-none"></select>
                    </div>
                    <div>
                        <label class="text-slate-400 block mb-1">Quantity</label>
                        <input id="key-count" type="number" value="1" min="1" max="50" class="w-full bg-[#080a0f] border border-slate-800 p-2.5 rounded-lg text-white font-mono outline-none">
                    </div>
                </div>
                <div class="flex gap-2 pt-2">
                    <button onclick="submitGenerateKey()" class="flex-1 btn-cyan py-2.5 rounded-lg text-xs">Confirm Generate</button>
                    <button onclick="closeModal('modal-key')" class="bg-slate-800 text-slate-300 px-4 py-2.5 rounded-lg text-xs">Cancel</button>
                </div>
            </div>
        </div>

        <!-- MODAL: Create Reseller Panel (เฉพาะ Admin) -->
        <div id="modal-panel" class="fixed inset-0 bg-black/80 backdrop-blur-sm hidden z-50 flex items-center justify-center p-4">
            <div class="cyber-card p-6 max-w-md w-full space-y-4">
                <h3 class="text-white font-bold text-sm border-b border-slate-800 pb-2">Create New Reseller Panel</h3>
                <div class="space-y-3 text-xs">
                    <div>
                        <label class="text-slate-400 block mb-1">Panel / Shop Name</label>
                        <input id="panel-name" type="text" placeholder="Apex Key Store" class="w-full bg-[#080a0f] border border-slate-800 p-2.5 rounded-lg text-white outline-none">
                    </div>
                </div>
                <div class="flex gap-2 pt-2">
                    <button onclick="submitCreatePanel()" class="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 rounded-lg text-xs">Create Panel</button>
                    <button onclick="closeModal('modal-panel')" class="bg-slate-800 text-slate-300 px-4 py-2.5 rounded-lg text-xs">Cancel</button>
                </div>
            </div>
        </div>

        <script>
            let userRole = null;
            let currentOwner = 'ADMIN';
            let mySessionId = 'sess-' + Math.random().toString(36).substring(2, 9);
            let selectedPanelId = null;

            function toast(msg, type = 'success') {
                const box = document.getElementById('toast-box');
                const el = document.createElement('div');
                el.className = \`p-3 rounded-lg border text-xs font-semibold flex items-center gap-2 shadow-xl \${
                    type === 'error' ? 'bg-rose-950/90 border-rose-500/50 text-rose-200' : 'bg-slate-900/90 border-cyan-500/50 text-cyan-200'
                }\`;
                el.innerHTML = \`<i class="fa-solid \${type === 'error' ? 'fa-triangle-exclamation text-rose-400' : 'fa-circle-check text-cyan-400'}"></i> \${msg}\`;
                box.appendChild(el);
                setTimeout(() => el.remove(), 3000);
            }

            async function login() {
                const code = document.getElementById('pass-code').value.trim();
                if (!code) return toast('กรุณากรอกรหัสผ่าน', 'error');

                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });
                const data = await res.json();

                if (data.success) {
                    userRole = data.role;
                    document.getElementById('pass-code').value = '';
                    document.getElementById('gate-screen').classList.add('hidden');

                    if (userRole === 'admin') {
                        currentOwner = 'ADMIN';
                        showDashboard();
                    } else {
                        loadPanelsForReseller();
                    }
                } else {
                    toast(data.message, 'error');
                }
            }

            async function loadPanelsForReseller() {
                document.getElementById('selector-screen').classList.remove('hidden');
                const res = await fetch('/api/panels');
                const panels = await res.json();

                const list = document.getElementById('panel-list');
                list.innerHTML = panels.length === 0 ? \`<div class="col-span-2 text-center text-slate-500 py-6">ไม่มีแผงให้บริการ</div>\` :
                panels.map(p => {
                    const isBusy = p.activeSessionId && p.activeSessionId !== mySessionId;
                    return \`
                        <div class="cyber-card p-4 space-y-3 \${isBusy ? 'opacity-40' : ''}">
                            <div class="flex justify-between items-center">
                                <span class="text-white font-bold">\${p.name}</span>
                                <span class="text-[9px] font-bold px-2 py-0.5 rounded \${isBusy ? 'bg-rose-950 text-rose-400' : 'bg-emerald-950 text-emerald-400'}">
                                    \${isBusy ? '🔴 มีคนใช้งานอยู่' : '🟢 พร้อมใช้งาน'}
                                </span>
                            </div>
                            <p class="text-[11px] text-slate-500 font-mono">Quota: \${p.keysCreated} / \${p.keyQuota}</p>
                            <button onclick="claimPanel('\${p.id}', '\${p.name}')" \${isBusy ? 'disabled' : ''} class="w-full \${isBusy ? 'bg-slate-800 text-slate-500' : 'btn-cyan'} py-2 rounded-lg text-xs font-bold">
                                \${isBusy ? 'แผงถูกล็อกอยู่' : 'เข้าใช้งานแผงนี้'}
                            </button>
                        </div>
                    \`;
                }).join('');
            }

            async function claimPanel(panelId, panelName) {
                const res = await fetch('/api/claim-panel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ panelId, sessionId: mySessionId })
                });
                const data = await res.json();

                if (data.success) {
                    selectedPanelId = panelId;
                    currentOwner = panelName;
                    document.getElementById('selector-screen').classList.add('hidden');
                    showDashboard();
                } else {
                    toast(data.message, 'error');
                    loadPanelsForReseller();
                }
            }

            function showDashboard() {
                document.getElementById('dashboard-screen').classList.remove('hidden');
                document.getElementById('active-panel-name').innerText = \`\${currentOwner} (\${userRole.toUpperCase()})\`;

                // ซ่อน/แสดงหมวด "จัดการแผง Reseller" ตามสิทธิ์
                if (userRole === 'admin') {
                    document.getElementById('admin-panel-section').classList.remove('hidden');
                } else {
                    document.getElementById('admin-panel-section').classList.add('hidden');
                }
                refreshData();
            }

            async function logout() {
                if (selectedPanelId) {
                    await fetch('/api/release-panel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ panelId: selectedPanelId, sessionId: mySessionId })
                    });
                }
                userRole = null;
                selectedPanelId = null;
                currentOwner = 'ADMIN';
                document.getElementById('dashboard-screen').classList.add('hidden');
                document.getElementById('selector-screen').classList.add('hidden');
                document.getElementById('gate-screen').classList.remove('hidden');
            }

            async function refreshData() {
                // Fetch Stats
                const resStat = await fetch(\`/api/stats?owner=\${currentOwner}\`);
                const stat = await resStat.json();
                document.getElementById('stat-total').innerText = stat.total;
                document.getElementById('stat-active').innerText = stat.active;
                document.getElementById('stat-expired').innerText = stat.expired;
                document.getElementById('stat-banned').innerText = stat.banned;
                document.getElementById('stat-quota').innerText = \`\${stat.used} / \${stat.max}\`;
                document.getElementById('nav-key-count').innerText = stat.total;

                // Fetch Keys
                const res = await fetch(\`/api/keys?owner=\${currentOwner}\`);
                const keys = await res.json();
                document.getElementById('keys-table-body').innerHTML = keys.length === 0 ? 
                \`<tr><td colspan="5" class="p-4 text-center text-slate-600">No Key Found</td></tr>\` :
                keys.map(k => \`
                    <tr class="hover:bg-slate-800/30">
                        <td class="p-3 text-cyan-400 font-bold">\${k.key}</td>
                        <td class="p-3 text-slate-300">\${k.duration} Days</td>
                        <td class="p-3"><span class="px-2 py-0.5 bg-slate-800 text-[10px] rounded text-slate-400">\${k.owner}</span></td>
                        <td class="p-3"><span class="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] rounded">\${k.hwid}</span></td>
                        <td class="p-3 text-center space-x-2">
                            <button onclick="navigator.clipboard.writeText('\${k.key}'); toast('คัดลอกคีย์แล้ว!');" class="text-slate-400 hover:text-cyan-400"><i class="fa-solid fa-copy"></i></button>
                            <button onclick="deleteKey(\${k.id})" class="text-slate-400 hover:text-rose-400"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                \`).join('');

                // Fetch Admin Reseller Panels (เฉพาะ Admin เท่านั้น)
                if (userRole === 'admin') {
                    const resPanels = await fetch('/api/panels');
                    const panels = await resPanels.json();
                    document.getElementById('admin-panel-list').innerHTML = panels.map(p => \`
                        <div class="bg-[#080a0f] p-3 rounded-lg border border-slate-800 flex justify-between items-center">
                            <div>
                                <div class="text-white font-bold text-xs">\${p.name}</div>
                                <div class="text-[10px] text-slate-500">Quota: \${p.keysCreated}/\${p.keyQuota} | \${p.activeSessionId ? '🔴 In Use' : '🟢 Ready'}</div>
                            </div>
                            <button onclick="deletePanel('\${p.id}')" class="text-rose-400 text-xs"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    \`).join('');
                }
            }

            async function quickGenerate(days) {
                const res = await fetch('/api/generate-key', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ count: 1, days, owner: currentOwner })
                });
                const data = await res.json();
                if (data.success) {
                    toast(\`สร้างคีย์ \${days} วัน เรียบร้อย!\`);
                    refreshData();
                } else toast(data.message, 'error');
            }

            async function submitGenerateKey() {
                const prefix = document.getElementById('key-prefix').value;
                const days = document.getElementById('key-days').value;
                const count = document.getElementById('key-count').value;

                const res = await fetch('/api/generate-key', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prefix, days, count, owner: currentOwner })
                });
                const data = await res.json();
                if (data.success) {
                    toast('สร้าง Key สำเร็จ!');
                    closeModal('modal-key');
                    refreshData();
                } else toast(data.message, 'error');
            }

            async function submitCreatePanel() {
                const name = document.getElementById('panel-name').value;
                const res = await fetch('/api/create-panel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });
                const data = await res.json();
                if (data.success) {
                    toast('สร้างแผงสำเร็จ');
                    closeModal('modal-panel');
                    refreshData();
                } else toast(data.message, 'error');
            }

            async function deleteKey(id) {
                if (confirm('ยืนยันลบ Key?')) {
                    await fetch(\`/api/delete-key/\${id}\`, { method: 'DELETE' });
                    refreshData();
                }
            }

            async function deletePanel(id) {
                if (confirm('ยืนยันลบแผงนี้?')) {
                    await fetch(\`/api/delete-panel/\${id}\`, { method: 'DELETE' });
                    refreshData();
                }
            }

            function openKeyModal() {
                const select = document.getElementById('key-days');
                if (userRole === 'reseller') {
                    select.innerHTML = \`<option value="1">1 Day</option><option value="7">7 Days</option><option value="30">30 Days</option>\`;
                } else {
                    select.innerHTML = \`<option value="1">1 Day</option><option value="7">7 Days</option><option value="30">30 Days</option><option value="90">90 Days</option><option value="365">365 Days</option>\`;
                }
                document.getElementById('modal-key').classList.remove('hidden');
            }
            function openPanelModal() { document.getElementById('modal-panel').classList.remove('hidden'); }
            function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
        </script>
    </body>
    </html>
    `);
});

app.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));
