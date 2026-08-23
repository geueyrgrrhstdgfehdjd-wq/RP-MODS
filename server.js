const express = require('express');
const app = express();

app.use(express.json());

// ==========================================
// CONFIG: รหัสผ่านส่วนตัว (ซ่อนไว้ฝั่ง Server)
// ==========================================
const ADMIN_CODE = "ZDSAWERBHKLJ";
const RESELLER_CODE = "ResellBBVC";

// Datastores
let keysDatabase = [];
let resellerPanels = [
    { id: 'p1', name: 'VIP GameShop', keyQuota: 500, keysCreated: 0, activeSessionId: null },
    { id: 'p2', name: 'Apex Store', keyQuota: 500, keysCreated: 0, activeSessionId: null }
];

function generateKey(prefix = "BRMODS") {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const rand = () => Array.from({length: 4}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    return `${prefix.toUpperCase()}-${rand()}-${rand()}`;
}

// ==========================================
// API ENDPOINTS
// ==========================================

// 1. ตรวจสอบรหัสผ่าน
app.post('/api/login', (req, res) => {
    const { code } = req.body;
    if (code === ADMIN_CODE) return res.json({ success: true, role: 'admin' });
    if (code === RESELLER_CODE) return res.json({ success: true, role: 'reseller' });
    res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง!' });
});

// 2. ดึงรายการแผงสำหรับ Reseller
app.get('/api/panels', (req, res) => res.json(resellerPanels));

// 3. จอง/เข้าใช้งานแผง Reseller (เคร่งครัด)
app.post('/api/claim-panel', (req, res) => {
    const { panelId, sessionId } = req.body;
    const panel = resellerPanels.find(p => p.id === panelId);

    if (!panel) return res.status(404).json({ success: false, message: 'ไม่พบแผง' });
    
    // ตรวจสอบว่าแผงมีคนใช้อยู่หรือไม่
    if (panel.activeSessionId && panel.activeSessionId !== sessionId) {
        return res.status(403).json({ success: false, message: 'แผงนี้กำลังมีผู้อื่นใช้งานอยู่!' });
    }

    panel.activeSessionId = sessionId; // ล็อกแผง
    res.json({ success: true, panel });
});

// 4. ออกจากระบบ/คืนแผง
app.post('/api/release-panel', (req, res) => {
    const { panelId, sessionId } = req.body;
    const panel = resellerPanels.find(p => p.id === panelId);
    if (panel && panel.activeSessionId === sessionId) {
        panel.activeSessionId = null; // ปลดล็อก
    }
    res.json({ success: true });
});

// 5. ดึงข้อมูล Key ทั้งหมด
app.get('/api/keys', (req, res) => {
    const owner = req.query.owner || 'ADMIN';
    if (owner === 'ADMIN') res.json(keysDatabase);
    else res.json(keysDatabase.filter(k => k.owner === owner));
});

// 6. สร้าง Key
app.post('/api/generate-key', (req, res) => {
    const { count, days, owner } = req.body;
    const qty = parseInt(count) || 1;
    const durationDays = parseInt(days) || 1;
    const isReseller = owner !== 'ADMIN';

    if (isReseller) {
        const panel = resellerPanels.find(p => p.name === owner || p.id === owner);
        if (!panel) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลแผง' });
        
        if (![1, 7, 30].includes(durationDays)) {
            return res.status(400).json({ success: false, message: 'Reseller สร้างได้เฉพาะ 1, 7 หรือ 30 วัน' });
        }
        if (panel.keysCreated + qty > panel.keyQuota) {
            return res.status(400).json({ success: false, message: 'โควตาแผงนี้เต็มแล้ว!' });
        }
        panel.keysCreated += qty;
    }

    let createdKeys = [];
    for (let i = 0; i < qty; i++) {
        const newKey = {
            id: Date.now() + i,
            key: generateKey(isReseller ? 'RESELL' : 'BRMODS'),
            duration: durationDays,
            owner: owner,
            hwid: 'Unbound'
        };
        keysDatabase.unshift(newKey);
        createdKeys.push(newKey);
    }
    res.json({ success: true, keys: createdKeys });
});

// 7. ลบ Key
app.delete('/api/delete-key/:id', (req, res) => {
    keysDatabase = keysDatabase.filter(k => k.id !== parseInt(req.params.id));
    res.json({ success: true });
});

// 8. สร้างแผง Reseller ใหม่ (Admin เท่านั้น)
app.post('/api/create-panel', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'ระบุชื่อแผง' });
    const newPanel = {
        id: 'p-' + Date.now().toString().slice(-4),
        name: name.trim(),
        keyQuota: 500,
        keysCreated: 0,
        activeSessionId: null
    };
    resellerPanels.push(newPanel);
    res.json({ success: true });
});

// 9. ลบแผง Reseller
app.delete('/api/delete-panel/:id', (req, res) => {
    resellerPanels = resellerPanels.filter(p => p.id !== req.params.id);
    res.json({ success: true });
});

// ==========================================
// FRONTEND UI (Single Page App)
// ==========================================
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <title>BR MODS - Control Center</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
        <style>
            * { font-family: 'Plus Jakarta Sans', sans-serif; }
            body { background: #080a0f; color: #94a3b8; }
            .cyber-card { background: #111520; border: 1px solid #1e2638; border-radius: 12px; }
            .btn-cyan { background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%); color: #000; font-weight: 700; }
        </style>
    </head>
    <body class="min-h-screen">

        <!-- 1. LOGIN GATE -->
        <div id="gate-screen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080a0f]">
            <div class="cyber-card p-8 max-w-sm w-full text-center space-y-5">
                <div class="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mx-auto flex items-center justify-center text-xl">
                    <i class="fa-solid fa-shield-halved"></i>
                </div>
                <h2 class="text-white font-bold text-lg">ACCESS CONTROL</h2>
                <input id="pass-code" type="password" placeholder="••••••••••••" class="w-full bg-[#080a0f] border border-slate-800 rounded-lg p-3 text-center text-cyan-400 font-mono outline-none">
                <button onclick="login()" class="w-full btn-cyan py-3 rounded-lg text-xs uppercase">เข้าสู่ระบบ</button>
            </div>
        </div>

        <!-- 2. PANEL SELECTOR (FOR RESELLER) -->
        <div id="selector-screen" class="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#080a0f] hidden">
            <div class="cyber-card p-6 max-w-lg w-full space-y-4">
                <div class="flex justify-between items-center border-b border-slate-800 pb-3">
                    <h3 class="text-white font-bold"><i class="fa-solid fa-store text-cyan-400 mr-2"></i>เลือกแผง Reseller</h3>
                    <button onclick="logout()" class="text-xs text-rose-400">ออกจากระบบ</button>
                </div>
                <div id="panel-list" class="grid grid-cols-1 md:grid-cols-2 gap-3"></div>
            </div>
        </div>

        <!-- 3. MAIN DASHBOARD -->
        <div id="dashboard-screen" class="hidden min-h-screen flex flex-col">
            <!-- Header -->
            <header class="cyber-card rounded-none border-x-0 border-t-0 p-4 px-6 flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center font-bold">
                        <i class="fa-solid fa-shield-cat"></i>
                    </div>
                    <div>
                        <h1 class="text-white font-bold text-base">3D Control Center</h1>
                        <p id="role-text" class="text-xs text-slate-500"></p>
                    </div>
                </div>
                <button onclick="logout()" class="bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-400 px-3 py-2 rounded-lg text-xs font-semibold">
                    <i class="fa-solid fa-power-off mr-1"></i> ออกจากระบบ / คืนแผง
                </button>
            </header>

            <!-- Content -->
            <main class="flex-1 max-w-6xl w-full mx-auto p-6 space-y-6">
                <!-- Quick Actions Bar -->
                <div class="cyber-card p-4 flex justify-between items-center">
                    <span class="text-xs font-bold text-slate-400"><i class="fa-solid fa-bolt text-cyan-400 mr-1"></i> Quick Actions:</span>
                    <div class="flex gap-2">
                        <button onclick="quickGenerate(1)" class="bg-cyan-950 border border-cyan-500/30 text-cyan-400 px-3 py-1.5 rounded-lg text-xs font-bold">+1 Day Trial</button>
                        <button onclick="quickGenerate(30)" class="bg-amber-950 border border-amber-500/30 text-amber-400 px-3 py-1.5 rounded-lg text-xs font-bold">+30 Days VIP</button>
                    </div>
                </div>

                <!-- Admin Section: Manage Reseller Panels -->
                <section id="admin-panel-section" class="cyber-card p-5 space-y-3 hidden">
                    <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                        <h3 class="text-white font-bold text-xs"><i class="fa-solid fa-users-gear text-purple-400 mr-1"></i> จัดการแผง Reseller</h3>
                        <button onclick="createPanelPrompt()" class="bg-purple-600 text-white px-3 py-1 rounded text-xs font-bold">+ สร้างแผงใหม่</button>
                    </div>
                    <div id="admin-panel-list" class="grid grid-cols-1 md:grid-cols-3 gap-3"></div>
                </section>

                <!-- Keys Table -->
                <section class="cyber-card p-5 space-y-4">
                    <div class="flex justify-between items-center border-b border-slate-800 pb-3">
                        <h3 class="text-white font-bold text-xs"><i class="fa-solid fa-key text-cyan-400 mr-1"></i> รายการ License Key</h3>
                        <button onclick="generateCustomKeyPrompt()" class="btn-cyan px-4 py-1.5 rounded-lg text-xs">+ สร้าง Key</button>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs font-mono">
                            <thead class="text-slate-500 border-b border-slate-800 uppercase">
                                <tr>
                                    <th class="p-2">LICENSE KEY</th>
                                    <th class="p-2">DURATION</th>
                                    <th class="p-2">OWNER</th>
                                    <th class="p-2">HWID</th>
                                    <th class="p-2 text-center">ACTION</th>
                                </tr>
                            </thead>
                            <tbody id="keys-table-body" class="divide-y divide-slate-800/50"></tbody>
                        </table>
                    </div>
                </section>
            </main>
        </div>

        <script>
            let userRole = null;
            let currentOwner = 'ADMIN';
            let mySessionId = 'sess-' + Math.random().toString(36).substring(2, 9);
            let selectedPanelId = null;

            async function login() {
                const code = document.getElementById('pass-code').value.trim();
                if (!code) return alert('กรุณากรอกรหัสผ่าน!');

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
                    alert(data.message);
                }
            }

            async function loadPanelsForReseller() {
                document.getElementById('selector-screen').classList.remove('hidden');
                const res = await fetch('/api/panels');
                const panels = await res.json();

                const list = document.getElementById('panel-list');
                list.innerHTML = panels.map(p => {
                    const isBusy = p.activeSessionId && p.activeSessionId !== mySessionId;
                    return \`
                        <div class="cyber-card p-4 space-y-2 \${isBusy ? 'opacity-40' : ''}">
                            <div class="flex justify-between items-center">
                                <span class="text-white font-bold">\${p.name}</span>
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded \${isBusy ? 'bg-rose-950 text-rose-400' : 'bg-emerald-950 text-emerald-400'}">
                                    \${isBusy ? '🔴 มีคนใช้งานอยู่' : '🟢 ว่าง'}
                                </span>
                            </div>
                            <p class="text-[11px] text-slate-500">สร้างแล้ว: \${p.keysCreated} / \${p.keyQuota}</p>
                            <button onclick="claimPanel('\${p.id}', '\${p.name}')" \${isBusy ? 'disabled' : ''} class="w-full \${isBusy ? 'bg-slate-800 text-slate-500' : 'btn-cyan'} py-2 rounded-lg text-xs font-bold">
                                \${isBusy ? 'เข้าใช้งานไม่ได้' : 'เข้าใช้งานแผงนี้'}
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
                    alert(data.message);
                    loadPanelsForReseller();
                }
            }

            function showDashboard() {
                document.getElementById('dashboard-screen').classList.remove('hidden');
                document.getElementById('role-text').innerText = \`สิทธิ์ใช้งาน: \${userRole.toUpperCase()} (\${currentOwner})\`;

                if (userRole === 'admin') {
                    document.getElementById('admin-panel-section').classList.remove('hidden');
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
                // Fetch Keys
                const res = await fetch(\`/api/keys?owner=\${currentOwner}\`);
                const keys = await res.json();
                document.getElementById('keys-table-body').innerHTML = keys.length === 0 ? 
                \`<tr><td colspan="5" class="p-4 text-center text-slate-600">ยังไม่มีข้อมูล Key</td></tr>\` :
                keys.map(k => \`
                    <tr class="hover:bg-slate-800/30">
                        <td class="p-2 text-cyan-400 font-bold">\${k.key}</td>
                        <td class="p-2 text-slate-300">\${k.duration} วัน</td>
                        <td class="p-2"><span class="px-2 py-0.5 bg-slate-800 text-[10px] text-slate-400 rounded">\${k.owner}</span></td>
                        <td class="p-2 text-slate-500">\${k.hwid}</td>
                        <td class="p-2 text-center">
                            <button onclick="deleteKey(\${k.id})" class="text-rose-400 hover:text-rose-300"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                \`).join('');

                // Fetch Admin Reseller Panels
                if (userRole === 'admin') {
                    const resPanels = await fetch('/api/panels');
                    const panels = await resPanels.json();
                    document.getElementById('admin-panel-list').innerHTML = panels.map(p => \`
                        <div class="bg-[#080a0f] p-3 rounded-lg border border-slate-800 flex justify-between items-center">
                            <div>
                                <div class="text-white font-bold">\${p.name}</div>
                                <div class="text-[10px] text-slate-500">โควตา: \${p.keysCreated}/\${p.keyQuota} | \${p.activeSessionId ? '🔴 มีคนใช้' : '🟢 ว่าง'}</div>
                            </div>
                            <button onclick="deletePanel('\${p.id}')" class="text-rose-400"><i class="fa-solid fa-trash"></i></button>
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
                if (data.success) refreshData();
                else alert(data.message);
            }

            async function generateCustomKeyPrompt() {
                const days = prompt("ระบุจำนวนวัน ( Reseller เลือกได้แค่ 1, 7, 30):", "1");
                if (!days) return;
                const count = prompt("ระบุจำนวน Key ที่ต้องการสร้าง:", "1");
                if (!count) return;

                const res = await fetch('/api/generate-key', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ count, days, owner: currentOwner })
                });
                const data = await res.json();
                if (data.success) refreshData();
                else alert(data.message);
            }

            async function createPanelPrompt() {
                const name = prompt("ระบุชื่อแผง Reseller ใหม่:");
                if (!name) return;
                const res = await fetch('/api/create-panel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });
                const data = await res.json();
                if (data.success) refreshData();
                else alert(data.message);
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
        </script>
    </body>
    </html>
    `);
});

app.listen(3000, () => console.log('✅ Server Running: http://localhost:3000'));
