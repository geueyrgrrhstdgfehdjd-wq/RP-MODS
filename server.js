const express = require('express');
const app = express();

app.use(express.json());

// CONFIG KEYS
const ADMIN_CODE = "ZDSAWERBHKLJ";
const RESELLER_CODE = "ResellBBVC";

// Datastores
let keysDatabase = [
    { id: 1, key: "RPMODS-A8K2-99XZ", duration: 30, status: 'active', hwid: 'DEV-8821-X', owner: 'ADMIN', createdAt: new Date().toLocaleString('th-TH') },
    { id: 2, key: "RPMODS-PL91-11QQ", duration: 1, status: 'active', hwid: 'Unbound', owner: 'ADMIN', createdAt: new Date().toLocaleString('th-TH') }
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

function generateKey(prefix = "RPMODS") {
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

// ---------------- FRONTEND UI (PURPLE NEON STYLE) ---------------- //

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
        <title>RP MODS - Neon Violet Hub</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
        <style>
            * { font-family: 'Plus Jakarta Sans', sans-serif; box-sizing: border-box; }
            .font-mono { font-family: 'Space Grotesk', monospace; }
            
            /* NEON PURPLE THEME BACKGROUND */
            body { 
                background: #090514; 
                color: #e2e8f0; 
                overflow-x: hidden; 
            }

            ::-webkit-scrollbar { width: 6px; height: 6px; }
            ::-webkit-scrollbar-track { background: #090514; }
            ::-webkit-scrollbar-thumb { background: #2e1065; border-radius: 10px; }
            ::-webkit-scrollbar-thumb:hover { background: #a855f7; }

            /* GLASS CARD WITH NEON BORDER */
            .glass-card {
                background: rgba(18, 10, 36, 0.75);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(168, 85, 247, 0.18);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
            }

            .glass-card-hover {
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .glass-card-hover:hover {
                transform: translateY(-4px);
                border-color: rgba(192, 132, 252, 0.5);
                box-shadow: 0 0 25px rgba(168, 85, 247, 0.25);
            }

            /* WHITE-PURPLE NEON BUTTON */
            .btn-neon-purple {
                background: linear-gradient(135deg, #ffffff 0%, #c084fc 50%, #9333ea 100%);
                color: #000000;
                font-weight: 800;
                box-shadow: 0 0 20px rgba(192, 132, 252, 0.4);
                transition: all 0.25s ease;
            }
            .btn-neon-purple:hover {
                box-shadow: 0 0 30px rgba(192, 132, 252, 0.8);
                transform: scale(1.02);
            }

            .sidebar-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 16px;
                border-radius: 14px;
                font-size: 13px;
                font-weight: 600;
                color: #94a3b8;
                transition: all 0.25s ease;
                cursor: pointer;
                white-space: nowrap;
            }
            .sidebar-item:hover { background: rgba(168, 85, 247, 0.1); color: #ffffff; }
            .sidebar-item.active {
                background: linear-gradient(90deg, rgba(168, 85, 247, 0.25) 0%, rgba(168, 85, 247, 0.02) 100%);
                border-left: 3px solid #c084fc;
                color: #ffffff;
                box-shadow: inset 10px 0 20px -10px rgba(192, 132, 252, 0.3);
            }

            /* COLLAPSED SIDEBAR STYLE */
            .sidebar-collapsed {
                width: 80px !important;
            }
            .sidebar-collapsed .sidebar-text,
            .sidebar-collapsed .sidebar-hide-on-collapse {
                display: none !important;
            }
            .sidebar-collapsed .sidebar-item {
                justify-content: center;
                padding: 12px;
            }

            .tab-view { display: none; opacity: 0; transition: opacity 0.3s ease; }
            .tab-view.active { display: block; opacity: 1; }

            /* NEON GLOW LIGHTS IN BACKGROUND */
            .bg-glow-1 { position: fixed; top: -10%; left: -10%; width: 50vw; height: 50vw; background: radial-gradient(circle, rgba(168,85,247,0.15) 0%, rgba(0,0,0,0) 70%); pointer-events: none; }
            .bg-glow-2 { position: fixed; bottom: -10%; right: -10%; width: 50vw; height: 50vw; background: radial-gradient(circle, rgba(236,72,153,0.12) 0%, rgba(0,0,0,0) 70%); pointer-events: none; }
            
            /* NEON TEXT EFFECT */
            .neon-text-purple {
                text-shadow: 0 0 12px rgba(192, 132, 252, 0.6);
            }
        </style>
    </head>
    <body class="min-h-screen flex text-sm relative" onload="checkAutoLogin()">

        <div class="bg-glow-1"></div>
        <div class="bg-glow-2"></div>

        <div id="toast-box" class="fixed top-5 right-5 z-50 space-y-3"></div>

        <!-- 1. LOGIN GATE -->
        <div id="gate-screen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#05020a]/90 backdrop-blur-xl">
            <div class="glass-card p-8 max-w-md w-full rounded-3xl text-center space-y-6 relative overflow-hidden">
                <div class="absolute -top-12 -right-12 w-32 h-32 bg-purple-500/20 rounded-full blur-2xl"></div>
                
                <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 text-white mx-auto flex items-center justify-center text-3xl shadow-lg shadow-purple-500/40">
                    <i class="fa-solid fa-shield-halved"></i>
                </div>
                
                <div>
                    <h2 class="text-white font-extrabold text-xl tracking-wider uppercase neon-text-purple">RP MODS SYSTEM</h2>
                    <p class="text-xs text-purple-300/60 mt-1">เข้าสู่ระบบจัดการ License คีย์ และ เอเยนต์</p>
                </div>

                <div class="space-y-4">
                    <input id="pass-code" type="password" placeholder="••••••••••••" class="w-full bg-[#0c061a] border border-purple-900/60 rounded-xl p-3.5 text-center text-purple-300 font-mono tracking-widest outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all">
                    <button onclick="login()" class="w-full btn-neon-purple py-3.5 rounded-xl text-xs uppercase tracking-widest font-bold">LOGIN NOW</button>
                </div>
            </div>
        </div>

        <!-- 2. RESELLER PANEL SELECTOR -->
        <div id="selector-screen" class="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#05020a]/95 backdrop-blur-xl hidden">
            <div class="glass-card p-6 max-w-2xl w-full rounded-3xl space-y-5">
                <div class="flex justify-between items-center border-b border-purple-900/40 pb-4">
                    <h3 class="text-white font-bold text-base flex items-center gap-2"><i class="fa-solid fa-store text-purple-400"></i> เลือกแผง Reseller ที่ต้องการเข้าใช้งาน</h3>
                    <button onclick="logout()" class="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-semibold"><i class="fa-solid fa-power-off"></i> ออกจากระบบ</button>
                </div>
                <div id="panel-list" class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1"></div>
            </div>
        </div>

        <!-- MOBILE BACKDROP OVERLAY -->
        <div id="sidebar-overlay" onclick="toggleMobileSidebar(false)" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-30 hidden md:hidden"></div>

        <!-- 3. MAIN DASHBOARD HUB -->
        <div id="dashboard-screen" class="flex w-full h-screen overflow-hidden hidden z-10">
            
            <!-- SIDEBAR -->
            <aside id="main-sidebar" class="fixed md:static inset-y-0 left-0 z-40 w-64 border-r border-purple-900/30 p-4 flex flex-col justify-between shrink-0 bg-[#0a0518] backdrop-blur-xl transform -translate-x-full md:translate-x-0 transition-all duration-300 ease-in-out h-full overflow-y-auto pb-12 md:pb-4">
                <div class="space-y-6">
                    <!-- BRAND HEADER -->
                    <div class="flex items-center justify-between px-2">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-500 to-pink-500 text-white flex items-center justify-center font-extrabold shadow-lg shadow-purple-500/40 shrink-0">
                                <i class="fa-solid fa-cube text-xl"></i>
                            </div>
                            <div class="sidebar-text">
                                <span class="text-white font-extrabold text-lg tracking-wider block leading-none neon-text-purple">RP MODS</span>
                                <span class="text-[10px] text-purple-400 font-mono tracking-widest">NEON VIOLET</span>
                            </div>
                        </div>
                        <button onclick="toggleMobileSidebar(false)" class="md:hidden text-purple-400 hover:text-white p-2">
                            <i class="fa-solid fa-xmark text-lg"></i>
                        </button>
                    </div>

                    <!-- USER BADGE -->
                    <div class="bg-[#120926] border border-purple-900/40 p-3 rounded-2xl flex items-center gap-3 sidebar-hide-on-collapse">
                        <div class="relative shrink-0">
                            <div class="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]"></div>
                            <div class="w-3 h-3 rounded-full bg-emerald-400 absolute inset-0 animate-ping opacity-75"></div>
                        </div>
                        <div class="overflow-hidden">
                            <div class="text-[9px] text-purple-400 font-bold uppercase tracking-wider">ACTIVE NODE</div>
                            <div id="active-panel-name" class="text-xs font-bold text-white truncate">ADMIN</div>
                            <div id="panel-expire-badge" class="text-[10px] text-amber-400 font-mono mt-0.5"></div>
                        </div>
                    </div>

                    <!-- NAVIGATION -->
                    <nav class="space-y-5">
                        <div>
                            <div class="text-[10px] font-bold text-purple-400/60 px-3 mb-2 tracking-widest uppercase sidebar-text">Overview</div>
                            <div class="space-y-1">
                                <div id="nav-dashboard" onclick="switchTab('dashboard')" class="sidebar-item active" title="Live Dashboard"><i class="fa-solid fa-chart-line w-5 text-center text-purple-300"></i> <span class="sidebar-text">Live Dashboard</span></div>
                                <div id="nav-keys" onclick="switchTab('keys')" class="sidebar-item" title="License Keys"><i class="fa-solid fa-key w-5 text-center text-purple-300"></i> <span class="sidebar-text">License Keys</span> <span id="nav-key-count" class="sidebar-text ml-auto text-[10px] bg-purple-950/80 border border-purple-800/50 px-2 py-0.5 rounded-full text-purple-300 font-mono">0</span></div>
                                <div id="nav-generator" onclick="switchTab('generator')" class="sidebar-item" title="Key Generator"><i class="fa-solid fa-wand-magic-sparkles w-5 text-center text-purple-300"></i> <span class="sidebar-text">Key Generator</span></div>
                            </div>
                        </div>

                        <div>
                            <div class="text-[10px] font-bold text-purple-400/60 px-3 mb-2 tracking-widest uppercase sidebar-text">Management</div>
                            <div class="space-y-1">
                                <div id="nav-export" onclick="switchTab('export')" class="sidebar-item" title="Export Data"><i class="fa-solid fa-file-export w-5 text-center text-purple-300"></i> <span class="sidebar-text">Export Data</span></div>
                                <div id="nav-logs" onclick="switchTab('logs')" class="sidebar-item" title="Audit Logs"><i class="fa-solid fa-shield-halved w-5 text-center text-purple-300"></i> <span class="sidebar-text">Audit Logs</span></div>
                            </div>
                        </div>
                    </nav>
                </div>

                <button onclick="logout()" class="glass-card p-3 mt-6 rounded-2xl flex items-center justify-between hover:border-rose-500/50 group transition-all shrink-0">
                    <div class="flex items-center gap-2.5 mx-auto md:mx-0">
                        <i class="fa-solid fa-arrow-right-from-bracket text-rose-400 group-hover:translate-x-1 transition-transform"></i>
                        <span class="text-xs text-slate-300 font-bold group-hover:text-rose-400 sidebar-text">Exit System</span>
                    </div>
                </button>
            </aside>

            <!-- MAIN CONTENT CONTAINER -->
            <main class="flex-1 p-4 md:p-8 space-y-6 overflow-y-auto h-full pb-20 md:pb-8">
                
                <!-- TOP HEADER -->
                <header class="flex justify-between items-center pb-5 border-b border-purple-900/30 gap-3">
                    <div class="flex items-center gap-3">
                        <!-- TOGGLE DESKTOP SIDEBAR BUTTON -->
                        <button onclick="toggleDesktopSidebar()" class="hidden md:flex bg-[#120926] border border-purple-800/40 text-purple-300 p-2.5 rounded-xl hover:border-purple-500 transition-all shadow-lg shadow-purple-950/50">
                            <i class="fa-solid fa-bars-staggered text-lg"></i>
                        </button>
                        <!-- TOGGLE MOBILE SIDEBAR BUTTON -->
                        <button onclick="toggleMobileSidebar(true)" class="md:hidden bg-[#120926] border border-purple-800/40 text-purple-300 p-2.5 rounded-xl hover:border-purple-500">
                            <i class="fa-solid fa-bars text-lg"></i>
                        </button>

                        <div>
                            <h1 id="page-title" class="text-lg md:text-xl font-extrabold text-white flex items-center gap-2 tracking-wide neon-text-purple">RP MODS Hub</h1>
                            <p class="text-[11px] md:text-xs text-purple-300/60 mt-0.5 hidden sm:block">Next-Generation License Security & Authentication Platform</p>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 md:gap-3">
                        <div class="glass-card px-3 py-2 rounded-xl hidden sm:flex items-center gap-2 text-xs border-purple-800/30">
                            <span class="w-2 h-2 rounded-full bg-purple-400 animate-pulse shadow-[0_0_8px_#c084fc]"></span>
                            <span class="text-purple-200 font-mono text-[11px]">System Online</span>
                        </div>
                        <button onclick="openKeyModal()" class="btn-neon-purple px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 whitespace-nowrap">
                            <i class="fa-solid fa-plus"></i> <span class="hidden sm:inline">Generate</span> License
                        </button>
                    </div>
                </header>

                <!-- TAB 1: DASHBOARD -->
                <div id="tab-dashboard" class="tab-view active space-y-6">
                    <div class="glass-card p-4 rounded-2xl flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between border-l-4 border-l-purple-400">
                        <div class="flex items-center gap-3 text-xs font-semibold text-purple-200">
                            <div class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-300 flex items-center justify-center shrink-0 border border-purple-500/20"><i class="fa-solid fa-bolt text-sm"></i></div>
                            <span>สร้างคีย์ด่วน (Quick Key Gen)</span>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="quickGenerate(1)" class="flex-1 sm:flex-none bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 border border-purple-500/40 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                                +1 Day Trial
                            </button>
                            <button onclick="quickGenerate(30)" class="flex-1 sm:flex-none bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white border border-pink-400/40 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(236,72,153,0.3)]">
                                +30 Days VIP
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                        <div class="glass-card glass-card-hover p-4 md:p-5 rounded-2xl space-y-2 md:space-y-3">
                            <div class="flex justify-between items-center">
                                <span class="text-[10px] md:text-[11px] font-bold text-purple-300/60 uppercase tracking-widest">TOTAL LICENSES</span>
                                <div class="w-7 h-7 md:w-9 md:h-9 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs md:text-sm border border-purple-500/30"><i class="fa-solid fa-database"></i></div>
                            </div>
                            <div id="stat-total" class="text-2xl md:text-3xl font-extrabold text-white font-mono neon-text-purple">0</div>
                            <div class="w-full bg-purple-950/60 h-1.5 rounded-full overflow-hidden"><div class="bg-purple-400 h-full w-full"></div></div>
                        </div>

                        <div class="glass-card glass-card-hover p-4 md:p-5 rounded-2xl space-y-2 md:space-y-3">
                            <div class="flex justify-between items-center">
                                <span class="text-[10px] md:text-[11px] font-bold text-purple-300/60 uppercase tracking-widest">ACTIVE KEYS</span>
                                <div class="w-7 h-7 md:w-9 md:h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs md:text-sm border border-emerald-500/30"><i class="fa-solid fa-circle-check"></i></div>
                            </div>
                            <div id="stat-active" class="text-2xl md:text-3xl font-extrabold text-emerald-400 font-mono">0</div>
                            <div class="w-full bg-purple-950/60 h-1.5 rounded-full overflow-hidden"><div class="bg-emerald-400 h-full w-full"></div></div>
                        </div>

                        <div class="glass-card glass-card-hover p-4 md:p-5 rounded-2xl space-y-2 md:space-y-3">
                            <div class="flex justify-between items-center">
                                <span class="text-[10px] md:text-[11px] font-bold text-purple-300/60 uppercase tracking-widest">EXPIRED</span>
                                <div class="w-7 h-7 md:w-9 md:h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center text-xs md:text-sm border border-amber-500/30"><i class="fa-solid fa-clock-rotate-left"></i></div>
                            </div>
                            <div id="stat-expired" class="text-2xl md:text-3xl font-extrabold text-amber-400 font-mono">0</div>
                            <div class="w-full bg-purple-950/60 h-1.5 rounded-full overflow-hidden"><div class="bg-amber-400 h-full w-1/4"></div></div>
                        </div>

                        <div class="glass-card glass-card-hover p-4 md:p-5 rounded-2xl space-y-2 md:space-y-3">
                            <div class="flex justify-between items-center">
                                <span class="text-[10px] md:text-[11px] font-bold text-purple-300/60 uppercase tracking-widest">BANNED</span>
                                <div class="w-7 h-7 md:w-9 md:h-9 rounded-xl bg-rose-500/20 text-rose-300 flex items-center justify-center text-xs md:text-sm border border-rose-500/30"><i class="fa-solid fa-ban"></i></div>
                            </div>
                            <div id="stat-banned" class="text-2xl md:text-3xl font-extrabold text-rose-500 font-mono">0</div>
                            <div class="w-full bg-purple-950/60 h-1.5 rounded-full overflow-hidden"><div class="bg-rose-500 h-full w-0"></div></div>
                        </div>
                    </div>

                    <section id="admin-panel-section" class="glass-card p-4 md:p-6 rounded-2xl space-y-4 hidden">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-900/30">
                            <h3 class="font-bold text-white text-sm flex items-center gap-2"><i class="fa-solid fa-users-gear text-purple-400"></i> จัดการแผง Reseller (เฉพาะ Admin)</h3>
                            <button onclick="openPanelModal()" class="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-[0_0_15px_rgba(147,51,234,0.4)]">+ สร้างแผงใหม่</button>
                        </div>
                        <div id="admin-panel-list" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"></div>
                    </section>

                    <section class="glass-card p-4 md:p-6 rounded-2xl space-y-4">
                        <div class="flex justify-between items-center pb-3 border-b border-purple-900/30">
                            <h3 class="font-bold text-white text-sm flex items-center gap-2"><i class="fa-solid fa-list-check text-purple-400"></i> Recent Keys Created</h3>
                            <div class="text-xs text-purple-300/60 font-mono">Quota: <span id="stat-quota" class="text-purple-300 font-bold">0 / ∞</span></div>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-xs font-mono min-w-[500px]">
                                <thead class="text-purple-300/50 uppercase font-semibold border-b border-purple-900/30">
                                    <tr>
                                        <th class="p-3">LICENSE KEY</th>
                                        <th class="p-3">DURATION</th>
                                        <th class="p-3">OWNER</th>
                                        <th class="p-3">HWID STATUS</th>
                                        <th class="p-3 text-center">ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody id="dashboard-keys-body" class="divide-y divide-purple-900/20"></tbody>
                            </table>
                        </div>
                    </section>
                </div>

                <!-- TAB 2: KEY MANAGER -->
                <div id="tab-keys" class="tab-view space-y-4">
                    <div class="glass-card p-4 rounded-2xl flex flex-col md:flex-row justify-between gap-3 items-center">
                        <div class="relative w-full md:w-80">
                            <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-3 text-purple-400/60"></i>
                            <input id="key-search" oninput="renderKeyManager()" type="text" placeholder="ค้นหา Key / HWID..." class="w-full bg-[#0c061a] border border-purple-900/60 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white outline-none focus:border-purple-500">
                        </div>
                        <button onclick="refreshData()" class="w-full md:w-auto bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-800/40 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2">
                            <i class="fa-solid fa-rotate"></i> รีเฟรชข้อมูล
                        </button>
                    </div>

                    <div class="glass-card p-4 md:p-6 rounded-2xl">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-xs font-mono min-w-[600px]">
                                <thead class="text-purple-300/50 uppercase font-semibold border-b border-purple-900/30">
                                    <tr>
                                        <th class="p-3">LICENSE KEY</th>
                                        <th class="p-3">DURATION</th>
                                        <th class="p-3">CREATED AT</th>
                                        <th class="p-3">OWNER</th>
                                        <th class="p-3">HWID STATUS</th>
                                        <th class="p-3 text-center">ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody id="manager-keys-body" class="divide-y divide-purple-900/20"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- TAB 3: GENERATOR HUB -->
                <div id="tab-generator" class="tab-view space-y-4">
                    <div class="glass-card p-6 md:p-8 max-w-lg mx-auto rounded-3xl space-y-6 border-purple-500/30">
                        <div class="border-b border-purple-900/30 pb-4">
                            <h3 class="text-white font-extrabold text-base flex items-center gap-2 neon-text-purple"><i class="fa-solid fa-wand-magic-sparkles text-purple-400"></i> Key Generator Hub</h3>
                            <p class="text-xs text-purple-300/60 mt-1">ออกรหัส License Key ใหม่ตามเงื่อนไขสิทธิ์ของคุณ</p>
                        </div>
                        <div class="space-y-4 text-xs">
                            <div>
                                <label class="text-purple-200 block mb-1.5 font-bold">Key Prefix (คำนำหน้า)</label>
                                <input id="gen-prefix" type="text" placeholder="RPMODS" class="w-full bg-[#0c061a] border border-purple-900/60 p-3.5 rounded-xl text-purple-300 font-mono outline-none focus:border-purple-500">
                            </div>
                            <div>
                                <label class="text-purple-200 block mb-1.5 font-bold">ระยะเวลา (Duration)</label>
                                <div id="gen-days-container"></div>
                            </div>
                            <div>
                                <label class="text-purple-200 block mb-1.5 font-bold">จำนวนที่ต้องการสร้าง (Quantity)</label>
                                <input id="gen-count" type="number" value="1" min="1" max="50" class="w-full bg-[#0c061a] border border-purple-900/60 p-3.5 rounded-xl text-white font-mono outline-none focus:border-purple-500">
                            </div>
                            <button onclick="submitGenHub()" class="w-full btn-neon-purple py-3.5 rounded-xl text-xs uppercase tracking-widest font-bold mt-2">ยืนยันสร้าง Key</button>
                        </div>
                    </div>
                </div>

                <!-- TAB 4: EXPORT -->
                <div id="tab-export" class="tab-view space-y-4">
                    <div class="glass-card p-6 md:p-8 max-w-lg mx-auto rounded-3xl space-y-6">
                        <div class="border-b border-purple-900/30 pb-4">
                            <h3 class="text-white font-extrabold text-base flex items-center gap-2 neon-text-purple"><i class="fa-solid fa-file-export text-purple-400"></i> Export License Data</h3>
                            <p class="text-xs text-purple-300/60 mt-1">ดาวน์โหลดข้อมูล Key ทั้งหมดออกมาเป็นไฟล์</p>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button onclick="exportData('txt')" class="glass-card glass-card-hover p-6 rounded-2xl flex flex-col items-center gap-3 text-center border-purple-800/30">
                                <i class="fa-solid fa-file-lines text-4xl text-purple-400"></i>
                                <div>
                                    <div class="text-white font-bold text-xs">Export .TXT</div>
                                    <div class="text-[10px] text-purple-300/50 mt-1">เรียงบรรทัดนำไปใช้ง่าย</div>
                                </div>
                            </button>
                            <button onclick="exportData('csv')" class="glass-card glass-card-hover p-6 rounded-2xl flex flex-col items-center gap-3 text-center border-purple-800/30">
                                <i class="fa-solid fa-file-csv text-4xl text-pink-400"></i>
                                <div>
                                    <div class="text-white font-bold text-xs">Export .CSV</div>
                                    <div class="text-[10px] text-purple-300/50 mt-1">ตารางเปิดใน Excel</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- TAB 5: LOGS -->
                <div id="tab-logs" class="tab-view space-y-4">
                    <div class="glass-card p-4 md:p-6 rounded-2xl space-y-4">
                        <div class="flex justify-between items-center pb-3 border-b border-purple-900/30">
                            <h3 class="font-bold text-white text-sm flex items-center gap-2"><i class="fa-solid fa-clock-rotate-left text-purple-400"></i> Activity Audit Log</h3>
                            <button onclick="loadLogs()" class="text-xs text-purple-300 hover:underline"><i class="fa-solid fa-rotate"></i> โหลดประวัติใหม่</button>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-xs font-mono min-w-[500px]">
                                <thead class="text-purple-300/50 uppercase font-semibold border-b border-purple-900/30">
                                    <tr>
                                        <th class="p-3">TIMESTAMP</th>
                                        <th class="p-3">USER/PANEL</th>
                                        <th class="p-3">ACTION</th>
                                        <th class="p-3">DETAILS</th>
                                    </tr>
                                </thead>
                                <tbody id="logs-table-body" class="divide-y divide-purple-900/20"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>

        <!-- MODAL GENERATE KEY -->
        <div id="modal-key" class="fixed inset-0 bg-black/80 backdrop-blur-md hidden z-50 flex items-center justify-center p-4">
            <div class="glass-card p-6 max-w-md w-full rounded-3xl space-y-4 border-purple-500/40">
                <h3 class="text-white font-bold text-sm border-b border-purple-900/30 pb-3">Generate License Keys</h3>
                <div class="space-y-3 text-xs">
                    <div>
                        <label class="text-purple-200 block mb-1 font-semibold">Key Prefix</label>
                        <input id="key-prefix" type="text" placeholder="RPMODS" class="w-full bg-[#0c061a] border border-purple-900/60 p-3 rounded-xl text-purple-300 font-mono outline-none">
                    </div>
                    <div>
                        <label class="text-purple-200 block mb-1 font-semibold">Duration (Days)</label>
                        <div id="modal-days-container"></div>
                    </div>
                    <div>
                        <label class="text-purple-200 block mb-1 font-semibold">Quantity</label>
                        <input id="key-count" type="number" value="1" min="1" max="50" class="w-full bg-[#0c061a] border border-purple-900/60 p-3 rounded-xl text-white font-mono outline-none">
                    </div>
                </div>
                <div class="flex gap-2 pt-2">
                    <button onclick="submitGenerateKey()" class="flex-1 btn-neon-purple py-3 rounded-xl text-xs font-bold">Confirm Generate</button>
                    <button onclick="closeModal('modal-key')" class="bg-purple-950/60 text-purple-300 border border-purple-800/40 px-4 py-3 rounded-xl text-xs font-bold">Cancel</button>
                </div>
            </div>
        </div>

        <!-- MODAL CREATE PANEL -->
        <div id="modal-panel" class="fixed inset-0 bg-black/80 backdrop-blur-md hidden z-50 flex items-center justify-center p-4">
            <div class="glass-card p-6 max-w-md w-full rounded-3xl space-y-4 border-purple-500/40">
                <h3 class="text-white font-bold text-sm border-b border-purple-900/30 pb-3">Create New Reseller Panel</h3>
                <div class="space-y-3 text-xs">
                    <div>
                        <label class="text-purple-200 block mb-1 font-semibold">Panel / Shop Name</label>
                        <input id="panel-name" type="text" placeholder="Apex Key Store" class="w-full bg-[#0c061a] border border-purple-900/60 p-3 rounded-xl text-white outline-none">
                    </div>
                    <div>
                        <label class="text-purple-200 block mb-1 font-semibold">ระยะเวลาหมดอายุของแผง (จำนวนวัน)</label>
                        <input id="panel-expire-days" type="number" value="30" min="1" class="w-full bg-[#0c061a] border border-purple-900/60 p-3 rounded-xl text-white font-mono outline-none">
                    </div>
                </div>
                <div class="flex gap-2 pt-2">
                    <button onclick="submitCreatePanel()" class="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-3 rounded-xl text-xs shadow-lg shadow-purple-600/40">Create Panel</button>
                    <button onclick="closeModal('modal-panel')" class="bg-purple-950/60 text-purple-300 border border-purple-800/40 px-4 py-3 rounded-xl text-xs font-bold">Cancel</button>
                </div>
            </div>
        </div>

        <script>
            let userRole = localStorage.getItem('userRole') || null;
            let currentOwner = localStorage.getItem('currentOwner') || 'ADMIN';
            let mySessionId = localStorage.getItem('mySessionId');
            let isSidebarCollapsed = false;

            if (!mySessionId) {
                mySessionId = 'sess-' + Math.random().toString(36).substring(2, 9);
                localStorage.setItem('mySessionId', mySessionId);
            }

            let loadedKeysData = [];

            // DESKTOP SIDEBAR TOGGLE FUNCTION
            function toggleDesktopSidebar() {
                const sidebar = document.getElementById('main-sidebar');
                isSidebarCollapsed = !isSidebarCollapsed;
                if (isSidebarCollapsed) {
                    sidebar.classList.add('sidebar-collapsed');
                } else {
                    sidebar.classList.remove('sidebar-collapsed');
                }
            }

            // MOBILE SIDEBAR TOGGLE FUNCTION
            function toggleMobileSidebar(open) {
                const sidebar = document.getElementById('main-sidebar');
                const overlay = document.getElementById('sidebar-overlay');
                if (open) {
                    sidebar.classList.remove('-translate-x-full');
                    overlay.classList.remove('hidden');
                } else {
                    sidebar.classList.add('-translate-x-full');
                    overlay.classList.add('hidden');
                }
            }

            function toast(msg, type = 'success') {
                const box = document.getElementById('toast-box');
                const el = document.createElement('div');
                el.className = \`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 shadow-2xl backdrop-blur-xl transition-all duration-300 transform translate-y-[-10px] \${
                    type === 'error' ? 'bg-rose-950/90 border-rose-500/50 text-rose-200' : 'bg-[#150a2e]/90 border-purple-500/50 text-purple-200 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
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

                toggleMobileSidebar(false);
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
                list.innerHTML = panels.length === 0 ? \`<div class="col-span-2 text-center text-purple-300/50 py-8">ไม่มีแผงให้บริการในขณะนี้</div>\` :
                panels.map(p => {
                    const isExpired = p.expiresAt && new Date(p.expiresAt) < new Date();
                    const isTakenByOther = p.boundSessionId && p.boundSessionId !== mySessionId;
                    const isMyPanel = p.boundSessionId === mySessionId;

                    let statusBadge = '<span class="text-[9px] font-bold px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30">🟢 พร้อมใช้งาน</span>';
                    if (isExpired) statusBadge = '<span class="text-[9px] font-bold px-2.5 py-1 rounded-full bg-rose-950 text-rose-400 border border-rose-500/30">🔴 หมดอายุ</span>';
                    else if (isMyPanel) statusBadge = '<span class="text-[9px] font-bold px-2.5 py-1 rounded-full bg-purple-950 text-purple-300 border border-purple-500/30">👑 แผงของคุณ</span>';
                    else if (isTakenByOther) statusBadge = '<span class="text-[9px] font-bold px-2.5 py-1 rounded-full bg-amber-950 text-amber-400 border border-amber-500/30">🔒 มีผู้ใช้ยึดอยู่</span>';

                    const expDateStr = p.expiresAt ? new Date(p.expiresAt).toLocaleDateString('th-TH') : 'ไม่มีวันหมดอายุ';

                    return \`
                        <div class="glass-card p-5 rounded-2xl space-y-4 \${(isTakenByOther || isExpired) ? 'opacity-50' : ''}">
                            <div class="flex justify-between items-center">
                                <span class="text-white font-bold text-sm">\${p.name}</span>
                                \${statusBadge}
                            </div>
                            <div class="text-xs text-purple-300/70 space-y-1 font-mono bg-[#0c061a] p-3 rounded-xl border border-purple-900/40">
                                <div>Quota: \${p.keysCreated} / \${p.keyQuota}</div>
                                <div class="text-amber-400">หมดอายุ: \${expDateStr}</div>
                            </div>
                            <button onclick="claimPanel('\${p.id}', '\${p.name}')" \${(isTakenByOther || isExpired) ? 'disabled' : ''} class="w-full \${(isTakenByOther || isExpired) ? 'bg-purple-950 text-purple-500 border border-purple-900/30' : 'btn-neon-purple'} py-2.5 rounded-xl text-xs font-bold transition-all">
                                \${isExpired ? 'แผงหมดอายุแล้ว' : (isTakenByOther ? 'ถูกยึดโดยผู้อื่น' : (isMyPanel ? 'เข้าสู่แผงของคุณ' : 'ยึดแผงนี้ใช้งาน'))}
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
                    document.getElementById('panel-expire-badge').innerText = \`Exp: \${exp}\`;
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
                        const expStr = p.expiresAt ? new Date(p.expiresAt).toLocaleDateString('th-TH') : 'ไม่มีวันหมดอายุ';
                        return \`
                        <div class="bg-[#0c061a] p-4 rounded-xl border border-purple-900/40 space-y-2">
                            <div class="flex justify-between items-center">
                                <div class="text-white font-bold text-xs">\${p.name}</div>
                                <button onclick="deletePanel('\${p.id}')" class="text-rose-400 text-xs hover:text-rose-300"><i class="fa-solid fa-trash"></i></button>
                            </div>
                            <div class="text-[10px] text-purple-300/60 space-y-0.5 font-mono">
                                <div>Quota: \${p.keysCreated}/\${p.keyQuota}</div>
                                <div>ผู้ยึดแผง: \${p.boundSessionId ? '🔴 มีผู้ครอบครองแล้ว' : '🟢 ว่าง'}</div>
                                <div class="text-amber-400">หมดอายุ: \${expStr}</div>
                            </div>
                            <div class="pt-2 flex gap-1.5">
                                <button onclick="extendPanel('\${p.id}', 7)" class="bg-purple-950 hover:bg-purple-900 border border-purple-800/40 text-[10px] text-purple-200 font-bold px-2.5 py-1 rounded-lg">+7 วัน</button>
                                <button onclick="extendPanel('\${p.id}', 30)" class="bg-purple-950 hover:bg-purple-900 border border-purple-800/40 text-[10px] text-purple-200 font-bold px-2.5 py-1 rounded-lg">+30 วัน</button>
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
                \`<tr><td colspan="5" class="p-4 text-center text-purple-300/40">No Key Found</td></tr>\` :
                keys.map(k => \`
                    <tr class="hover:bg-purple-950/30 transition-colors">
                        <td class="p-3 text-purple-300 font-bold">\${k.key}</td>
                        <td class="p-3 text-purple-100">\${k.duration} Days</td>
                        <td class="p-3"><span class="px-2.5 py-1 bg-purple-950 border border-purple-800/40 text-[10px] rounded-lg text-purple-200">\${k.owner}</span></td>
                        <td class="p-3"><span class="px-2.5 py-1 bg-pink-500/10 text-pink-300 text-[10px] rounded-lg border border-pink-500/20">\${k.hwid}</span></td>
                        <td class="p-3 text-center space-x-2">
                            <button onclick="navigator.clipboard.writeText('\${k.key}'); toast('คัดลอกคีย์แล้ว!');" class="text-purple-400 hover:text-white"><i class="fa-solid fa-copy"></i></button>
                            <button onclick="deleteKey(\${k.id})" class="text-purple-400 hover:text-rose-400"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                \`).join('');
            }

            function renderKeyManager() {
                const search = document.getElementById('key-search').value.toLowerCase();
                const filtered = loadedKeysData.filter(k => k.key.toLowerCase().includes(search) || k.hwid.toLowerCase().includes(search));

                document.getElementById('manager-keys-body').innerHTML = filtered.length === 0 ? 
                \`<tr><td colspan="6" class="p-4 text-center text-purple-300/40">No Matching Key Found</td></tr>\` :
                filtered.map(k => \`
                    <tr class="hover:bg-purple-950/30 transition-colors">
                        <td class="p-3 text-purple-300 font-bold">\${k.key}</td>
                        <td class="p-3 text-purple-100">\${k.duration} Days</td>
                        <td class="p-3 text-purple-300/50 text-[10px]">\${k.createdAt || '-'}</td>
                        <td class="p-3"><span class="px-2.5 py-1 bg-purple-950 border border-purple-800/40 text-[10px] rounded-lg text-purple-200">\${k.owner}</span></td>
                        <td class="p-3"><span class="px-2.5 py-1 bg-pink-500/10 text-pink-300 text-[10px] rounded-lg border border-pink-500/20">\${k.hwid}</span></td>
                        <td class="p-3 text-center space-x-2">
                            <button onclick="navigator.clipboard.writeText('\${k.key}'); toast('คัดลอกคีย์แล้ว!');" class="text-purple-400 hover:text-white"><i class="fa-solid fa-copy"></i></button>
                            <button onclick="deleteKey(\${k.id})" class="text-purple-400 hover:text-rose-400"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                \`).join('');
            }

            async function loadLogs() {
                const res = await fetch(\`/api/logs?owner=\${currentOwner}\`);
                const logs = await res.json();
                document.getElementById('logs-table-body').innerHTML = logs.length === 0 ? 
                \`<tr><td colspan="4" class="p-4 text-center text-purple-300/40">No Logs Recorded</td></tr>\` :
                logs.map(l => \`
                    <tr class="hover:bg-purple-950/30 transition-colors">
                        <td class="p-3 text-purple-300/50 text-[10px]">\${l.timestamp}</td>
                        <td class="p-3 font-bold text-purple-200">\${l.user}</td>
                        <td class="p-3"><span class="px-2.5 py-0.5 bg-purple-950 text-purple-300 text-[10px] rounded-full border border-purple-800/50">\${l.action}</span></td>
                        <td class="p-3 text-purple-300/80">\${l.detail}</td>
                    </tr>
                \`).join('');
            }

            function updateGeneratorInputFields(containerId, inputId) {
                const container = document.getElementById(containerId);
                if (userRole === 'admin') {
                    container.innerHTML = \`<input id="\${inputId}" type="number" value="30" min="1" placeholder="ระบุจำนวนวันกี่วันก็ได้" class="w-full bg-[#0c061a] border border-purple-900/60 p-3.5 rounded-xl text-white font-mono outline-none focus:border-purple-500">\`;
                } else {
                    container.innerHTML = \`
                        <select id="\${inputId}" class="w-full bg-[#0c061a] border border-purple-900/60 p-3.5 rounded-xl text-white outline-none focus:border-purple-500 font-bold">
                            <option value="1">1 Day</option>
                            <option value="7">7 Days</option>
                            <option value="30">30 Days</option>
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

app.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));
