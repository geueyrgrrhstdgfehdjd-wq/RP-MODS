const http = require('http');

// Config System
const ADMIN_CODE = "ZDSAWERBHKLJ";
const RESELLER_CODE = "ResellBBVC";

// Database (เริ่มต้นว่างเปล่าตามต้องการ)
let keysDatabase = [];
let resellerPanels = [];
let auditLogs = [
    { id: 1, timestamp: new Date().toLocaleString('th-TH'), action: 'SYSTEM_START', detail: 'ระบบเริ่มต้นการทำงาน', user: 'SYSTEM' }
];

function logActivity(action, detail, user) {
    auditLogs.unshift({ id: Date.now(), timestamp: new Date().toLocaleString('th-TH'), action, detail, user });
    if (auditLogs.length > 50) auditLogs.pop();
}

function generateKey(prefix = "RPMODS") {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const rand = () => Array.from({length: 4}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    return `${prefix.toUpperCase()}-${rand()}-${rand()}`;
}

const htmlTemplate = `
<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RP MODS Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        * { font-family: 'Plus Jakarta Sans', sans-serif; box-sizing: border-box; }
        body { background-color: #f3f0ff; color: #2e1065; }
        .glass-card { background: #ffffff; border: 1px solid #e9d5ff; box-shadow: 0 10px 25px rgba(147, 51, 234, 0.08); }
        .btn-neon-purple { background: linear-gradient(135deg, #a855f7 0%, #7e22ce 100%); color: #ffffff; font-weight: 700; }
        .sidebar-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 14px; font-size: 13px; font-weight: 600; color: #6b21a8; cursor: pointer; }
        .sidebar-item.active { background: #f3e8ff; border-left: 4px solid #a855f7; }
        .tab-view { display: none; }
        .tab-view.active { display: block; }
    </style>
</head>
<body class="min-h-screen flex text-sm" onload="checkAutoLogin()">
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

    <div id="selector-screen" class="fixed inset-0 z-40 flex items-center justify-center p-4 bg-purple-950/40 hidden">
        <div class="glass-card p-6 max-w-2xl w-full rounded-3xl space-y-5 border-2 border-purple-300">
            <div class="flex justify-between items-center border-b border-purple-200 pb-4">
                <h3 class="font-bold text-purple-950"><i class="fa-solid fa-store text-purple-600"></i> เลือกแผง Reseller ที่ต้องการเข้าใช้งาน</h3>
                <button onclick="logout()" class="text-xs text-rose-600 font-semibold"><i class="fa-solid fa-power-off"></i> ออกจากระบบ</button>
            </div>
            <div id="panel-list" class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto"></div>
        </div>
    </div>

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
                </nav>
            </div>

            <button onclick="logout()" class="bg-purple-50 p-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-rose-50 border border-purple-200 text-rose-600 font-bold text-xs">
                <i class="fa-solid fa-arrow-right-from-bracket"></i> Exit System
            </button>
        </aside>

        <main class="flex-1 p-8 space-y-6 overflow-y-auto">
            <header class="flex justify-between items-center pb-5 border-b border-purple-200">
                <h1 class="text-xl font-extrabold text-purple-950">RP MODS Dashboard</h1>
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
        </main>
    </div>

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

        function toast(msg) { alert(msg); }
        function toggleDaysInput(isLifetime) { document.getElementById('days-input-box').classList.toggle('hidden', isLifetime); }
        function checkAutoLogin() {
            if (userRole) {
                document.getElementById('gate-screen').classList.add('hidden');
                if (userRole === 'admin') showDashboard();
                else loadPanelsForReseller();
            }
        }

        async function login() {
            const code = document.getElementById('pass-code').value.trim();
            const res = await fetch('/api/login', { method: 'POST', body: JSON.stringify({code}) });
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
                        <div class="font-bold text-purple-950">\${p.name}</div>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full \${p.expiresAt ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}">
                            \${p.expiresAt ? 'จำกัดเวลา' : '♾️ ถาวร'}
                        </span>
                    </div>
                    <button onclick="claimPanel('\${p.id}', '\${p.name}')" class="w-full btn-neon-purple py-2 rounded-xl text-xs">เข้าใช้งานแผงนี้</button>
                </div>
            `).join('');
        }

        function claimPanel(panelId, panelName) {
            currentOwner = panelName;
            localStorage.setItem('currentOwner', currentOwner);
            document.getElementById('selector-screen').classList.add('hidden');
            showDashboard();
        }

        function showDashboard() {
            document.getElementById('dashboard-screen').classList.remove('hidden');
            document.getElementById('active-panel-name').innerText = currentOwner;
            if (userRole === 'admin') document.getElementById('admin-panel-section').classList.remove('hidden');
            refreshData();
        }

        function logout() { localStorage.clear(); location.reload(); }

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
                    document.getElementById('admin-panel-list').innerHTML = `<div class="col-span-3 text-center text-purple-400 text-xs py-4">ไม่มีแผงในระบบ (กดปุ่ม + สร้างแผงใหม่)</div>`;
                } else {
                    document.getElementById('admin-panel-list').innerHTML = panels.map(p => `
                        <div class="bg-purple-50 p-4 rounded-xl border border-purple-200 space-y-2">
                            <div class="flex justify-between items-start">
                                <div class="font-bold text-xs text-purple-950">\${p.name}</div>
                                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded \${p.expiresAt ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">
                                    \${p.expiresAt ? 'จำกัดวัน' : '♾️ ถาวร'}
                                </span>
                            </div>
                            <button onclick="deletePanel('\${p.id}')" class="text-rose-600 text-xs font-bold">ลบแผง</button>
                        </div>
                    `).join('');
                }
            }
        }

        async function submitCreatePanel() {
            const name = document.getElementById('panel-name').value;
            const expireDays = document.getElementById('panel-expire-days').value;
            const isLifetime = document.getElementById('panel-is-lifetime').checked;
            const res = await fetch('/api/create-panel', { method: 'POST', body: JSON.stringify({ name, expireDays, isLifetime }) });
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
`;

// Create Server
const server = http.createServer((req, res) => {
    const url = req.url;
    
    // JSON Helper
    const sendJSON = (obj, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
    };

    if (url === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlTemplate);
    } else if (url === '/api/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { code } = JSON.parse(body || '{}');
            if (code === ADMIN_CODE) return sendJSON({ success: true, role: 'admin' });
            if (code === RESELLER_CODE) return sendJSON({ success: true, role: 'reseller' });
            sendJSON({ success: false, message: 'รหัสผิด!' }, 401);
        });
    } else if (url === '/api/panels' && req.method === 'GET') {
        sendJSON(resellerPanels);
    } else if (url === '/api/create-panel' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { name, expireDays, isLifetime } = JSON.parse(body || '{}');
            if (!name) return sendJSON({ success: false, message: 'ระบุชื่อแผง' }, 400);
            
            let expireDate = null;
            if (!isLifetime) {
                expireDate = new Date();
                expireDate.setDate(expireDate.getDate() + (parseInt(expireDays) || 30));
                expireDate = expireDate.toISOString();
            }
            resellerPanels.unshift({ id: 'p-' + Date.now(), name, expiresAt: expireDate });
            sendJSON({ success: true });
        });
    } else if (url.startsWith('/api/delete-panel/') && req.method === 'DELETE') {
        const id = url.split('/').pop();
        resellerPanels = resellerPanels.filter(p => p.id !== id);
        sendJSON({ success: true });
    } else if (url.startsWith('/api/stats') && req.method === 'GET') {
        sendJSON({ total: keysDatabase.length, active: 0, expired: 0, banned: 0 });
    } else {
        res.writeHead(404);
        res.end();
    }
});

// Render Port Binding
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
