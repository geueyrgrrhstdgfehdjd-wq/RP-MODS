const express = require('express');
const app = express();

app.use(express.json());

// CONFIG KEYS
const ADMIN_CODE = "ZDSAWERBHKLJ";
const RESELLER_CODE = "ResellBBVC";

// Datastores
let keysDatabase = [
    { id: 1, key: "NABEE-A8K2-99XZ", duration: 30, status: 'active', hwid: 'DEV-8821-X', owner: 'ADMIN', createdAt: new Date().toLocaleString('th-TH') },
    { id: 2, key: "NABEE-PL91-11QQ", duration: 1, status: 'active', hwid: 'Unbound', owner: 'ADMIN', createdAt: new Date().toLocaleString('th-TH') }
];

let resellerPanels = [
    { id: 'p1', name: 'VIP GameShop', keyQuota: 500, keysCreated: 42, boundSessionId: null, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'p2', name: 'Apex Key Store', keyQuota: 500, keysCreated: 120, boundSessionId: null, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }
];

let auditLogs = [
    { id: 1, timestamp: new Date().toLocaleString('th-TH'), action: 'SYSTEM_START', detail: 'ระบบเริ่มต้นการทำงาน', user: 'SYSTEM' }
];

function logActivity(action, detail, user) {
    auditLogs.unshift({
        id: Date.now(),
        timestamp: new Date().toLocaleString('th-TH'),
        action,
        detail,
        user
    });
    if (auditLogs.length > 50) auditLogs.pop();
}

function generateKey(prefix = "NABEE") {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const rand = () => Array.from({length: 4}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    return `${prefix.toUpperCase()}-${rand()}-${rand()}`;
}

// ---------------- API ---------------- //

app.post('/api/login', (req, res) => {
    const { code } = req.body;
    if (code === ADMIN_CODE) {
        logActivity('LOGIN', 'Admin เข้าสู่ระบบ', 'ADMIN');
        return res.json({ success: true, role: 'admin', token: 'token-admin-secret' });
    }
    if (code === RESELLER_CODE) {
        logActivity('LOGIN', 'Reseller เข้าสู่ระบบ', 'RESELLER');
        return res.json({ success: true, role: 'reseller', token: 'token-reseller-secret' });
    }
    res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง!' });
});

app.get('/api/panels', (req, res) => {
    const now = new Date();
    resellerPanels.forEach(p => {
        if (p.expiresAt && new Date(p.expiresAt) < now) {
            p.boundSessionId = null;
        }
    });
    res.json(resellerPanels);
});

app.post('/api/claim-panel', (req, res) => {
    const { panelId, sessionId } = req.body;
    const panel = resellerPanels.find(p => p.id === panelId);

    if (!panel) return res.status(404).json({ success: false, message: 'ไม่พบแผง' });
    
    if (panel.expiresAt && new Date(panel.expiresAt) < new Date()) {
        return res.status(403).json({ success: false, message: '⏳ แผงนี้หมดอายุการใช้งานแล้ว!' });
    }

    if (panel.boundSessionId && panel.boundSessionId !== sessionId) {
        return res.status(403).json({ success: false, message: '🔒 แผงนี้ถูกครอบครองโดยผู้ใช้อื่นอยู่จนกว่าจะหมดอายุ!' });
    }

    panel.boundSessionId = sessionId;
    logActivity('PANEL_CLAIM', `เข้าใช้งานและยึดแผง ${panel.name}`, panel.name);
    res.json({ success: true, panel });
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
        
        if (panel.expiresAt && new Date(panel.expiresAt) < new Date()) {
            return res.status(403).json({ success: false, message: 'แผงของคุณหมดอายุแล้ว ไม่สามารถสร้าง คีย์ ได้' });
        }

        if (![1, 7, 30].includes(durationDays)) {
            return res.status(400).json({ success: false, message: 'Reseller เลือกสร้างได้เฉพาะ 1, 7 หรือ 30 วันเท่านั้น' });
        }
        if (panel.keysCreated + qty > panel.keyQuota) {
            return res.status(400).json({ success: false, message: 'โควตาแผงนี้เต็มแล้ว!' });
        }
        panel.keysCreated += qty;
    }

    let created = [];
    const keyPrefix = prefix && prefix.trim() !== '' ? prefix : (isReseller ? 'RESELL' : 'NABEE');
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
    if (keyItem) {
        logActivity('DELETE_KEY', `ลบ Key ${keyItem.key}`, keyItem.owner);
    }
    keysDatabase = keysDatabase.filter(k => k.id !== parseInt(req.params.id));
    res.json({ success: true });
});

app.post('/api/create-panel', (req, res) => {
    const { name, expireDays } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อแผง' });
    
    const days = parseInt(expireDays) || 30;
    const expireDate = new Date();
    expireDate.setDate(expireDate.getDate() + days);

    const newPanel = {
        id: 'p-' + Date.now().toString().slice(-4),
        name: name.trim(),
        keyQuota: 500,
        keysCreated: 0,
        boundSessionId: null,
        expiresAt: expireDate.toISOString()
    };
    resellerPanels.unshift(newPanel);
    logActivity('CREATE_PANEL', `สร้างแผง Reseller ใหม่: ${name} (อายุ ${days} วัน)`, 'ADMIN');
    res.json({ success: true });
});

app.post('/api/update-panel-expiry', (req, res) => {
    const { panelId, addDays } = req.body;
    const panel = resellerPanels.find(p => p.id === panelId);
    if (!panel) return res.status(404).json({ success: false, message: 'ไม่พบแผง' });

    let currentExp = new Date(panel.expiresAt) > new Date() ? new Date(panel.expiresAt) : new Date();
    currentExp.setDate(currentExp.getDate() + parseInt(addDays));
    panel.expiresAt = currentExp.toISOString();

    logActivity('UPDATE_PANEL', `ขยายเวลาแผง ${panel.name} อีก ${addDays} วัน`, 'ADMIN');
    res.json({ success: true, newExpiry: panel.expiresAt });
});

app.delete('/api/delete-panel/:id', (req, res) => {
    const panel = resellerPanels.find(p => p.id === req.params.id);
    if (panel) logActivity('DELETE_PANEL', `ลบแผง Reseller: ${panel.name}`, 'ADMIN');
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
        max: panel ? panel.keyQuota : '∞',
        panelExpiresAt: panel ? panel.expiresAt : null
    });
});

app.get('/api/logs', (req, res) => {
    const owner = req.query.owner || 'ADMIN';
    res.json(owner === 'ADMIN' ? auditLogs : auditLogs.filter(l => l.user === owner || l.user === 'SYSTEM'));
});

// ---------------- FRONTEND UI (NABEEPROXYS STYLE) ---------------- //

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NABEE PROXIES & LICENSES — Official Store</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
        <style>
            * { font-family: 'Kanit', sans-serif; box-sizing: border-box; }
            .font-space { font-family: 'Space Grotesk', sans-serif; }
            .font-mono { font-family: 'JetBrains Mono', monospace; }
            
            body { 
                background: #080a12; 
                color: #94a3b8; 
                overflow-x: hidden;
            }

            /* Scrollbar */
            ::-webkit-scrollbar { width: 6px; height: 6px; }
            ::-webkit-scrollbar-track { background: #080a12; }
            ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 99px; }
            ::-webkit-scrollbar-thumb:hover { background: #8b5cf6; }

            /* Nabee Modern Glass Cards */
            .nabee-card {
                background: rgba(15, 21, 37, 0.75);
                backdrop-filter: blur(16px);
                border: 1px solid rgba(255, 255, 255, 0.08);
                box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
            }

            .nabee-card-hover {
                transition: all 0.3s ease;
            }
            .nabee-card-hover:hover {
                transform: translateY(-4px);
                border-color: rgba(139, 92, 246, 0.4);
                box-shadow: 0 10px 30px rgba(139, 92, 246, 0.15);
            }

            /* Purple Glow Gradient Buttons */
            .btn-nabee-primary {
                background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
                color: #ffffff;
                font-weight: 600;
                box-shadow: 0 4px 20px rgba(139, 92, 246, 0.35);
                transition: all 0.25s ease;
            }
            .btn-nabee-primary:hover {
                box-shadow: 0 6px 28px rgba(139, 92, 246, 0.6);
                transform: translateY(-2px);
            }

            .btn-nabee-secondary {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: #f1f5f9;
                transition: all 0.25s ease;
            }
            .btn-nabee-secondary:hover {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.2);
            }

            .sidebar-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 16px;
                border-radius: 12px;
                font-size: 14px;
                font-weight: 500;
                color: #64748b;
                transition: all 0.2s ease;
                cursor: pointer;
            }
            .sidebar-item:hover { 
                background: rgba(255, 255, 255, 0.04); 
                color: #f1f5f9; 
            }
            .sidebar-item.active {
                background: rgba(139, 92, 246, 0.15);
                color: #a78bfa;
                border: 1px solid rgba(139, 92, 246, 0.3);
            }

            .tab-view { display: none; opacity: 0; transition: opacity 0.25s ease; }
            .tab-view.active { display: block; opacity: 1; }

            /* Ambient Background Aura */
            .aura-1 { position: fixed; top: -200px; left: 20%; width: 600px; height: 600px; background: radial-gradient(circle, rgba(139,92,246,0.12) 0%, rgba(0,0,0,0) 70%); pointer-events: none; }
            .aura-2 { position: fixed; bottom: -200px; right: 10%; width: 500px; height: 500px; background: radial-gradient(circle, rgba(99,102,241,0.1) 0%, rgba(0,0,0,0) 70%); pointer-events: none; }
        </style>
    </head>
    <body class="min-h-screen flex text-sm relative" onload="checkAutoLogin()">

        <div class="aura-1"></div>
        <div class="aura-2"></div>

        <div id="toast-box" class="fixed top-6 right-6 z-50 space-y-3"></div>

        <!-- 1. AUTHENTICATION OVERLAY -->
        <div id="gate-screen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080a12]/95 backdrop-blur-2xl">
            <div class="nabee-card p-8 max-w-md w-full rounded-3xl text-center space-y-6 relative overflow-hidden border border-purple-500/20 shadow-2xl">
                <div class="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 mx-auto flex items-center justify-center text-3xl shadow-lg shadow-purple-500/10">
                    <i class="fa-solid fa-store"></i>
                </div>
                
                <div>
                    <h2 class="font-space text-2xl font-bold text-white tracking-wide">NABEE PROXIES</h2>
                    <p class="text-xs text-slate-400 mt-1">ระบบจัดการ License Key และสินค้าไอทีออนไลน์</p>
                </div>

                <div class="space-y-4">
                    <input id="pass-code" type="password" placeholder="กรอกรหัสผ่านเพื่อเข้าใช้งาน..." class="w-full bg-[#0d111d] border border-slate-800 rounded-2xl py-3.5 px-4 text-center text-purple-300 font-mono tracking-widest outline-none focus:border-purple-500 transition-all text-sm">
                    <button onclick="login()" class="w-full btn-nabee-primary py-3.5 rounded-2xl text-xs uppercase font-bold tracking-wider">เข้าสู่ระบบ (SIGN IN)</button>
                </div>
            </div>
        </div>

        <!-- 2. RESELLER PANEL SELECTOR -->
        <div id="selector-screen" class="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#080a12]/95 backdrop-blur-2xl hidden">
            <div class="nabee-card p-8 max-w-2xl w-full rounded-3xl space-y-6 border border-purple-500/20">
                <div class="flex justify-between items-center border-b border-slate-800/80 pb-5">
                    <div>
                        <h3 class="text-white font-bold text-lg flex items-center gap-2"><i class="fa-solid fa-shop text-purple-400"></i> เลือกแผงร้านค้าของคุณ</h3>
                        <p class="text-xs text-slate-400 mt-0.5">เลือกแผง Reseller ที่ครอบครองเพื่อเริ่มทำรายการ</p>
                    </div>
                    <button onclick="logout()" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 font-bold"><i class="fa-solid fa-power-off"></i> ออกจากระบบ</button>
                </div>
                <div id="panel-list" class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1"></div>
            </div>
        </div>

        <!-- 3. MAIN DASHBOARD HUB -->
        <div id="dashboard-screen" class="flex w-full h-screen overflow-hidden hidden z-10">
            <!-- SIDEBAR -->
            <aside class="w-64 border-r border-slate-800/80 p-5 flex flex-col justify-between shrink-0 bg-[#0b0e1a]/90 backdrop-blur-xl">
                <div class="space-y-7">
                    <!-- BRAND LOGO -->
                    <div class="flex items-center gap-3 px-2">
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-lg shadow-purple-500/25">
                            <i class="fa-solid fa-shield-halved text-lg"></i>
                        </div>
                        <div>
                            <span class="font-space text-white font-bold text-lg tracking-wide block leading-none">NABEE</span>
                            <span class="text-[10px] text-purple-400 font-mono tracking-wider">OFFICIAL STORE</span>
                        </div>
                    </div>

                    <!-- ACTIVE USER BADGE -->
                    <div class="nabee-card p-3.5 rounded-2xl flex items-center gap-3 border border-slate-800/80">
                        <div class="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400"></div>
                        <div class="overflow-hidden">
                            <div class="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">NODE ACTIVE</div>
                            <div id="active-panel-name" class="text-xs font-bold text-white truncate">ADMIN</div>
                            <div id="panel-expire-badge" class="text-[10px] text-amber-400 font-mono mt-0.5"></div>
                        </div>
                    </div>

                    <!-- NAVIGATION -->
                    <nav class="space-y-5">
                        <div>
                            <div class="text-[10px] font-bold text-slate-500 px-3 mb-2 tracking-wider uppercase font-mono">เมนูหลัก</div>
                            <div class="space-y-1">
                                <div id="nav-dashboard" onclick="switchTab('dashboard')" class="sidebar-item active"><i class="fa-solid fa-chart-pie w-5"></i> หน้าแรก (Dashboard)</div>
                                <div id="nav-keys" onclick="switchTab('keys')" class="sidebar-item"><i class="fa-solid fa-key w-5"></i> จัดการคีย์ (Licenses) <span id="nav-key-count" class="ml-auto text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-purple-400 font-mono">0</span></div>
                                <div id="nav-generator" onclick="switchTab('generator')" class="sidebar-item"><i class="fa-solid fa-plus-circle w-5"></i> สร้างคีย์ใหม่</div>
                            </div>
                        </div>

                        <div>
                            <div class="text-[10px] font-bold text-slate-500 px-3 mb-2 tracking-wider uppercase font-mono">ระบบ & ประวัติ</div>
                            <div class="space-y-1">
                                <div id="nav-export" onclick="switchTab('export')" class="sidebar-item"><i class="fa-solid fa-file-arrow-down w-5"></i> ส่งออกข้อมูล (Export)</div>
                                <div id="nav-logs" onclick="switchTab('logs')" class="sidebar-item"><i class="fa-solid fa-clock-rotate-left w-5"></i> ประวัติทำรายการ</div>
                            </div>
                        </div>
                    </nav>
                </div>

                <button onclick="logout()" class="btn-nabee-secondary p-3 rounded-xl flex items-center justify-center gap-2 text-rose-400 hover:text-rose-300 hover:border-rose-500/30 text-xs font-bold transition-all">
                    <i class="fa-solid fa-arrow-right-from-bracket"></i>
                    <span>ออกจากระบบ</span>
                </button>
            </aside>

            <!-- MAIN CONTENT AREA -->
            <main class="flex-1 p-8 space-y-6 overflow-y-auto h-full">
                <!-- TOP HEADER BAR -->
                <header class="flex justify-between items-center pb-5 border-b border-slate-800/80">
                    <div>
                        <h1 id="page-title" class="text-xl font-bold text-white tracking-wide flex items-center gap-2.5"><i class="fa-solid fa-store text-purple-400"></i> แผงควบคุมระบบ (STORE DASHBOARD)</h1>
                        <p class="text-xs text-slate-400 mt-1">ยินดีต้อนรับสู่ระบบจัดการคีย์และบริการของ NABEE PROXIES</p>
                    </div>

                    <div class="flex items-center gap-3">
                        <button onclick="openKeyModal()" class="btn-nabee-primary px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 font-bold">
                            <i class="fa-solid fa-plus"></i> สร้างคีย์ด่วน
                        </button>
                    </div>
                </header>

                <!-- TAB 1: LIVE DASHBOARD -->
                <div id="tab-dashboard" class="tab-view active space-y-6">
                    <!-- Quick Actions Banner -->
                    <div class="nabee-card p-5 rounded-2xl flex items-center justify-between border-l-4 border-l-purple-500">
                        <div class="flex items-center gap-3 text-xs font-bold text-slate-200">
                            <div class="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center text-lg"><i class="fa-solid fa-bolt"></i></div>
                            <div>
                                <div class="text-sm">สร้างคีย์ด่วนแบบรวดเร็ว</div>
                                <div class="text-slate-400 text-[11px] font-normal">คลิกสร้างคีย์ทดลองหรือคีย์ VIP ได้ทันทีในปุ่มเดียว</div>
                            </div>
                        </div>
                        <div class="flex gap-2.5">
                            <button onclick="quickGenerate(1)" class="btn-nabee-secondary px-4 py-2 rounded-xl text-xs font-bold transition-all">
                                +1 วัน (Trial)
                            </button>
                            <button onclick="quickGenerate(30)" class="btn-nabee-primary px-4 py-2 rounded-xl text-xs font-bold transition-all">
                                +30 วัน (VIP)
                            </button>
                        </div>
                    </div>

                    <!-- STATS CARDS GRID -->
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div class="nabee-card nabee-card-hover p-5 rounded-2xl space-y-3">
                            <div class="flex justify-between items-center">
                                <span class="text-[11px] font-bold text-slate-400 uppercase font-mono">คีย์ทั้งหมด</span>
                                <div class="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center text-sm"><i class="fa-solid fa-box-archive"></i></div>
                            </div>
                            <div id="stat-total" class="text-2xl font-bold font-space text-white">0</div>
                        </div>

                        <div class="nabee-card nabee-card-hover p-5 rounded-2xl space-y-3">
                            <div class="flex justify-between items-center">
                                <span class="text-[11px] font-bold text-slate-400 uppercase font-mono">ใช้งานได้ (ACTIVE)</span>
                                <div class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-sm"><i class="fa-solid fa-circle-check"></i></div>
                            </div>
                            <div id="stat-active" class="text-2xl font-bold font-space text-emerald-400">0</div>
                        </div>

                        <div class="nabee-card nabee-card-hover p-5 rounded-2xl space-y-3">
                            <div class="flex justify-between items-center">
                                <span class="text-[11px] font-bold text-slate-400 uppercase font-mono">หมดอายุแล้ว</span>
                                <div class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-sm"><i class="fa-solid fa-clock-rotate-left"></i></div>
                            </div>
                            <div id="stat-expired" class="text-2xl font-bold font-space text-amber-400">0</div>
                        </div>

                        <div class="nabee-card nabee-card-hover p-5 rounded-2xl space-y-3">
                            <div class="flex justify-between items-center">
                                <span class="text-[11px] font-bold text-slate-400 uppercase font-mono">ถูกระงับ (BANNED)</span>
                                <div class="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center text-sm"><i class="fa-solid fa-ban"></i></div>
                            </div>
                            <div id="stat-banned" class="text-2xl font-bold font-space text-rose-500">0</div>
                        </div>
                    </div>

                    <!-- ADMIN SECTION: RESELLER MANAGER -->
                    <section id="admin-panel-section" class="nabee-card p-6 rounded-2xl space-y-4 hidden border border-purple-500/30">
                        <div class="flex justify-between items-center pb-3 border-b border-slate-800">
                            <div>
                                <h3 class="font-bold text-white text-base flex items-center gap-2"><i class="fa-solid fa-users-gear text-purple-400"></i> จัดการแผงร้านค้า Reseller ( ADMIN ONLY )</h3>
                                <p class="text-xs text-slate-400 mt-0.5">สร้าง ต่ออายุ หรือลบแผงลูกค้ารายย่อย</p>
                            </div>
                            <button onclick="openPanelModal()" class="btn-nabee-primary px-3.5 py-2 rounded-xl text-xs font-bold">+ เพิ่มแผงใหม่</button>
                        </div>
                        <div id="admin-panel-list" class="grid grid-cols-1 md:grid-cols-3 gap-4"></div>
                    </section>

                    <!-- PREVIEW RECENT KEYS -->
                    <section class="nabee-card p-6 rounded-2xl space-y-4">
                        <div class="flex justify-between items-center pb-3 border-b border-slate-800">
                            <h3 class="font-bold text-white text-base flex items-center gap-2"><i class="fa-solid fa-list-check text-purple-400"></i> คีย์ที่สร้างล่าสุด</h3>
                            <div class="text-xs text-slate-400 font-mono">โควตาคงเหลือ: <span id="stat-quota" class="text-purple-400 font-bold">0 / ∞</span></div>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-xs font-mono">
                                <thead class="text-slate-500 uppercase font-semibold border-b border-slate-800">
                                    <tr>
                                        <th class="p-3">LICENSE KEY</th>
                                        <th class="p-3">ระยะเวลา</th>
                                        <th class="p-3">เจ้าของแผง</th>
                                        <th class="p-3">สถานะ HWID</th>
                                        <th class="p-3 text-center">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody id="dashboard-keys-body" class="divide-y divide-slate-800/50"></tbody>
                            </table>
                        </div>
                    </section>
                </div>

                <!-- TAB 2: KEY MANAGER -->
                <div id="tab-keys" class="tab-view space-y-4">
                    <div class="nabee-card p-4 rounded-2xl flex flex-col md:flex-row justify-between gap-4 items-center">
                        <div class="relative w-full md:w-96">
                            <i class="fa-solid fa-magnifying-glass absolute left-4 top-3.5 text-slate-500"></i>
                            <input id="key-search" oninput="renderKeyManager()" type="text" placeholder="ค้นหาตาม Key / HWID / เจ้าของ..." class="w-full bg-[#0d111d] border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white outline-none focus:border-purple-500 transition-all font-mono">
                        </div>
                        <button onclick="refreshData()" class="btn-nabee-secondary px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                            <i class="fa-solid fa-rotate"></i> อัปเดตข้อมูล
                        </button>
                    </div>

                    <div class="nabee-card p-6 rounded-2xl">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-xs font-mono">
                                <thead class="text-slate-500 uppercase font-semibold border-b border-slate-800">
                                    <tr>
                                        <th class="p-3">LICENSE KEY</th>
                                        <th class="p-3">ระยะเวลา</th>
                                        <th class="p-3">วันที่สร้าง</th>
                                        <th class="p-3">เจ้าของแผง</th>
                                        <th class="p-3">สถานะ HWID</th>
                                        <th class="p-3 text-center">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody id="manager-keys-body" class="divide-y divide-slate-800/50"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- TAB 3: GENERATOR HUB -->
                <div id="tab-generator" class="tab-view space-y-4">
                    <div class="nabee-card p-8 max-w-md mx-auto rounded-3xl space-y-5 border border-purple-500/20">
                        <div class="border-b border-slate-800 pb-3">
                            <h3 class="font-bold text-white text-base flex items-center gap-2"><i class="fa-solid fa-wand-magic-sparkles text-purple-400"></i> ออก License Key ใหม่</h3>
                            <p class="text-xs text-slate-400 mt-1">เลือกคำนำหน้า ระยะเวลาวัน และจำนวนคีย์</p>
                        </div>
                        <div class="space-y-4 text-xs">
                            <div>
                                <label class="text-slate-300 block mb-1.5 font-semibold">คำนำหน้า Key (Prefix)</label>
                                <input id="gen-prefix" type="text" placeholder="NABEE" class="w-full bg-[#0d111d] border border-slate-800 p-3 rounded-xl text-purple-300 font-mono outline-none focus:border-purple-500">
                            </div>
                            <div>
                                <label class="text-slate-300 block mb-1.5 font-semibold">ระยะเวลาการใช้งาน (วัน)</label>
                                <div id="gen-days-container"></div>
                            </div>
                            <div>
                                <label class="text-slate-300 block mb-1.5 font-semibold">จำนวนคีย์ที่ต้องการสร้าง</label>
                                <input id="gen-count" type="number" value="1" min="1" max="50" class="w-full bg-[#0d111d] border border-slate-800 p-3 rounded-xl text-white font-mono outline-none focus:border-purple-500">
                            </div>
                            <button onclick="submitGenHub()" class="w-full btn-nabee-primary py-3.5 rounded-xl text-xs uppercase font-bold tracking-wider mt-2">ยืนยันสร้าง Key</button>
                        </div>
                    </div>
                </div>

                <!-- TAB 4: EXPORT -->
                <div id="tab-export" class="tab-view space-y-4">
                    <div class="nabee-card p-8 max-w-md mx-auto rounded-3xl space-y-5 border border-purple-500/20 text-center">
                        <div class="border-b border-slate-800 pb-3">
                            <h3 class="font-bold text-white text-base flex items-center justify-center gap-2"><i class="fa-solid fa-file-arrow-down text-purple-400"></i> ส่งออกข้อมูล Key (EXPORT)</h3>
                            <p class="text-xs text-slate-400 mt-1">ดาวน์โหลดข้อมูลรายการคีย์ออกมาเป็นไฟล์สำรอง</p>
                        </div>
                        <div class="grid grid-cols-2 gap-4 pt-2">
                            <button onclick="exportData('txt')" class="nabee-card nabee-card-hover p-5 rounded-2xl flex flex-col items-center gap-2">
                                <i class="fa-solid fa-file-lines text-3xl text-purple-400"></i>
                                <span class="text-white font-bold text-xs">ไฟล์ .TXT</span>
                            </button>
                            <button onclick="exportData('csv')" class="nabee-card nabee-card-hover p-5 rounded-2xl flex flex-col items-center gap-2">
                                <i class="fa-solid fa-file-csv text-3xl text-emerald-400"></i>
                                <span class="text-white font-bold text-xs">ไฟล์ .CSV</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- TAB 5: AUDIT LOGS -->
                <div id="tab-logs" class="tab-view space-y-4">
                    <div class="nabee-card p-6 rounded-2xl space-y-4">
                        <div class="flex justify-between items-center pb-3 border-b border-slate-800">
                            <h3 class="font-bold text-white text-base flex items-center gap-2"><i class="fa-solid fa-clock-rotate-left text-purple-400"></i> ประวัติการทำรายการในระบบ</h3>
                            <button onclick="loadLogs()" class="text-xs text-purple-400 hover:underline font-mono"><i class="fa-solid fa-rotate"></i> รีเฟรชประวัติ</button>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-xs font-mono">
                                <thead class="text-slate-500 uppercase font-semibold border-b border-slate-800">
                                    <tr>
                                        <th class="p-3">เวลาทำรายการ</th>
                                        <th class="p-3">ผู้ใช้งาน</th>
                                        <th class="p-3">การกระทำ</th>
                                        <th class="p-3">รายละเอียด</th>
                                    </tr>
                                </thead>
                                <tbody id="logs-table-body" class="divide-y divide-slate-800/50"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>

        <!-- MODAL: GENERATE KEY -->
        <div id="modal-key" class="fixed inset-0 bg-black/80 backdrop-blur-md hidden z-50 flex items-center justify-center p-4">
            <div class="nabee-card p-7 max-w-md w-full rounded-3xl space-y-5 border border-purple-500/30">
                <h3 class="text-white font-bold text-base border-b border-slate-800 pb-3">สร้าง License Key ด่วน</h3>
                <div class="space-y-4 text-xs">
                    <div>
                        <label class="text-slate-400 block mb-1">Prefix คำนำหน้า</label>
                        <input id="key-prefix" type="text" placeholder="NABEE" class="w-full bg-[#0d111d] border border-slate-800 p-3 rounded-xl text-purple-300 font-mono outline-none">
                    </div>
                    <div>
                        <label class="text-slate-400 block mb-1">จำนวนวันใช้งาน</label>
                        <div id="modal-days-container"></div>
                    </div>
                    <div>
                        <label class="text-slate-400 block mb-1">จำนวนคีย์ที่ต้องการ</label>
                        <input id="key-count" type="number" value="1" min="1" max="50" class="w-full bg-[#0d111d] border border-slate-800 p-3 rounded-xl text-white font-mono outline-none">
                    </div>
                </div>
                <div class="flex gap-2.5 pt-2">
                    <button onclick="submitGenerateKey()" class="flex-1 btn-nabee-primary py-3 rounded-xl text-xs font-bold">ตกลงสร้าง คีย์</button>
                    <button onclick="closeModal('modal-key')" class="btn-nabee-secondary px-5 py-3 rounded-xl text-xs font-bold">ยกเลิก</button>
                </div>
            </div>
        </div>

        <!-- MODAL: CREATE PANEL -->
        <div id="modal-panel" class="fixed inset-0 bg-black/80 backdrop-blur-md hidden z-50 flex items-center justify-center p-4">
            <div class="nabee-card p-7 max-w-md w-full rounded-3xl space-y-5 border border-purple-500/30">
                <h3 class="text-white font-bold text-base border-b border-slate-800 pb-3">เพิ่มแผง Reseller ใหม่</h3>
                <div class="space-y-4 text-xs">
                    <div>
                        <label class="text-slate-400 block mb-1">ชื่อแผง / ชื่อร้านค้า</label>
                        <input id="panel-name" type="text" placeholder="Apex Key Store" class="w-full bg-[#0d111d] border border-slate-800 p-3 rounded-xl text-white outline-none">
                    </div>
                    <div>
                        <label class="text-slate-400 block mb-1">อายุการใช้งานแผง (จำนวนวัน)</label>
                        <input id="panel-expire-days" type="number" value="30" min="1" class="w-full bg-[#0d111d] border border-slate-800 p-3 rounded-xl text-white font-mono outline-none">
                    </div>
                </div>
                <div class="flex gap-2.5 pt-2">
                    <button onclick="submitCreatePanel()" class="flex-1 btn-nabee-primary py-3 rounded-xl text-xs font-bold">สร้างแผง</button>
                    <button onclick="closeModal('modal-panel')" class="btn-nabee-secondary px-5 py-3 rounded-xl text-xs font-bold">ยกเลิก</button>
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

            let loadedKeysData = [];

            function toast(msg, type = 'success') {
                const box = document.getElementById('toast-box');
                const el = document.createElement('div');
                el.className = \`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-3 shadow-xl backdrop-blur-xl transition-all duration-300 \${
                    type === 'error' ? 'bg-rose-950/90 border-rose-500/40 text-rose-200' : 'bg-slate-900/90 border-purple-500/40 text-purple-200'
                }\`;
                el.innerHTML = \`<i class="fa-solid \${type === 'error' ? 'fa-triangle-exclamation text-rose-400' : 'fa-circle-check text-purple-400'} text-base"></i> \${msg}\`;
                box.appendChild(el);
                setTimeout(() => el.remove(), 3000);
            }

            function checkAutoLogin() {
                if (userRole) {
                    document.getElementById('gate-screen').classList.add('hidden');
                    if (userRole === 'admin') {
                        showDashboard();
                    } else if (currentOwner !== 'ADMIN') {
                        showDashboard();
                    } else {
                        loadPanelsForReseller();
                    }
                }
            }

            function switchTab(tabName) {
                document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));
                document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
                
                document.getElementById(\`tab-\${tabName}\`).classList.add('active');
                document.getElementById(\`nav-\${tabName}\`).classList.add('active');

                if (tabName === 'logs') loadLogs();
                if (tabName === 'generator') updateGeneratorInputFields('gen-days-container', 'gen-days');
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
                    localStorage.setItem('userRole', userRole);
                    document.getElementById('pass-code').value = '';
                    document.getElementById('gate-screen').classList.add('hidden');

                    if (userRole === 'admin') {
                        currentOwner = 'ADMIN';
                        localStorage.setItem('currentOwner', 'ADMIN');
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
                list.innerHTML = panels.length === 0 ? \`<div class="col-span-2 text-center text-slate-500 py-8 font-mono">ไม่มีแผงที่พร้อมใช้งาน</div>\` :
                panels.map(p => {
                    const isExpired = p.expiresAt && new Date(p.expiresAt) < new Date();
                    const isTakenByOther = p.boundSessionId && p.boundSessionId !== mySessionId;
                    const isMyPanel = p.boundSessionId === mySessionId;

                    let statusBadge = '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30">🟢 พร้อมใช้งาน</span>';
                    if (isExpired) statusBadge = '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-950 text-rose-400 border border-rose-500/30">🔴 หมดอายุ</span>';
                    else if (isMyPanel) statusBadge = '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-950 text-purple-400 border border-purple-500/30">👑 แผงของคุณ</span>';
                    else if (isTakenByOther) statusBadge = '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-500/30">🔒 มีผู้ใช้อยู่</span>';

                    const expDateStr = p.expiresAt ? new Date(p.expiresAt).toLocaleDateString('th-TH') : 'ไม่มี';

                    return \`
                        <div class="nabee-card p-5 rounded-2xl space-y-3.5 border border-slate-800 \${(isTakenByOther || isExpired) ? 'opacity-50' : ''}">
                            <div class="flex justify-between items-center">
                                <span class="text-white font-bold text-sm">\${p.name}</span>
                                \${statusBadge}
                            </div>
                            <div class="text-xs text-slate-400 space-y-1 font-mono bg-[#0d111d] p-3 rounded-xl border border-slate-800">
                                <div>โควตาคีย์: \${p.keysCreated} / \${p.keyQuota}</div>
                                <div class="text-amber-400">วันหมดอายุ: \${expDateStr}</div>
                            </div>
                            <button onclick="claimPanel('\${p.id}', '\${p.name}')" \${(isTakenByOther || isExpired) ? 'disabled' : ''} class="w-full \${(isTakenByOther || isExpired) ? 'bg-slate-800 text-slate-500' : 'btn-nabee-primary'} py-2.5 rounded-xl text-xs font-bold transition-all">
                                \${isExpired ? 'หมดอายุ' : (isTakenByOther ? 'ถูกยึดโดยผู้อื่น' : (isMyPanel ? 'เข้าสู่แผงของคุณ' : 'เข้าใช้งานแผงนี้'))}
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
                    currentOwner = panelName;
                    localStorage.setItem('currentOwner', currentOwner);
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

                if (userRole === 'admin') {
                    document.getElementById('admin-panel-section').classList.remove('hidden');
                } else {
                    document.getElementById('admin-panel-section').classList.add('hidden');
                }
                refreshData();
            }

            function logout() {
                localStorage.clear();
                userRole = null;
                currentOwner = 'ADMIN';
                document.getElementById('dashboard-screen').classList.add('hidden');
                document.getElementById('selector-screen').classList.add('hidden');
                document.getElementById('gate-screen').classList.remove('hidden');
            }

            async function refreshData() {
                const resStat = await fetch(\`/api/stats?owner=\${currentOwner}\`);
                const stat = await resStat.json();
                document.getElementById('stat-total').innerText = stat.total;
                document.getElementById('stat-active').innerText = stat.active;
                document.getElementById('stat-expired').innerText = stat.expired;
                document.getElementById('stat-banned').innerText = stat.banned;
                document.getElementById('stat-quota').innerText = \`\${stat.used} / \${stat.max}\`;
                document.getElementById('nav-key-count').innerText = stat.total;

                if (stat.panelExpiresAt) {
                    const exp = new Date(stat.panelExpiresAt).toLocaleDateString('th-TH');
                    document.getElementById('panel-expire-badge').innerText = \`หมดอายุ: \${exp}\`;
                } else {
                    document.getElementById('panel-expire-badge').innerText = '';
                }

                const res = await fetch(\`/api/keys?owner=\${currentOwner}\`);
                loadedKeysData = await res.json();
                
                renderDashboardKeys();
                renderKeyManager();

                if (userRole === 'admin') {
                    const resPanels = await fetch('/api/panels');
                    const panels = await resPanels.json();
                    document.getElementById('admin-panel-list').innerHTML = panels.map(p => {
                        const expStr = p.expiresAt ? new Date(p.expiresAt).toLocaleDateString('th-TH') : 'ไม่มี';
                        return \`
                        <div class="bg-[#0d111d] p-4 rounded-xl border border-slate-800 space-y-2.5">
                            <div class="flex justify-between items-center">
                                <div class="text-white font-bold text-xs font-space">\${p.name}</div>
                                <button onclick="deletePanel('\${p.id}')" class="text-rose-400 text-xs hover:text-rose-300"><i class="fa-solid fa-trash"></i></button>
                            </div>
                            <div class="text-[10px] text-slate-400 space-y-0.5 font-mono">
                                <div>โควตา: \${p.keysCreated}/\${p.keyQuota}</div>
                                <div>สถานะ: \${p.boundSessionId ? '🔴 มีผู้ยึดอยู่' : '🟢 ว่าง'}</div>
                                <div class="text-amber-400">หมดอายุ: \${expStr}</div>
                            </div>
                            <div class="pt-2 flex gap-2">
                                <button onclick="extendPanel('\${p.id}', 7)" class="bg-slate-800 hover:bg-slate-700 text-[10px] text-purple-300 font-bold px-2.5 py-1 rounded-lg">+7 วัน</button>
                                <button onclick="extendPanel('\${p.id}', 30)" class="bg-slate-800 hover:bg-slate-700 text-[10px] text-purple-300 font-bold px-2.5 py-1 rounded-lg">+30 วัน</button>
                            </div>
                        </div>
                    \`}).join('');
                }
            }

            async function extendPanel(panelId, days) {
                const res = await fetch('/api/update-panel-expiry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ panelId, addDays: days })
                });
                const data = await res.json();
                if (data.success) {
                    toast('ขยายเวลาแผงเรียบร้อย!');
                    refreshData();
                }
            }

            function renderDashboardKeys() {
                const keys = loadedKeysData.slice(0, 5);
                document.getElementById('dashboard-keys-body').innerHTML = keys.length === 0 ? 
                \`<tr><td colspan="5" class="p-4 text-center text-slate-600 font-mono">ไม่พบคีย์ในระบบ</td></tr>\` :
                keys.map(k => \`
                    <tr class="hover:bg-slate-800/30 transition-colors">
                        <td class="p-3 text-purple-400 font-bold font-mono">\${k.key}</td>
                        <td class="p-3 text-slate-300">\${k.duration} วัน</td>
                        <td class="p-3"><span class="px-2 py-0.5 bg-slate-800 text-[10px] rounded text-slate-300 border border-slate-700">\${k.owner}</span></td>
                        <td class="p-3"><span class="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] rounded border border-purple-500/20 font-mono">\${k.hwid}</span></td>
                        <td class="p-3 text-center space-x-2">
                            <button onclick="navigator.clipboard.writeText('\${k.key}'); toast('คัดลอกคีย์แล้ว!');" class="text-slate-400 hover:text-purple-400"><i class="fa-solid fa-copy"></i></button>
                            <button onclick="deleteKey(\${k.id})" class="text-slate-400 hover:text-rose-400"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                \`).join('');
            }

            function renderKeyManager() {
                const search = document.getElementById('key-search').value.toLowerCase();
                const filtered = loadedKeysData.filter(k => k.key.toLowerCase().includes(search) || k.hwid.toLowerCase().includes(search) || k.owner.toLowerCase().includes(search));

                document.getElementById('manager-keys-body').innerHTML = filtered.length === 0 ? 
                \`<tr><td colspan="6" class="p-4 text-center text-slate-600 font-mono">ไม่พบข้อมูลที่ตรงกัน</td></tr>\` :
                filtered.map(k => \`
                    <tr class="hover:bg-slate-800/30 transition-colors">
                        <td class="p-3 text-purple-400 font-bold font-mono">\${k.key}</td>
                        <td class="p-3 text-slate-300">\${k.duration} วัน</td>
                        <td class="p-3 text-slate-500 text-[10px]">\${k.createdAt || '-'}</td>
                        <td class="p-3"><span class="px-2 py-0.5 bg-slate-800 text-[10px] rounded text-slate-300 border border-slate-700">\${k.owner}</span></td>
                        <td class="p-3"><span class="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] rounded border border-purple-500/20 font-mono">\${k.hwid}</span></td>
                        <td class="p-3 text-center space-x-2">
                            <button onclick="navigator.clipboard.writeText('\${k.key}'); toast('คัดลอกคีย์แล้ว!');" class="text-slate-400 hover:text-purple-400"><i class="fa-solid fa-copy"></i></button>
                            <button onclick="deleteKey(\${k.id})" class="text-slate-400 hover:text-rose-400"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                \`).join('');
            }

            async function loadLogs() {
                const res = await fetch(\`/api/logs?owner=\${currentOwner}\`);
                const logs = await res.json();
                document.getElementById('logs-table-body').innerHTML = logs.length === 0 ? 
                \`<tr><td colspan="4" class="p-4 text-center text-slate-600 font-mono">ไม่มีประวัติการทำรายการ</td></tr>\` :
                logs.map(l => \`
                    <tr class="hover:bg-slate-800/30 transition-colors">
                        <td class="p-3 text-slate-500 text-[10px] font-mono">\${l.timestamp}</td>
                        <td class="p-3 font-bold text-slate-300">\${l.user}</td>
                        <td class="p-3"><span class="px-2 py-0.5 bg-purple-950 text-purple-400 text-[10px] rounded border border-purple-800/50 font-mono">\${l.action}</span></td>
                        <td class="p-3 text-slate-400 font-mono">\${l.detail}</td>
                    </tr>
                \`).join('');
            }

            function updateGeneratorInputFields(containerId, inputId) {
                const container = document.getElementById(containerId);
                if (userRole === 'admin') {
                    container.innerHTML = \`<input id="\${inputId}" type="number" value="30" min="1" placeholder="ระบุจำนวนวันกี่วันก็ได้" class="w-full bg-[#0d111d] border border-slate-800 p-3 rounded-xl text-white font-mono outline-none focus:border-purple-500">\`;
                } else {
                    container.innerHTML = \`
                        <select id="\${inputId}" class="w-full bg-[#0d111d] border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-purple-500 font-bold">
                            <option value="1">1 วัน</option>
                            <option value="7">7 วัน</option>
                            <option value="30">30 วัน</option>
                        </select>
                    \`;
                }
            }

            async function submitGenHub() {
                const prefix = document.getElementById('gen-prefix').value;
                const days = document.getElementById('gen-days').value;
                const count = document.getElementById('gen-count').value;

                const res = await fetch('/api/generate-key', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prefix, days, count, owner: currentOwner })
                });
                const data = await res.json();
                if (data.success) {
                    toast('สร้าง Key สำเร็จ!');
                    refreshData();
                    switchTab('keys');
                } else toast(data.message, 'error');
            }

            function exportData(format) {
                if (loadedKeysData.length === 0) return toast('ไม่มีข้อมูล License สำหรับส่งออก', 'error');

                let content = "";
                let filename = \`licenses_\${Date.now()}.\${format}\`;

                if (format === 'txt') {
                    content = loadedKeysData.map(k => k.key).join('\\n');
                } else {
                    content = "Key,Duration,Owner,HWID,CreatedAt\\n" + 
                        loadedKeysData.map(k => \`"\${k.key}",\${k.duration},"\${k.owner}","\${k.hwid}","\${k.createdAt || ''}"\`).join('\\n');
                }

                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                link.click();
                toast(\`ดาวน์โหลดไฟล์ .\${format.toUpperCase()} สำเร็จ!\`);
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
                const days = document.getElementById('modal-days').value;
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
                const expireDays = document.getElementById('panel-expire-days').value;

                const res = await fetch('/api/create-panel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, expireDays })
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
                updateGeneratorInputFields('modal-days-container', 'modal-days');
                document.getElementById('modal-key').classList.remove('hidden');
            }
            function openPanelModal() { document.getElementById('modal-panel').classList.remove('hidden'); }
            function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
        </script>
    </body>
    </html>
    `);
});

app.listen(3000, () => console.log('🚀 Nabee Proxies Shop running on http://localhost:3000'));
