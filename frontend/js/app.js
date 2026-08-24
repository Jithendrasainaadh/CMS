// ── Utilities ────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const existing = document.getElementById('toast-container');
    if (existing) existing.remove();
    const colors = { success: 'var(--success-color)', error: 'var(--danger-color)', info: 'var(--primary-color)' };
    const icons  = { success: 'ph-check-circle',      error: 'ph-x-circle',        info: 'ph-info' };
    const el = document.createElement('div');
    el.id = 'toast-container';
    el.style.cssText = `position:fixed;bottom:24px;right:24px;background:var(--card-bg);border:1px solid ${colors[type]};color:white;padding:14px 20px;border-radius:10px;display:flex;align-items:center;gap:10px;font-size:14px;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.4);animation:fadeIn 0.3s ease;max-width:360px;`;
    el.innerHTML = `<i class="ph-fill ${icons[type]}" style="color:${colors[type]};font-size:20px;flex-shrink:0;"></i><span>${message}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

function decodeJWT(token) {
    try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

// ── App ────────────────────────────────────────────────────
const App = {
    user: null,
    currentChannel: 'announcements',
    messagePoller: null,
    notifPoller: null,
    _allProperties: [],

    async init() {
        await this.bindLoginForm();
        window.addEventListener('hashchange', () => { if (this.user) this.handleRoute(); });
        const token = ApiClient.getToken();
        if (token) {
            const payload = decodeJWT(token);
            if (payload && payload.exp * 1000 > Date.now()) {
                await this.loadUserAndShow();
            } else {
                ApiClient.setToken(null);
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
    },

    async loadUserAndShow() {
        try {
            this.user = await ApiClient.getMe();
            this.showMainApp();
            this.updateHeader();
            this.handleRoute();
            // Start notification polling (non-superadmins only)
            if (!this.user.is_superadmin) {
                await this.updateNotifBadge();
                this.notifPoller = setInterval(() => this.updateNotifBadge(), 15000);
            }
        } catch {
            ApiClient.setToken(null);
            this.showLogin();
        }
    },

    async bindLoginForm() {
        const form = document.getElementById('login-form');
        const commSelect = document.getElementById('login-community');
        if (!form) return;

        // Populate community dropdown
        if (commSelect) {
            try {
                const communities = await ApiClient.getPublicCommunities();
                communities.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.name;
                    commSelect.appendChild(opt);
                });
            } catch (err) { console.error('Failed to load communities for login', err); }
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email    = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const communityId = commSelect ? commSelect.value : null;
            const errorEl  = document.getElementById('login-error');
            const btn      = form.querySelector('button[type="submit"]');

            // Client-side validation
            const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!email) {
                errorEl.textContent = 'Email is required.'; errorEl.style.display = 'block'; return;
            }
            if (!emailRx.test(email)) {
                errorEl.textContent = 'Please enter a valid email address.'; errorEl.style.display = 'block'; return;
            }
            if (!password) {
                errorEl.textContent = 'Password is required.'; errorEl.style.display = 'block'; return;
            }
            if (password.length < 6) {
                errorEl.textContent = 'Password must be at least 6 characters.'; errorEl.style.display = 'block'; return;
            }

            btn.disabled = true; btn.textContent = 'Signing in…';
            errorEl.style.display = 'none';
            try {
                await ApiClient.login(email, password, communityId || null);
                await this.loadUserAndShow();
                form.reset();
            } catch (err) {
                errorEl.textContent = err.message || 'Invalid credentials. Please check your email and password.';
                errorEl.style.display = 'block';
            } finally {
                btn.disabled = false; btn.textContent = 'Sign In';
            }
        });
    },

    updateHeader() {
        if (!this.user) return;
        const nameEl = document.querySelector('.user-name');
        const roleEl = document.querySelector('.user-role');
        if (nameEl) nameEl.textContent = this.user.name;
        if (roleEl) roleEl.textContent =
            this.user.is_superadmin ? 'Super Admin' :
            this.user.role === 'admin' ? 'Community Admin' : 'Resident';

        // Hide community-specific navigation links for Super Admin
        document.querySelectorAll('.nav-menu .nav-item').forEach(el => {
            const href = el.getAttribute('href');
            if (this.user.is_superadmin && !['#dashboard', '#settings'].includes(href)) {
                el.style.display = 'none';
            } else {
                el.style.display = 'flex';
            }
        });

        // Add logout button to header if not already there
        const actions = document.querySelector('.user-actions');
        if (actions && !document.getElementById('logout-btn')) {
            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'logout-btn';
            logoutBtn.className = 'icon-btn';
            logoutBtn.title = 'Logout';
            logoutBtn.innerHTML = '<i class="ph ph-sign-out"></i>';
            logoutBtn.onclick = () => App.logout();
            actions.appendChild(logoutBtn);
        }

        // Bind bell button
        const bell = document.getElementById('bell-btn');
        if (bell && !bell._notifBound) {
            bell._notifBound = true;
            bell.addEventListener('click', () => App.openNotificationsPanel());
        }
    },

    showLogin() {
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('main-app').style.display = 'none';
    },

    showMainApp() {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
    },

    logout() {
        if (this.messagePoller) { clearInterval(this.messagePoller); this.messagePoller = null; }
        if (this.notifPoller)   { clearInterval(this.notifPoller);   this.notifPoller = null; }
        ApiClient.setToken(null);
        this.user = null;
        window.location.hash = '';
        this.showLogin();
    },

    handleRoute() {
        if (this.messagePoller) { clearInterval(this.messagePoller); this.messagePoller = null; }
        const hash = window.location.hash.replace('#', '') || 'dashboard';
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.toggle('active', el.getAttribute('href') === '#' + hash);
        });
        this.renderPage(hash);
    },

    async renderPage(page) {
        const area = document.getElementById('page-content');
        area.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:300px;color:var(--text-secondary);font-size:32px;"><i class="ph ph-circle-notch" style="animation:spin 1s linear infinite;"></i></div>`;
        try {
            switch (page) {
                case 'dashboard':   await this.pages.dashboard(area);   break;
                case 'messaging':   await this.pages.messaging(area);   break;
                case 'polls':       await this.pages.polls(area);       break;
                case 'properties':  await this.pages.properties(area);  break;
                case 'voting':      this.pages.voting(area);            break;
                case 'reviews':     this.pages.reviews(area);           break;
                case 'gallery':     this.pages.gallery(area);           break;
                case 'maintenance': await this.pages.maintenance(area); break;
                case 'settings':    this.renderSettings();              break;
                default: area.innerHTML = `<div class="fade-in"><h1 class="h1">404 — Not Found</h1></div>`;
            }
        } catch (err) {
            area.innerHTML = `<div style="padding:60px;text-align:center;"><i class="ph ph-warning" style="font-size:48px;color:var(--danger-color);display:block;margin-bottom:16px;"></i><h3 style="color:white;margin-bottom:8px;">Failed to load</h3><p style="color:var(--text-secondary);font-size:14px;">${err.message}</p><button class="btn" style="margin-top:16px;" onclick="App.handleRoute()">Retry</button></div>`;
        }
    },

    // ── Page: Dashboard ────────────────────────────────────
    pages: {
        async dashboard(container) {
            const u = App.user;
            container.innerHTML = `<div class="fade-in">
                <div class="page-header">
                    <div><h1 class="h1">Dashboard</h1><p style="color:var(--text-secondary);">Welcome back, <strong>${u.name}</strong>. Here's what's happening.</p></div>
                    ${u.is_superadmin ? `<button class="btn" onclick="App.pages.showCreateCommunityModal()"><i class="ph ph-plus"></i> New Community</button>` : ''}
                </div>
                <div class="grid-overview">
                    <div class="card" id="dash-a" style="min-height:140px;"><p style="color:var(--text-secondary);">Loading…</p></div>
                    <div class="card" id="dash-b" style="min-height:140px;"><p style="color:var(--text-secondary);">Loading…</p></div>
                    <div class="card" id="dash-c" style="min-height:140px;"><p style="color:var(--text-secondary);">Loading…</p></div>
                </div>
                <div id="create-community-form"></div>
                <div id="comm-management" style="margin-top:24px;"></div>
            </div>`;


            if (u.is_superadmin) {
                document.getElementById('dash-a').innerHTML = `<h3 style="color:white;margin-bottom:10px;display:flex;align-items:center;gap:8px;"><i class="ph-fill ph-shield-star" style="color:var(--primary-color);"></i> Super Admin</h3><p style="color:var(--text-secondary);font-size:14px;line-height:1.6;">You manage the entire platform, create communities, and assign their administrators.</p>`;
                document.getElementById('dash-b').innerHTML = `<h3 style="color:white;margin-bottom:12px;display:flex;align-items:center;gap:8px;"><i class="ph ph-plus-circle" style="color:var(--success-color);"></i> Quick Actions</h3><button class="btn" style="width:100%;justify-content:center;" onclick="App.pages.showCreateCommunityModal()"><i class="ph ph-plus"></i> Create Community</button>`;
                try {
                    const comms = await ApiClient.getCommunities();
                    document.getElementById('dash-c').innerHTML = `
                        <h3 style="color:white;margin-bottom:14px;display:flex;align-items:center;gap:8px;"><i class="ph ph-buildings" style="color:var(--warning-color);"></i> Platform Overview</h3>
                        <div style="display:flex;flex-direction:column;gap:10px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.04);border-radius:8px;">
                                <span style="color:var(--text-secondary);font-size:13px;">Communities</span>
                                <span style="color:white;font-weight:700;font-size:20px;">${comms.length}</span>
                            </div>
                        </div>`;
                    const mgmt = document.getElementById('comm-management');
                    if (mgmt) {
                        if (!comms.length) {
                            mgmt.innerHTML = `<div class="card" style="text-align:center;padding:48px;border:1px dashed var(--border-color);"><i class="ph ph-buildings" style="font-size:52px;color:var(--text-secondary);display:block;margin-bottom:14px;"></i><p style="color:var(--text-secondary);margin-bottom:18px;font-size:14px;">No communities yet. Create your first one!</p><button class="btn" onclick="App.pages.showCreateCommunityModal()"><i class="ph ph-plus"></i> Create Community</button></div>`;
                        } else {
                            mgmt.innerHTML = `
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                                    <h2 style="color:white;font-size:20px;font-weight:700;display:flex;align-items:center;gap:10px;"><i class="ph-fill ph-buildings" style="color:var(--primary-color);"></i> Community Management</h2>
                                    <span style="color:var(--text-secondary);font-size:13px;">${comms.length} communit${comms.length!==1?'ies':'y'}</span>
                                </div>
                                <div id="comm-cards-container"></div>`;
                            App.pages._dashboardData = [];
                            const cardsContainer = document.getElementById('comm-cards-container');
                            for (const comm of comms) {
                                try {
                                    const members = await ApiClient.getCommunityMembers(comm.id);
                                    App.pages._dashboardData.push({ ...comm, members });
                                    const wrapper = document.createElement('div');
                                    wrapper.innerHTML = App.pages._communityCardHTML(comm, members);
                                    cardsContainer.appendChild(wrapper.firstElementChild);
                                } catch {
                                    const errDiv = document.createElement('div');
                                    errDiv.className = 'card';
                                    errDiv.style.marginBottom = '16px';
                                    errDiv.innerHTML = `<h3 style="color:white;">${comm.name}</h3><p style="color:var(--danger-color);font-size:13px;">Failed to load members.</p>`;
                                    cardsContainer.appendChild(errDiv);
                                }
                            }
                        }
                    }
                } catch (err) { document.getElementById('dash-c').innerHTML = `<p style="color:var(--danger-color);">Failed to load: ${err.message}</p>`; }
                return;
            }

            const [msgs, polls, props] = await Promise.allSettled([ApiClient.getMessages('announcements'), ApiClient.getPolls(), ApiClient.getProperties()]);
            const aEl = document.getElementById('dash-a');
            if (msgs.status === 'fulfilled' && msgs.value.length > 0) {
                const m = msgs.value[msgs.value.length - 1];
                aEl.innerHTML = `<h3 style="color:white;margin-bottom:10px;display:flex;align-items:center;gap:8px;"><i class="ph ph-megaphone" style="color:var(--warning-color);"></i> Latest Announcement</h3><p style="font-size:14px;margin-bottom:10px;line-height:1.5;">${m.content}</p><span style="font-size:11px;color:var(--text-secondary);">by ${m.author_name} • ${new Date(m.timestamp).toLocaleString()}</span>`;
            } else { aEl.innerHTML = `<h3 style="color:white;margin-bottom:8px;"><i class="ph ph-megaphone" style="color:var(--warning-color);"></i> Announcements</h3><p style="color:var(--text-secondary);font-size:13px;">No announcements yet.</p>`; }
            const bEl = document.getElementById('dash-b');
            if (polls.status === 'fulfilled' && polls.value.filter(p=>p.is_active).length > 0) {
                const n = polls.value.filter(p=>p.is_active).length;
                bEl.innerHTML = `<h3 style="color:white;margin-bottom:10px;display:flex;align-items:center;gap:8px;"><i class="ph ph-check-square-offset" style="color:var(--primary-color);"></i> Active Polls</h3><p style="font-size:14px;margin-bottom:12px;">${n} poll${n>1?'s':''} waiting for your vote.</p><a href="#polls" class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;">View Polls <i class="ph ph-arrow-right"></i></a>`;
            } else { bEl.innerHTML = `<h3 style="color:white;margin-bottom:8px;"><i class="ph ph-check-square-offset" style="color:var(--primary-color);"></i> Polls</h3><p style="color:var(--text-secondary);font-size:13px;">No active polls.</p>`; }
            const cEl = document.getElementById('dash-c');
            if (props.status === 'fulfilled' && props.value.length > 0) {
                const p = props.value[props.value.length - 1];
                cEl.innerHTML = `<h3 style="color:white;margin-bottom:10px;display:flex;align-items:center;gap:8px;"><i class="ph ph-house" style="color:var(--success-color);"></i> New Listing</h3><p style="color:white;font-size:14px;font-weight:600;">${p.title}</p><p style="color:var(--text-secondary);font-size:12px;">${p.status.replace('_',' ')} • ${p.price}</p><a href="#properties" style="font-size:12px;color:var(--primary-color);text-decoration:none;">View all →</a>`;
            } else { cEl.innerHTML = `<h3 style="color:white;margin-bottom:8px;"><i class="ph ph-house" style="color:var(--success-color);"></i> Properties</h3><p style="color:var(--text-secondary);font-size:13px;">No listings yet.</p>`; }
        },

        showCreateCommunityModal() {
            const el = document.getElementById('create-community-form');
            if (!el) return;
            el.innerHTML = `<div class="card" style="margin-top:24px;border:1px solid var(--primary-color);">
                <h3 style="color:white;margin-bottom:20px;"><i class="ph ph-buildings" style="color:var(--primary-color);"></i> Create New Community</h3>
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <input id="comm-name" placeholder="Community Name" style="padding:12px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:14px;">
                    <input id="comm-addr" placeholder="Address" style="padding:12px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:14px;">
                    <div style="display:flex;gap:12px;">
                        <button class="btn" id="comm-submit" onclick="App.pages.submitCreateCommunity()"><i class="ph ph-check"></i> Create</button>
                        <button class="btn btn-secondary" onclick="document.getElementById('create-community-form').innerHTML=''">Cancel</button>
                    </div>
                </div>
            </div>`;
        },

        async submitCreateCommunity() {
            const name = document.getElementById('comm-name').value.trim();
            const addr = document.getElementById('comm-addr').value.trim();
            if (!name || !addr) { showToast('Please fill all fields', 'error'); return; }
            const btn = document.getElementById('comm-submit');
            btn.disabled = true; btn.textContent = 'Creating…';
            try {
                await ApiClient.createCommunity(name, addr);
                showToast('Community created!', 'success');
                document.getElementById('create-community-form').innerHTML = '';
                App.pages.dashboard(document.getElementById('page-content'));
            } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Create'; }
        },

        // ── Page: Messaging ─────────────────────────────────
        async messaging(container) {
            const isAdmin  = App.user?.role === 'admin' && !App.user?.is_superadmin;
            const isSA     = App.user?.is_superadmin;
            if (isSA) { container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--text-secondary);"><i class="ph ph-lock-key" style="font-size:48px;display:block;margin-bottom:12px;"></i><p>Super Admins do not have community messaging access.</p></div>`; return; }

            container.innerHTML = `<div class="fade-in" style="height:calc(100vh - 140px);display:flex;flex-direction:column;">
                <div class="page-header" style="margin-bottom:16px;"><h1 class="h1" style="margin-bottom:0;">Messaging</h1></div>
                <div style="display:flex;flex:1;gap:24px;min-height:0;">
                    <div class="card" style="width:240px;display:flex;flex-direction:column;padding:16px;">
                        <h3 style="color:white;font-size:15px;margin-bottom:14px;">Channels</h3>
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            <div id="ch-announcements" onclick="App.pages.switchChannel('announcements')" class="ch-item" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;background:rgba(88,166,255,0.12);border-left:3px solid var(--primary-color);">
                                <i class="ph ph-megaphone" style="color:var(--primary-color);font-size:18px;"></i>
                                <div><div style="color:white;font-weight:600;font-size:13px;">Announcements</div><div style="color:var(--text-secondary);font-size:11px;">Admin posts</div></div>
                            </div>
                            <div id="ch-general" onclick="App.pages.switchChannel('general')" class="ch-item" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;">
                                <i class="ph ph-users" style="color:var(--success-color);font-size:18px;"></i>
                                <div><div style="color:white;font-weight:600;font-size:13px;">General Chat</div><div style="color:var(--text-secondary);font-size:11px;">All residents</div></div>
                            </div>
                        </div>
                        ${isAdmin ? `<div style="margin-top:auto;padding-top:16px;border-top:1px solid var(--border-color);"><p style="color:var(--text-secondary);font-size:11px;margin-bottom:8px;">Admin: Add Resident</p><button class="btn btn-secondary" style="width:100%;justify-content:center;font-size:12px;" onclick="App.pages.showAddUserForm()"><i class="ph ph-user-plus"></i> Add User</button></div>` : ''}
                    </div>
                    <div class="card" style="flex:1;display:flex;flex-direction:column;padding:0;overflow:hidden;">
                        <div id="chat-header" style="padding:14px 20px;border-bottom:1px solid var(--border-color);background:rgba(0,0,0,0.2);display:flex;align-items:center;gap:12px;">
                            <i class="ph ph-megaphone" style="color:var(--primary-color);font-size:22px;"></i>
                            <div><div style="color:white;font-weight:600;">Official Announcements</div><div style="color:var(--text-secondary);font-size:12px;">Read-only for residents</div></div>
                        </div>
                        <div id="messages-list" style="flex:1;padding:20px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;"></div>
                        <div id="msg-input-area" style="padding:14px 20px;border-top:1px solid var(--border-color);background:rgba(0,0,0,0.2);">
                            ${isAdmin ? App.pages._msgInputHTML() : `<div style="text-align:center;color:var(--text-secondary);font-size:13px;"><i class="ph ph-lock-key"></i> Only admins can post in Announcements</div>`}
                        </div>
                    </div>
                </div>
                <div id="add-user-form-container"></div>
            </div>`;

            App.currentChannel = 'announcements';
            await App.pages.loadMessages('announcements');
            App.messagePoller = setInterval(() => App.pages.loadMessages(App.currentChannel, true), 8000);
        },

        _msgInputHTML() {
            return `<div style="display:flex;gap:10px;"><input id="msg-input" type="text" placeholder="Type a message…" style="flex:1;padding:11px 14px;background:rgba(255,255,255,0.05);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:14px;"><button id="msg-send" class="btn" style="flex-shrink:0;" onclick="App.pages.sendMessage()"><i class="ph ph-paper-plane-tilt"></i></button></div>`;
        },

        async loadMessages(channel, silent = false) {
            const list = document.getElementById('messages-list');
            if (!list) return;
            if (!silent) list.innerHTML = `<div style="text-align:center;color:var(--text-secondary);padding:20px;font-size:24px;"><i class="ph ph-circle-notch" style="animation:spin 1s linear infinite;"></i></div>`;
            try {
                const msgs = await ApiClient.getMessages(channel);
                if (!msgs.length) { list.innerHTML = `<div style="text-align:center;color:var(--text-secondary);padding:40px;"><i class="ph ph-chat-circle" style="font-size:40px;display:block;margin-bottom:10px;"></i>No messages yet.</div>`; return; }
                const communityId = App.user?.community_id;
                const decrypted = await Promise.all(msgs.map(async m => ({
                    ...m,
                    content: await CryptoHelper.decrypt(m.content, communityId)
                })));
                list.innerHTML = decrypted.map(m => {
                    const time = new Date(m.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
                    const isMe = App.user && m.author_id === App.user.id;
                    const wasEncrypted = CryptoHelper.isEncrypted(msgs.find(x=>x.id===m.id)?.content || '');
                    return `<div style="display:flex;gap:10px;${isMe?'flex-direction:row-reverse;':''}">
                        <div style="width:34px;height:34px;border-radius:50%;background:${channel==='announcements'?'var(--warning-color)':'var(--primary-color)'};display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:13px;flex-shrink:0;">${m.author_name.charAt(0).toUpperCase()}</div>
                        <div style="max-width:70%;">
                            <div style="display:flex;gap:8px;align-items:baseline;margin-bottom:3px;${isMe?'flex-direction:row-reverse;':''}">
                                <span style="color:white;font-weight:600;font-size:12px;">${m.author_name}</span>
                                <span style="color:var(--text-secondary);font-size:11px;">${time}</span>
                                ${wasEncrypted ? '<span title="End-to-end encrypted" style="color:var(--success-color);font-size:11px;"><i class="ph-fill ph-lock-key"></i></span>' : ''}
                                ${App.user?.role === 'admin' && !App.user?.is_superadmin ? `<span style="cursor:pointer;color:var(--danger-color);font-size:12px;margin-left:8px;" onclick="App.pages.deleteMsg(${m.id})"><i class="ph ph-trash"></i></span>` : ''}
                            </div>
                            <div style="background:${isMe?'rgba(88,166,255,0.2)':'rgba(255,255,255,0.05)'};border:1px solid ${isMe?'rgba(88,166,255,0.3)':'var(--border-color)'};border-radius:${isMe?'12px 0 12px 12px':'0 12px 12px 12px'};padding:10px 14px;">
                                <p style="color:var(--text-primary);font-size:13px;line-height:1.5;margin:0;">${m.content}</p>
                            </div>
                        </div>
                    </div>`;
                }).join('');
                list.scrollTop = list.scrollHeight;
            } catch (err) { if (!silent) list.innerHTML = `<div style="text-align:center;color:var(--danger-color);padding:20px;">Error: ${err.message}</div>`; }
        },

        async deleteMsg(msgId) {
            if (!confirm('Delete this message?')) return;
            try {
                await ApiClient.deleteMessage(msgId);
                showToast('Message deleted', 'success');
                App.pages.loadMessages(App.currentChannel);
            } catch (err) { showToast(err.message, 'error'); }
        },

        switchChannel(ch) {
            App.currentChannel = ch;
            const isAdmin = App.user?.role === 'admin';
            document.querySelectorAll('.ch-item').forEach(el => { el.style.background = 'transparent'; el.style.borderLeft = 'none'; });
            const active = document.getElementById('ch-' + ch);
            if (active) { active.style.background = 'rgba(88,166,255,0.12)'; active.style.borderLeft = '3px solid var(--primary-color)'; }
            const hdr = document.getElementById('chat-header');
            if (hdr) hdr.innerHTML = `<i class="ph ${ch==='announcements'?'ph-megaphone':'ph-users'}" style="color:${ch==='announcements'?'var(--primary-color)':'var(--success-color)'};font-size:22px;"></i><div><div style="color:white;font-weight:600;">${ch==='announcements'?'Official Announcements':'General Chat'}</div><div style="color:var(--text-secondary);font-size:12px;">${ch==='announcements'?'Read-only for residents':'All residents can post'}</div></div>`;
            const canPost = isAdmin || ch === 'general';
            const ia = document.getElementById('msg-input-area');
            if (ia) {
                ia.innerHTML = canPost ? App.pages._msgInputHTML() : `<div style="text-align:center;color:var(--text-secondary);font-size:13px;"><i class="ph ph-lock-key"></i> Only admins can post in Announcements</div>`;
                if (canPost) { const inp = document.getElementById('msg-input'); if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') App.pages.sendMessage(); }); }
            }
            App.pages.loadMessages(ch);
        },

        async sendMessage() {
            const input = document.getElementById('msg-input');
            const btn   = document.getElementById('msg-send');
            if (!input?.value.trim()) return;
            const plaintext = input.value.trim();
            if (btn) btn.disabled = true;
            try {
                // Encrypt before sending
                const communityId = App.user?.community_id;
                const encrypted = await CryptoHelper.encrypt(plaintext, communityId);
                await ApiClient.createMessage(encrypted, App.currentChannel);
                input.value = '';
                await App.pages.loadMessages(App.currentChannel);
                input.focus();
            } catch (err) { showToast(err.message, 'error'); }
            finally { if (btn) btn.disabled = false; }
        },

        showAddUserForm() {
            const el = document.getElementById('add-user-form-container');
            if (!el) return;
            el.innerHTML = `<div class="card" style="margin-top:16px;border:1px solid var(--primary-color);">
                <h3 style="color:white;margin-bottom:16px;"><i class="ph ph-user-plus" style="color:var(--primary-color);"></i> Add Resident</h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                    <input id="u-name"  placeholder="Full Name"      style="padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:13px;">
                    <input id="u-email" placeholder="Email"          style="padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:13px;">
                    <input id="u-pass"  placeholder="Password" type="password" style="padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:13px;">
                    <select id="u-role" style="padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:13px;">
                        <option value="resident">Resident</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>
                <div style="display:flex;gap:10px;">
                    <button class="btn" id="add-user-btn" onclick="App.pages.submitAddUser()"><i class="ph ph-check"></i> Add User</button>
                    <button class="btn btn-secondary" onclick="document.getElementById('add-user-form-container').innerHTML=''">Cancel</button>
                </div>
            </div>`;
        },

        async submitAddUser() {
            const name = document.getElementById('u-name').value.trim();
            const email = document.getElementById('u-email').value.trim();
            const pass = document.getElementById('u-pass').value.trim();
            const role = document.getElementById('u-role').value;
            if (!name || !email || !pass) { showToast('Fill all fields', 'error'); return; }
            const btn = document.getElementById('add-user-btn');
            btn.disabled = true; btn.textContent = 'Adding…';
            try {
                await ApiClient.registerUser(App.user.community_id, email, name, pass, role);
                showToast(`${name} added successfully!`, 'success');
                document.getElementById('add-user-form-container').innerHTML = '';
            } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Add User'; }
        },

        // ── Page: Polls ──────────────────────────────────────
        async polls(container) {
            const isAdmin = App.user?.role === 'admin' && !App.user?.is_superadmin;
            if (App.user?.is_superadmin) { container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--text-secondary);"><i class="ph ph-lock-key" style="font-size:40px;display:block;margin-bottom:12px;"></i>Super Admins cannot access community polls.</div>`; return; }
            container.innerHTML = `<div class="fade-in">
                <div class="page-header">
                    <div><h1 class="h1">Opinion Polls</h1><p style="color:var(--text-secondary);">Community polls and surveys.</p></div>
                    ${isAdmin ? `<button class="btn" onclick="App.pages.showCreatePollForm()"><i class="ph ph-plus"></i> Create Poll</button>` : ''}
                </div>
                <div id="create-poll-container"></div>
                <div id="polls-list" class="grid-overview"><p style="color:var(--text-secondary);">Loading…</p></div>
            </div>`;
            await App.pages.loadPolls();
        },

        async loadPolls() {
            const el = document.getElementById('polls-list');
            if (!el) return;
            try {
                const polls = await ApiClient.getPolls();
                if (!polls.length) { el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-secondary);grid-column:1/-1;"><i class="ph ph-chart-bar" style="font-size:40px;display:block;margin-bottom:10px;"></i>No polls yet.</div>`; return; }
                el.innerHTML = polls.map(poll => {
                    const total = poll.options.reduce((s, o) => s + o.votes, 0);
                    const maxV  = Math.max(...poll.options.map(o => o.votes));
                    return `<div class="card" style="border-top:4px solid ${poll.is_active ? 'var(--primary-color)' : 'var(--border-color)'};${poll.is_active ? '' : 'opacity:0.75;'}">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                            <div>
                                <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;background:${poll.is_active ? 'rgba(88,166,255,0.15)' : 'rgba(255,255,255,0.08)'};color:${poll.is_active ? 'var(--primary-color)' : 'var(--text-secondary)'};">${poll.is_active ? 'ACTIVE' : 'CLOSED'}</span>
                                ${App.user?.role === 'admin' && !App.user?.is_superadmin ? `<span style="cursor:pointer;color:var(--danger-color);font-size:12px;margin-left:12px;" onclick="App.pages.deletePoll(${poll.id})"><i class="ph ph-trash"></i> Delete</span>` : ''}
                            </div>
                            <span style="color:var(--text-secondary);font-size:12px;">${total} vote${total!==1?'s':''}</span>
                        </div>
                        <h3 style="color:white;margin-bottom:14px;font-size:15px;line-height:1.4;">${poll.question}</h3>
                        <div style="display:flex;flex-direction:column;gap:10px;">
                            ${poll.is_active ?
                                poll.options.map(opt => `<button onclick="App.pages.castVote(${poll.id},${opt.id})" style="background:rgba(255,255,255,0.05);border:1px solid var(--border-color);color:white;padding:10px 14px;border-radius:8px;text-align:left;cursor:pointer;font-family:inherit;font-size:13px;transition:all 0.2s;" onmouseover="this.style.background='rgba(88,166,255,0.12)';this.style.borderColor='var(--primary-color)'" onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.borderColor='var(--border-color)'">${opt.text}</button>`).join('')
                                :
                                poll.options.map(opt => { const pct = total > 0 ? Math.round(opt.votes/total*100) : 0; const win = opt.votes === maxV && maxV > 0; return `<div style="position:relative;background:rgba(255,255,255,0.05);border-radius:8px;overflow:hidden;"><div style="position:absolute;left:0;top:0;bottom:0;width:${pct}%;background:${win?'rgba(88,166,255,0.22)':'rgba(255,255,255,0.07)'};"></div><div style="position:relative;padding:10px 14px;display:flex;justify-content:space-between;"><span style="color:${win?'white':'var(--text-secondary)'};font-size:13px;">${opt.text}${win?' ✓':''}</span><span style="font-weight:600;font-size:13px;color:${win?'var(--primary-color)':'var(--text-secondary)'};">${pct}%</span></div></div>`; }).join('')
                            }
                        </div>
                    </div>`;
                }).join('');
            } catch (err) { el.innerHTML = `<div style="color:var(--danger-color);grid-column:1/-1;padding:20px;">Error: ${err.message}</div>`; }
        },

        async deletePoll(pollId) {
            if (!confirm('Delete this poll?')) return;
            try {
                await ApiClient.deletePoll(pollId);
                showToast('Poll deleted', 'success');
                App.pages.loadPolls();
            } catch (err) { showToast(err.message, 'error'); }
        },

        async castVote(pollId, optionId) {
            try {
                await ApiClient.votePoll(pollId, optionId);
                showToast('Vote submitted!', 'success');
                await App.pages.loadPolls();
            } catch (err) { showToast(err.message, 'error'); }
        },

        showCreatePollForm() {
            const el = document.getElementById('create-poll-container');
            if (!el) return;
            el.innerHTML = `<div class="card" style="margin-bottom:24px;border:1px solid var(--primary-color);">
                <h3 style="color:white;margin-bottom:16px;"><i class="ph ph-plus-circle" style="color:var(--primary-color);"></i> New Poll</h3>
                <input id="poll-q" placeholder="Poll question…" style="width:100%;padding:11px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:14px;box-sizing:border-box;margin-bottom:12px;">
                <textarea id="poll-opts" placeholder="Option A&#10;Option B&#10;Option C" rows="4" style="width:100%;padding:11px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:14px;box-sizing:border-box;resize:vertical;margin-bottom:12px;"></textarea>
                <div style="display:flex;gap:10px;">
                    <button class="btn" id="submit-poll-btn" onclick="App.pages.submitCreatePoll()"><i class="ph ph-paper-plane-tilt"></i> Create Poll</button>
                    <button class="btn btn-secondary" onclick="document.getElementById('create-poll-container').innerHTML=''">Cancel</button>
                </div>
            </div>`;
        },

        async submitCreatePoll() {
            const q = document.getElementById('poll-q').value.trim();
            const opts = document.getElementById('poll-opts').value.split('\n').map(s=>s.trim()).filter(Boolean);
            if (!q) { showToast('Enter a question', 'error'); return; }
            if (opts.length < 2) { showToast('At least 2 options needed', 'error'); return; }
            const btn = document.getElementById('submit-poll-btn');
            btn.disabled = true; btn.innerHTML = '<i class="ph ph-circle-notch" style="animation:spin 1s linear infinite;"></i> Creating…';
            try {
                await ApiClient.createPoll(q, opts);
                showToast('Poll created!', 'success');
                document.getElementById('create-poll-container').innerHTML = '';
                await App.pages.loadPolls();
            } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.innerHTML = 'Create Poll'; }
        },

        // ── Page: Properties ─────────────────────────────────
        async properties(container) {
            const isAdmin = App.user?.role === 'admin' && !App.user?.is_superadmin;
            if (App.user?.is_superadmin) { container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--text-secondary);"><i class="ph ph-lock-key" style="font-size:40px;display:block;margin-bottom:12px;"></i>No community access.</div>`; return; }
            container.innerHTML = `<div class="fade-in">
                <div class="page-header">
                    <div><h1 class="h1">Property Listings</h1><p style="color:var(--text-secondary);">Properties for rent, sale, or vacant within the community.</p></div>
                    ${isAdmin ? `<button class="btn" onclick="App.pages.showAddPropertyForm()"><i class="ph ph-plus"></i> Add Listing</button>` : ''}
                </div>
                <div id="add-prop-form"></div>
                <div style="display:flex;margin-bottom:20px;"><div style="display:flex;background:rgba(0,0,0,0.3);border-radius:8px;padding:4px;gap:2px;">
                    <button class="ptab" id="pt-all"      onclick="App.pages.filterProps('all')"      style="background:var(--primary-color);border:none;color:white;padding:7px 14px;border-radius:6px;font-family:inherit;font-size:13px;cursor:pointer;font-weight:500;">All</button>
                    <button class="ptab" id="pt-for_sale" onclick="App.pages.filterProps('for_sale')" style="background:transparent;border:none;color:var(--text-secondary);padding:7px 14px;border-radius:6px;font-family:inherit;font-size:13px;cursor:pointer;">For Sale</button>
                    <button class="ptab" id="pt-for_rent" onclick="App.pages.filterProps('for_rent')" style="background:transparent;border:none;color:var(--text-secondary);padding:7px 14px;border-radius:6px;font-family:inherit;font-size:13px;cursor:pointer;">For Rent</button>
                    <button class="ptab" id="pt-vacant"   onclick="App.pages.filterProps('vacant')"   style="background:transparent;border:none;color:var(--text-secondary);padding:7px 14px;border-radius:6px;font-family:inherit;font-size:13px;cursor:pointer;">Vacant</button>
                </div></div>
                <div id="props-list" class="grid-overview"><p style="color:var(--text-secondary);">Loading…</p></div>
            </div>`;
            App._allProperties = [];
            await App.pages.loadProperties();
        },

        async loadProperties() {
            const el = document.getElementById('props-list');
            if (!el) return;
            try {
                App._allProperties = await ApiClient.getProperties();
                App.pages.renderProperties(App._allProperties);
            } catch (err) { el.innerHTML = `<div style="color:var(--danger-color);grid-column:1/-1;">Error: ${err.message}</div>`; }
        },

        filterProps(status) {
            document.querySelectorAll('.ptab').forEach(t => { t.style.background = 'transparent'; t.style.color = 'var(--text-secondary)'; });
            const act = document.getElementById('pt-' + status);
            if (act) { act.style.background = 'var(--primary-color)'; act.style.color = 'white'; }
            App.pages.renderProperties(status === 'all' ? App._allProperties : App._allProperties.filter(p => p.status === status));
        },

        renderProperties(props) {
            const el = document.getElementById('props-list');
            if (!el) return;
            if (!props.length) { el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-secondary);grid-column:1/-1;"><i class="ph ph-house" style="font-size:40px;display:block;margin-bottom:10px;"></i>No listings found.</div>`; return; }
            const imgs = ['https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&q=80','https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&q=80','https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=400&q=80','https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&q=80'];
            const labels = {for_rent:'FOR RENT', for_sale:'FOR SALE', vacant:'VACANT'};
            const colors = {for_rent:'#58a6ff', for_sale:'#2ea043', vacant:'#8b949e'};
            el.innerHTML = props.map((p, i) => `<div class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column;">
                <div style="position:relative;height:170px;"><img src="${imgs[i%imgs.length]}" style="width:100%;height:100%;object-fit:cover;">
                    <div style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);padding:4px 8px;border-radius:6px;color:${colors[p.status]||'white'};font-size:11px;font-weight:700;">${labels[p.status]||p.status}</div>
                </div>
                <div style="padding:14px;display:flex;flex-direction:column;flex:1;">
                    <h3 style="color:white;font-size:15px;margin-bottom:4px;">${p.title}</h3>
                    <p style="color:var(--text-secondary);font-size:12px;margin-bottom:10px;flex:1;">${p.description}</p>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--border-color);">
                        <span style="color:var(--primary-color);font-weight:700;font-size:15px;">${p.price}</span>
                        <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px;">Contact</button>
                    </div>
                </div>
            </div>`).join('');
        },

        showAddPropertyForm() {
            const el = document.getElementById('add-prop-form');
            if (!el) return;
            el.innerHTML = `<div class="card" style="margin-bottom:20px;border:1px solid var(--primary-color);">
                <h3 style="color:white;margin-bottom:16px;"><i class="ph ph-house" style="color:var(--primary-color);"></i> Add Listing</h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                    <input id="p-title" placeholder="Property Title (e.g. Villa 402)" style="padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:13px;">
                    <input id="p-price" placeholder="Price (e.g. ₹25,000/mo)" style="padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:13px;">
                    <textarea id="p-desc" placeholder="Description" rows="2" style="padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:13px;resize:none;"></textarea>
                    <select id="p-status" style="padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:13px;">
                        <option value="for_rent">For Rent</option>
                        <option value="for_sale">For Sale</option>
                        <option value="vacant">Vacant</option>
                    </select>
                </div>
                <div style="display:flex;gap:10px;">
                    <button class="btn" id="add-prop-btn" onclick="App.pages.submitAddProperty()"><i class="ph ph-check"></i> Add Listing</button>
                    <button class="btn btn-secondary" onclick="document.getElementById('add-prop-form').innerHTML=''">Cancel</button>
                </div>
            </div>`;
        },

        async submitAddProperty() {
            const title = document.getElementById('p-title').value.trim();
            const price = document.getElementById('p-price').value.trim();
            const desc  = document.getElementById('p-desc').value.trim();
            const status = document.getElementById('p-status').value;
            if (!title || !price || !desc) { showToast('Fill all fields', 'error'); return; }
            const btn = document.getElementById('add-prop-btn');
            btn.disabled = true; btn.textContent = 'Adding…';
            try {
                await ApiClient.createProperty(title, desc, price, status);
                showToast('Listing added!', 'success');
                document.getElementById('add-prop-form').innerHTML = '';
                await App.pages.loadProperties();
            } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Add Listing'; }
        },

        // ── Static Pages (Voting / Reviews / Gallery) ────────
        voting(container) {
            container.innerHTML = `<div class="fade-in"><div class="page-header"><div><h1 class="h1">Formal Voting</h1><p style="color:var(--text-secondary);">Official community decisions.</p></div></div>
            <div class="card" style="text-align:center;padding:60px;"><i class="ph ph-check-square-offset" style="font-size:40px;color:var(--text-secondary);margin-bottom:12px;"></i><p style="color:var(--text-secondary);">Voting feature is coming soon.</p></div></div>`;
        },

        reviews(container) {
            container.innerHTML = `<div class="fade-in"><div class="page-header"><div><h1 class="h1">Reviews & Ratings</h1><p style="color:var(--text-secondary);">Rate community services and vendors.</p></div></div>
            <div class="card" style="text-align:center;padding:60px;"><i class="ph ph-star" style="font-size:40px;color:var(--text-secondary);margin-bottom:12px;"></i><p style="color:var(--text-secondary);">Reviews feature is coming soon.</p></div></div>`;
        },

        async gallery(container) {
            container.innerHTML = `<div class="fade-in"><div class="page-header"><div><h1 class="h1">Community Gallery</h1><p style="color:var(--text-secondary);">Photos from events, festivals, and activities.</p></div>
                ${App.user?.role === 'admin' && !App.user?.is_superadmin ? `<button class="btn" onclick="App.pages.showAddGalleryForm()"><i class="ph ph-upload-simple"></i> Upload Image</button>` : ''}
            </div>
            <div id="add-gallery-form-container"></div>
            <div id="gallery-grid" style="column-count:3;column-gap:16px;">
                <p style="color:var(--text-secondary);padding:20px;">Loading gallery...</p>
            </div></div>`;
            await App.pages.loadGallery();
        },

        async loadGallery() {
            const grid = document.getElementById('gallery-grid');
            if (!grid) return;
            try {
                const imgs = await ApiClient.getGalleryImages();
                if (!imgs.length) { grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-secondary);"><i class="ph ph-images" style="font-size:40px;display:block;margin-bottom:10px;"></i>No images in gallery.</div>`; return; }
                const isAdmin = App.user?.role === 'admin' && !App.user?.is_superadmin;
                grid.innerHTML = imgs.map(img => `<div style="position:relative;margin-bottom:16px;border-radius:12px;overflow:hidden;break-inside:avoid;">
                    <img src="${img.src}" style="width:100%;display:block;transition:transform 0.4s;" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'">
                    <div style="position:absolute;bottom:0;left:0;right:0;padding:18px 14px 14px;background:linear-gradient(to top,rgba(0,0,0,0.8),transparent);">
                        <span style="color:white;font-size:13px;font-weight:500;">${img.label}</span>
                    </div>
                    ${isAdmin ? `<button class="btn btn-secondary" style="position:absolute;top:10px;right:10px;padding:6px 10px;font-size:12px;background:rgba(0,0,0,0.6);" onclick="App.pages.deleteGalleryImage(${img.id})"><i class="ph ph-trash" style="color:var(--danger-color);"></i></button>` : ''}
                </div>`).join('');
            } catch (err) { grid.innerHTML = `<div style="color:var(--danger-color);padding:20px;">Error: ${err.message}</div>`; }
        },

        showAddGalleryForm() {
            const el = document.getElementById('add-gallery-form-container');
            if (!el) return;
            el.innerHTML = `<div class="card" style="margin-bottom:24px;border:1px solid var(--primary-color);">
                <h3 style="color:white;margin-bottom:16px;"><i class="ph ph-upload-simple" style="color:var(--primary-color);"></i> Upload Image URL</h3>
                <input id="gal-src" placeholder="Image URL (https://...)" style="width:100%;padding:11px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:14px;box-sizing:border-box;margin-bottom:12px;">
                <input id="gal-label" placeholder="Image Label (e.g. Diwali 2025)" style="width:100%;padding:11px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:14px;box-sizing:border-box;margin-bottom:12px;">
                <div style="display:flex;gap:10px;">
                    <button class="btn" id="submit-gal-btn" onclick="App.pages.submitGalleryImage()"><i class="ph ph-check"></i> Save Image</button>
                    <button class="btn btn-secondary" onclick="document.getElementById('add-gallery-form-container').innerHTML=''">Cancel</button>
                </div>
            </div>`;
        },

        async submitGalleryImage() {
            const src = document.getElementById('gal-src').value.trim();
            const label = document.getElementById('gal-label').value.trim();
            if (!src || !label) { showToast('Provide both URL and Label', 'error'); return; }
            const btn = document.getElementById('submit-gal-btn');
            btn.disabled = true; btn.textContent = 'Saving...';
            try {
                await ApiClient.addGalleryImage(src, label);
                showToast('Image added', 'success');
                document.getElementById('add-gallery-form-container').innerHTML = '';
                await App.pages.loadGallery();
            } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Save Image'; }
        },

        async deleteGalleryImage(id) {
            if (!confirm('Delete this image?')) return;
            try {
                await ApiClient.deleteGalleryImage(id);
                showToast('Image deleted', 'success');
                App.pages.loadGallery();
            } catch (err) { showToast(err.message, 'error'); }
        },

        // ── Page: Maintenance Bills ───────────────────────────
        async maintenance(container) {
            const isAdmin  = App.user?.role === 'admin' && !App.user?.is_superadmin;
            const isSA     = App.user?.is_superadmin;

            if (isSA) {
                container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--text-secondary);"><i class="ph ph-lock-key" style="font-size:48px;display:block;margin-bottom:12px;"></i><p>Super Admins do not manage community maintenance bills.</p></div>`;
                return;
            }

            container.innerHTML = `<div class="fade-in">
                <div class="page-header">
                    <div><h1 class="h1">Maintenance Bills</h1><p style="color:var(--text-secondary);">${isAdmin ? 'Manage monthly maintenance bills for your community.' : 'Your maintenance bill statements.'}</p></div>
                    ${isAdmin ? `<button class="btn" onclick="App.pages.showCreateBillForm()"><i class="ph ph-plus"></i> Create Bill</button>` : ''}
                </div>
                <div id="bill-create-form"></div>
                <div id="bills-content"><p style="color:var(--text-secondary);">Loading…</p></div>
            </div>`;

            await App.pages.loadBills(isAdmin);
        },

        async loadBills(isAdmin) {
            const el = document.getElementById('bills-content');
            if (!el) return;
            try {
                const bills = isAdmin
                    ? await ApiClient.getMaintenanceBills()
                    : await ApiClient.getMyBills();
                App.pages.renderBills(bills, isAdmin);
            } catch (err) {
                el.innerHTML = `<div style="color:var(--danger-color);padding:20px;">Error: ${err.message}</div>`;
            }
        },

        renderBills(bills, isAdmin) {
            const el = document.getElementById('bills-content');
            if (!el) return;

            if (!bills.length) {
                el.innerHTML = `<div class="card" style="text-align:center;padding:60px;">
                    <i class="ph ph-receipt" style="font-size:48px;color:var(--text-secondary);display:block;margin-bottom:14px;"></i>
                    <p style="color:var(--text-secondary);">${isAdmin ? 'No bills raised yet. Click "Create Bill" to get started.' : 'No maintenance bills for your account.'}</p>
                </div>`;
                return;
            }

            const now = new Date();

            const statusBadge = (bill) => {
                if (bill.is_paid) return `<span style="background:rgba(46,160,67,0.15);color:var(--success-color);padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">✓ PAID</span>`;
                const due = new Date(bill.due_date);
                const overdue = due < now;
                return `<span style="background:${overdue ? 'rgba(248,81,73,0.15)' : 'rgba(248,160,73,0.15)'};color:${overdue ? 'var(--danger-color)' : 'var(--warning-color)'};padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">${overdue ? '⚠ OVERDUE' : '⏳ DUE'}</span>`;
            };

            const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
            const fmtAmt  = (a) => `₹${parseFloat(a).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

            if (isAdmin) {
                // Admin: table layout
                el.innerHTML = `
                <div class="card" style="overflow:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:13px;">
                        <thead>
                            <tr style="border-bottom:1px solid var(--border-color);">
                                <th style="text-align:left;padding:10px 12px;color:var(--text-secondary);font-weight:600;font-size:11px;letter-spacing:0.5px;">RESIDENT</th>
                                <th style="text-align:left;padding:10px 12px;color:var(--text-secondary);font-weight:600;font-size:11px;letter-spacing:0.5px;">PERIOD</th>
                                <th style="text-align:left;padding:10px 12px;color:var(--text-secondary);font-weight:600;font-size:11px;letter-spacing:0.5px;">DESCRIPTION</th>
                                <th style="text-align:right;padding:10px 12px;color:var(--text-secondary);font-weight:600;font-size:11px;letter-spacing:0.5px;">AMOUNT</th>
                                <th style="text-align:left;padding:10px 12px;color:var(--text-secondary);font-weight:600;font-size:11px;letter-spacing:0.5px;">DUE DATE</th>
                                <th style="text-align:left;padding:10px 12px;color:var(--text-secondary);font-weight:600;font-size:11px;letter-spacing:0.5px;">STATUS</th>
                                <th style="text-align:left;padding:10px 12px;color:var(--text-secondary);font-weight:600;font-size:11px;letter-spacing:0.5px;">ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${bills.map(b => `
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.04);" id="bill-row-${b.id}">
                                <td style="padding:12px;color:white;font-weight:500;">${b.resident_name}</td>
                                <td style="padding:12px;color:var(--text-secondary);">${b.billing_period}</td>
                                <td style="padding:12px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${b.description || '—'}</td>
                                <td style="padding:12px;color:var(--primary-color);font-weight:700;text-align:right;">${fmtAmt(b.amount)}</td>
                                <td style="padding:12px;color:var(--text-secondary);">${fmtDate(b.due_date)}</td>
                                <td style="padding:12px;">${statusBadge(b)}</td>
                                <td style="padding:12px;">
                                    <div style="display:flex;gap:6px;align-items:center;">
                                        ${!b.is_paid ? `
                                        <button onclick="App.pages.markPaid(${b.id})"
                                            style="background:rgba(46,160,67,0.12);color:var(--success-color);border:1px solid rgba(46,160,67,0.3);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:4px;"
                                            onmouseover="this.style.background='rgba(46,160,67,0.25)'" onmouseout="this.style.background='rgba(46,160,67,0.12)'">
                                            <i class="ph ph-check"></i> Mark Paid
                                        </button>
                                        <button onclick="App.pages.deleteBill(${b.id})"
                                            style="background:rgba(248,81,73,0.08);color:var(--danger-color);border:1px solid rgba(248,81,73,0.25);border-radius:6px;padding:5px 8px;font-size:12px;cursor:pointer;font-family:inherit;"
                                            onmouseover="this.style.background='rgba(248,81,73,0.2)'" onmouseout="this.style.background='rgba(248,81,73,0.08)'" title="Delete bill">
                                            <i class="ph ph-trash"></i>
                                        </button>` : `
                                        <button onclick="App.pages.downloadReceipt(${JSON.stringify(b).replace(/"/g,'&quot;')})"
                                            style="background:rgba(88,166,255,0.1);color:var(--primary-color);border:1px solid rgba(88,166,255,0.25);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:4px;"
                                            onmouseover="this.style.background='rgba(88,166,255,0.2)'" onmouseout="this.style.background='rgba(88,166,255,0.1)'">
                                            <i class="ph ph-download-simple"></i> Receipt
                                        </button>`}
                                    </div>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>`;
            } else {
                // Resident: card layout
                el.innerHTML = `<div class="grid-overview">${bills.map(b => `
                <div class="card" style="border-top:4px solid ${b.is_paid ? 'var(--success-color)' : (new Date(b.due_date) < now ? 'var(--danger-color)' : 'var(--warning-color)')};">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
                        <div>
                            <div style="color:white;font-weight:700;font-size:16px;">₹${parseFloat(b.amount).toLocaleString('en-IN', {minimumFractionDigits:2})}</div>
                            <div style="color:var(--text-secondary);font-size:12px;margin-top:2px;">${b.billing_period}</div>
                        </div>
                        ${statusBadge(b)}
                    </div>
                    ${b.description ? `<p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px;">${b.description}</p>` : ''}
                    <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-secondary);border-top:1px solid var(--border-color);padding-top:12px;">
                        <div style="display:flex;justify-content:space-between;"><span>Due Date</span><span style="color:var(--text-primary);">${fmtDate(b.due_date)}</span></div>
                        ${b.is_paid ? `<div style="display:flex;justify-content:space-between;"><span>Paid On</span><span style="color:var(--success-color);">${fmtDate(b.paid_at)}</span></div>` : ''}
                        <div style="display:flex;justify-content:space-between;"><span>Bill #</span><span style="color:var(--text-primary);">MB-${String(b.id).padStart(5,'0')}</span></div>
                    </div>
                    ${b.is_paid ? `
                    <button onclick="App.pages.downloadReceipt(${JSON.stringify(b).replace(/"/g,'&quot;')})"
                        class="btn btn-secondary" style="width:100%;justify-content:center;margin-top:14px;font-size:13px;">
                        <i class="ph ph-download-simple"></i> Download Receipt
                    </button>` : `
                    <div style="margin-top:14px;padding:10px 14px;background:rgba(248,160,73,0.06);border:1px solid rgba(248,160,73,0.25);border-radius:8px;font-size:12px;color:var(--warning-color);text-align:center;">
                        <i class="ph ph-info"></i> Please pay at the community office. Admin will mark it paid.
                    </div>`}
                </div>`).join('')}</div>`;
            }
        },

        showCreateBillForm() {
            const el = document.getElementById('bill-create-form');
            if (!el) return;
            if (el.innerHTML.trim()) { el.innerHTML = ''; return; }

            const iS = `padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:13px;width:100%;box-sizing:border-box;`;

            // Load residents for the multi-select
            ApiClient.getUsers().then(users => {
                const residents = users.filter(u => u.role === 'resident');
                const residentOptions = residents.length
                    ? residents.map(r => `<option value="${r.id}">${r.name} (${r.email})</option>`).join('')
                    : '<option disabled>No residents found</option>';

                // Get current month as default billing period
                const now = new Date();
                const defaultPeriod = now.toLocaleString('default', { month: 'long' }) + ' ' + now.getFullYear();
                const defaultDue = new Date(now.getFullYear(), now.getMonth() + 1, 5).toISOString().slice(0,10);

                el.innerHTML = `<div class="card" style="margin-bottom:24px;border:1px solid var(--primary-color);">
                    <h3 style="color:white;margin-bottom:18px;display:flex;align-items:center;gap:8px;"><i class="ph ph-receipt" style="color:var(--primary-color);"></i> Create Maintenance Bill</h3>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                        <div style="grid-column:1/-1;">
                            <label style="display:block;color:var(--text-secondary);font-size:12px;margin-bottom:6px;">Select Residents <span style="color:var(--text-secondary);font-size:11px;">(Ctrl+Click or Cmd+Click to select multiple)</span></label>
                            <select id="bill-residents" multiple style="${iS}height:120px;">${residentOptions}</select>
                            <div style="margin-top:6px;display:flex;gap:8px;">
                                <button onclick="App.pages._billSelectAll()" style="background:rgba(88,166,255,0.1);color:var(--primary-color);border:1px solid rgba(88,166,255,0.25);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:inherit;">Select All</button>
                                <button onclick="App.pages._billDeselectAll()" style="background:rgba(255,255,255,0.05);color:var(--text-secondary);border:1px solid var(--border-color);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:inherit;">Deselect All</button>
                            </div>
                        </div>
                        <div>
                            <label style="display:block;color:var(--text-secondary);font-size:12px;margin-bottom:6px;">Billing Period</label>
                            <input id="bill-period" value="${defaultPeriod}" placeholder="e.g. August 2026" style="${iS}">
                        </div>
                        <div>
                            <label style="display:block;color:var(--text-secondary);font-size:12px;margin-bottom:6px;">Amount (₹)</label>
                            <input id="bill-amount" type="number" min="1" placeholder="e.g. 2500" style="${iS}">
                        </div>
                        <div>
                            <label style="display:block;color:var(--text-secondary);font-size:12px;margin-bottom:6px;">Due Date</label>
                            <input id="bill-due" type="date" value="${defaultDue}" style="${iS}">
                        </div>
                        <div>
                            <label style="display:block;color:var(--text-secondary);font-size:12px;margin-bottom:6px;">Description <span style="color:var(--text-secondary);font-size:11px;">(optional)</span></label>
                            <input id="bill-desc" placeholder="e.g. Maintenance + Water charges" style="${iS}">
                        </div>
                    </div>
                    <div style="display:flex;gap:10px;">
                        <button class="btn" id="bill-submit-btn" onclick="App.pages.submitCreateBill()"><i class="ph ph-paper-plane-tilt"></i> Create Bill(s)</button>
                        <button class="btn btn-secondary" onclick="document.getElementById('bill-create-form').innerHTML=''">Cancel</button>
                    </div>
                </div>`;
            }).catch(err => {
                el.innerHTML = `<div class="card" style="color:var(--danger-color);">Failed to load residents: ${err.message}</div>`;
            });
        },

        _billSelectAll() {
            const sel = document.getElementById('bill-residents');
            if (sel) Array.from(sel.options).forEach(o => o.selected = true);
        },

        _billDeselectAll() {
            const sel = document.getElementById('bill-residents');
            if (sel) Array.from(sel.options).forEach(o => o.selected = false);
        },

        async submitCreateBill() {
            const sel    = document.getElementById('bill-residents');
            const period = document.getElementById('bill-period')?.value.trim();
            const amount = document.getElementById('bill-amount')?.value;
            const due    = document.getElementById('bill-due')?.value;
            const desc   = document.getElementById('bill-desc')?.value.trim();

            const selectedIds = sel ? Array.from(sel.selectedOptions).map(o => parseInt(o.value)) : [];
            if (!selectedIds.length) { showToast('Select at least one resident', 'error'); return; }
            if (!period) { showToast('Enter a billing period', 'error'); return; }
            if (!amount || parseFloat(amount) <= 0) { showToast('Enter a valid amount greater than ₹0', 'error'); return; }
            if (!due) { showToast('Select a due date', 'error'); return; }

            const btn = document.getElementById('bill-submit-btn');
            btn.disabled = true; btn.innerHTML = '<i class="ph ph-circle-notch" style="animation:spin 1s linear infinite;"></i> Creating…';
            try {
                const dueISO = new Date(due + 'T23:59:59').toISOString();
                await ApiClient.createMaintenanceBills(selectedIds, period, amount, desc || null, dueISO);
                showToast(`Bill(s) created for ${selectedIds.length} resident${selectedIds.length > 1 ? 's' : ''}!`, 'success');
                document.getElementById('bill-create-form').innerHTML = '';
                await App.pages.loadBills(true);
            } catch (err) {
                showToast(err.message, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Create Bill(s)';
            }
        },

        async markPaid(billId) {
            if (!confirm('Mark this bill as paid? This action cannot be undone.')) return;
            try {
                await ApiClient.markBillPaid(billId);
                showToast('Bill marked as paid!', 'success');
                await App.pages.loadBills(true);
            } catch (err) { showToast(err.message, 'error'); }
        },

        async deleteBill(billId) {
            if (!confirm('Delete this bill? This cannot be undone.')) return;
            try {
                await ApiClient.deleteMaintenanceBill(billId);
                showToast('Bill deleted', 'success');
                await App.pages.loadBills(true);
            } catch (err) { showToast(err.message, 'error'); }
        },

        downloadReceipt(bill) {
            // Parse if passed as a JSON string (from inline onclick attribute)
            if (typeof bill === 'string') { try { bill = JSON.parse(bill); } catch { showToast('Receipt error', 'error'); return; } }

            const fmtAmt  = (a) => `₹${parseFloat(a).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' }) : '—';
            const billNo  = `MB-${String(bill.id).padStart(5,'0')}`;
            const communityName = App.user?.community_name || 'AJS Community';

            const receiptHTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Maintenance Receipt ${billNo}</title>
<style>
  @media print {
    body * { visibility: hidden; }
    #receipt-printable, #receipt-printable * { visibility: visible; }
    #receipt-printable { position: fixed; top: 0; left: 0; width: 100%; }
    .no-print { display: none !important; }
  }
  body { font-family: 'Inter', Arial, sans-serif; background: #f0f4f8; margin: 0; padding: 20px; color: #1a202c; }
  #receipt-printable {
    max-width: 600px; margin: 0 auto; background: #fff;
    border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.12); overflow: hidden;
  }
  .receipt-header {
    background: linear-gradient(135deg, #1a1f2e 0%, #2d3748 100%);
    color: white; padding: 28px 32px; display: flex; align-items: center; gap: 16px;
  }
  .receipt-logo { font-size: 36px; }
  .receipt-org { font-size: 20px; font-weight: 700; margin: 0; }
  .receipt-subtitle { font-size: 13px; opacity: 0.7; margin: 2px 0 0; }
  .receipt-body { padding: 28px 32px; }
  .receipt-title { font-size: 22px; font-weight: 700; color: #2d3748; margin: 0 0 4px; }
  .receipt-status { display: inline-block; background: #c6f6d5; color: #276749; padding: 3px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-bottom: 20px; }
  .receipt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
  .receipt-field { padding: 14px 16px; border-bottom: 1px solid #e2e8f0; }
  .receipt-field:nth-last-child(-n+2) { border-bottom: none; }
  .receipt-field label { font-size: 11px; font-weight: 700; color: #718096; letter-spacing: 0.5px; display: block; margin-bottom: 4px; }
  .receipt-field span { font-size: 14px; color: #2d3748; font-weight: 500; }
  .receipt-amount-box { background: #ebf4ff; border: 1px solid #bee3f8; border-radius: 8px; padding: 18px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .receipt-amount-label { font-size: 13px; color: #4a5568; font-weight: 500; }
  .receipt-amount-value { font-size: 26px; font-weight: 800; color: #2b6cb0; }
  .receipt-footer { border-top: 1px solid #e2e8f0; padding: 16px 32px; text-align: center; font-size: 12px; color: #a0aec0; }
  .receipt-official { background: #f0fff4; border: 1px solid #9ae6b4; border-radius: 6px; padding: 10px 14px; font-size: 12px; color: #276749; text-align: center; margin-bottom: 16px; }
</style>
</head>
<body>
<div id="receipt-printable">
  <div class="receipt-header">
    <div class="receipt-logo">🏘️</div>
    <div>
      <p class="receipt-org">AJS Community</p>
      <p class="receipt-subtitle">Official Maintenance Receipt</p>
    </div>
  </div>
  <div class="receipt-body">
    <div class="receipt-title">Maintenance Bill</div>
    <div class="receipt-status">✓ PAID</div>
    <div class="receipt-amount-box">
      <span class="receipt-amount-label">Total Amount Paid</span>
      <span class="receipt-amount-value">${fmtAmt(bill.amount)}</span>
    </div>
    <div class="receipt-grid">
      <div class="receipt-field"><label>RECEIPT NO.</label><span>${billNo}</span></div>
      <div class="receipt-field"><label>BILLING PERIOD</label><span>${bill.billing_period}</span></div>
      <div class="receipt-field"><label>RESIDENT NAME</label><span>${bill.resident_name}</span></div>
      <div class="receipt-field"><label>COMMUNITY</label><span>${communityName}</span></div>
      <div class="receipt-field"><label>DUE DATE</label><span>${fmtDate(bill.due_date)}</span></div>
      <div class="receipt-field"><label>DATE PAID</label><span>${fmtDate(bill.paid_at)}</span></div>
      ${bill.description ? `<div class="receipt-field" style="grid-column:1/-1;"><label>DESCRIPTION</label><span>${bill.description}</span></div>` : ''}
    </div>
    <div class="receipt-official">
      <strong>✅ This is an official payment receipt</strong><br>
      Issued by AJS Community Management System
    </div>
  </div>
  <div class="receipt-footer">
    Generated on ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
    &nbsp;•&nbsp; AJS Community Portal
  </div>
</div>
<div class="no-print" style="text-align:center;margin-top:20px;">
  <button onclick="window.print()" style="padding:12px 28px;background:#2b6cb0;color:white;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:600;">🖨️ Print / Save as PDF</button>
  <button onclick="window.close()" style="margin-left:12px;padding:12px 20px;background:#e2e8f0;color:#2d3748;border:none;border-radius:8px;font-size:15px;cursor:pointer;">Close</button>
</div>
</body>
</html>`;

            const receiptWin = window.open('', '_blank', 'width=700,height=850,menubar=no,toolbar=no,location=no,status=no');
            if (!receiptWin) { showToast('Please allow pop-ups to view receipts', 'error'); return; }
            receiptWin.document.write(receiptHTML);
            receiptWin.document.close();
        },

        // ── Super Admin: Community Management helpers (inside App.pages so onclick="App.pages.*" works) ──

    _communityCardHTML(comm, members) {
        const admin     = members.find(m => m.role === 'admin');
        const residents = members.filter(m => m.role === 'resident');
        const commName  = comm.name.replace(/'/g, "\\'");

        const adminSection = admin
            ? `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(88,166,255,0.08);border:1px solid rgba(88,166,255,0.2);border-radius:10px;">
                <div style="width:42px;height:42px;border-radius:50%;background:var(--primary-color);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:16px;flex-shrink:0;">${admin.name.charAt(0).toUpperCase()}</div>
                <div style="flex:1;min-width:0;">
                    <div style="color:white;font-weight:600;font-size:14px;">${admin.name}</div>
                    <div style="color:var(--text-secondary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${admin.email}</div>
                </div>
                <span style="background:rgba(88,166,255,0.2);color:var(--primary-color);padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;flex-shrink:0;">ADMIN</span>
              </div>`
            : `<div style="background:rgba(248,81,73,0.06);border:1px dashed rgba(248,81,73,0.4);border-radius:10px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <i class="ph ph-warning-circle" style="color:var(--danger-color);font-size:24px;flex-shrink:0;"></i>
                    <div>
                        <div style="color:white;font-size:13px;font-weight:600;">No Admin Assigned</div>
                        <div style="color:var(--text-secondary);font-size:12px;">Add a community admin to manage residents</div>
                    </div>
                </div>
                <button class="btn" style="flex-shrink:0;font-size:12px;padding:8px 14px;" onclick="App.pages.showAddMemberForm(${comm.id},'admin')">
                    <i class="ph ph-crown"></i> Add Admin
                </button>
              </div>`;

        const resSection = residents.length
            ? `<div style="margin-top:16px;">
                <h4 style="color:var(--text-secondary);font-size:11px;font-weight:700;letter-spacing:0.5px;margin-bottom:10px;">RESIDENTS (${residents.length})</h4>
                <div style="display:flex;flex-direction:column;gap:6px;">
                    ${residents.slice(0,4).map(r => `
                    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid var(--border-color);">
                        <div style="width:28px;height:28px;border-radius:50%;background:rgba(46,160,67,0.25);display:flex;align-items:center;justify-content:center;color:var(--success-color);font-weight:600;font-size:11px;flex-shrink:0;">${r.name.charAt(0).toUpperCase()}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="color:var(--text-primary);font-size:13px;">${r.name}</div>
                            <div style="color:var(--text-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.email}</div>
                        </div>
                    </div>`).join('')}
                    ${residents.length > 4 ? `<p style="color:var(--text-secondary);font-size:12px;padding:4px 12px;">+${residents.length-4} more resident${residents.length-4>1?'s':''}</p>` : ''}
                </div>
              </div>`
            : `<div style="margin-top:14px;padding:14px;background:rgba(255,255,255,0.02);border-radius:8px;text-align:center;border:1px dashed var(--border-color);">
                <i class="ph ph-users" style="font-size:28px;color:var(--text-secondary);display:block;margin-bottom:6px;"></i>
                <p style="color:var(--text-secondary);font-size:12px;">No residents yet.</p>
              </div>`;

        return `<div class="card" id="comm-card-${comm.id}" style="margin-bottom:20px;border-left:4px solid var(--primary-color);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:12px;">
                <div>
                    <h3 style="color:white;font-size:18px;font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:8px;">
                        <i class="ph-fill ph-buildings" style="color:var(--primary-color);"></i> ${comm.name}
                    </h3>
                    <p style="color:var(--text-secondary);font-size:13px;display:flex;align-items:center;gap:6px;">
                        <i class="ph ph-map-pin"></i> ${comm.address}
                    </p>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
                    <span style="background:rgba(255,255,255,0.07);color:var(--text-secondary);padding:4px 10px;border-radius:12px;font-size:12px;">
                        <i class="ph ph-users"></i> ${members.length} member${members.length!==1?'s':''}
                    </span>
                    ${!admin
                        ? `<span style="background:rgba(248,81,73,0.15);color:var(--danger-color);padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;">⚠ Needs Admin</span>`
                        : `<span style="background:rgba(46,160,67,0.15);color:var(--success-color);padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;">✓ Active</span>`}
                </div>
            </div>
            <div>
                <h4 style="color:var(--text-secondary);font-size:11px;font-weight:700;letter-spacing:0.5px;margin-bottom:10px;">COMMUNITY ADMIN</h4>
                ${adminSection}
            </div>
            ${resSection}
            <div style="border-top:1px solid var(--border-color);padding-top:14px;margin-top:18px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <button class="btn btn-secondary" style="font-size:12px;padding:8px 14px;" onclick="App.pages.showAddMemberForm(${comm.id},'resident')">
                    <i class="ph ph-user-plus"></i> Add Resident
                </button>
                <button class="btn btn-secondary" style="font-size:12px;padding:8px 14px;" onclick="App.pages.showAddMemberForm(${comm.id},'admin')">
                    <i class="ph ph-crown"></i> ${admin ? 'Change Admin' : 'Set Admin'}
                </button>
                <button class="btn btn-secondary" style="font-size:12px;padding:8px 14px;" onclick="App.pages.showChangePasswordForm(${comm.id})">
                    <i class="ph ph-key"></i> Change Password
                </button>
                <button onclick="App.pages.confirmDeleteCommunity(${comm.id},'${commName}')"
                    style="margin-left:auto;font-size:12px;padding:8px 14px;background:rgba(248,81,73,0.12);color:var(--danger-color);border:1px solid rgba(248,81,73,0.35);border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:inherit;font-weight:500;transition:all 0.2s;"
                    onmouseover="this.style.background='rgba(248,81,73,0.25)'" onmouseout="this.style.background='rgba(248,81,73,0.12)'">
                    <i class="ph ph-trash"></i> Delete
                </button>
            </div>
            <div id="add-member-form-${comm.id}"></div>
            <div id="change-pass-form-${comm.id}"></div>
        </div>`;
        },

        showAddMemberForm(communityId, defaultRole = 'resident') {
        const el = document.getElementById(`add-member-form-${communityId}`);
        if (!el) return;
        if (el.innerHTML.trim()) { el.innerHTML = ''; return; }  // toggle off
        const iS = `padding:10px;background:rgba(0,0,0,0.35);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:13px;width:100%;box-sizing:border-box;`;
        el.innerHTML = `<div style="margin-top:16px;padding:20px;background:rgba(88,166,255,0.05);border:1px solid rgba(88,166,255,0.2);border-radius:12px;">
            <h3 style="color:white;font-size:14px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
                <i class="ph ph-user-plus" style="color:var(--primary-color);"></i> Add New Member
            </h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
                <input id="nm-name-${communityId}" placeholder="Full Name" style="${iS}">
                <input id="nm-email-${communityId}" type="email" placeholder="Email Address" style="${iS}">
                <input id="nm-pass-${communityId}" type="password" placeholder="Password (min 6 chars)" style="${iS}">
                <select id="nm-role-${communityId}" style="${iS}">
                    <option value="admin" ${defaultRole==='admin'?'selected':''}>Community Admin</option>
                    <option value="resident" ${defaultRole==='resident'?'selected':''}>Resident</option>
                </select>
            </div>
            <div style="display:flex;gap:8px;">
                <button class="btn" id="nm-btn-${communityId}" onclick="App.pages.submitAddMember(${communityId})">
                    <i class="ph ph-check"></i> Add Member
                </button>
                <button class="btn btn-secondary" onclick="document.getElementById('add-member-form-${communityId}').innerHTML=''">
                    Cancel
                </button>
            </div>
        </div>`;
        setTimeout(() => document.getElementById(`nm-name-${communityId}`)?.focus(), 50);
        },

        async submitAddMember(communityId) {
        const name  = document.getElementById(`nm-name-${communityId}`)?.value.trim();
        const email = document.getElementById(`nm-email-${communityId}`)?.value.trim();
        const pass  = document.getElementById(`nm-pass-${communityId}`)?.value;
        const role  = document.getElementById(`nm-role-${communityId}`)?.value;
        if (!name || !email || !pass) { showToast('Please fill all fields', 'error'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Enter a valid email address', 'error'); return; }
        if (pass.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
        const btn = document.getElementById(`nm-btn-${communityId}`);
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-circle-notch" style="animation:spin 1s linear infinite;"></i> Adding…'; }
        try {
            await ApiClient.registerUser(communityId, email, name, pass, role);
            showToast(`${name} added as ${role === 'admin' ? 'Community Admin' : 'Resident'} successfully!`, 'success');
            await App.pages.dashboard(document.getElementById('page-content'));
        } catch (err) {
            showToast(err.message, 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-check"></i> Add Member'; }
        }
        },

        confirmDeleteCommunity(communityId, communityName) {
        document.getElementById('delete-comm-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'delete-comm-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
        overlay.innerHTML = `
            <div style="background:var(--sidebar-bg);border:1px solid var(--border-color);border-radius:16px;padding:32px;max-width:420px;width:90%;box-shadow:0 24px 64px rgba(0,0,0,0.6);">
                <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
                    <div style="width:48px;height:48px;border-radius:50%;background:rgba(248,81,73,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="ph ph-trash" style="font-size:24px;color:var(--danger-color);"></i>
                    </div>
                    <div>
                        <h3 style="color:white;font-size:16px;font-weight:700;margin-bottom:4px;">Delete Community?</h3>
                        <p style="color:var(--text-secondary);font-size:13px;">This cannot be undone.</p>
                    </div>
                </div>
                <div style="background:rgba(248,81,73,0.08);border:1px solid rgba(248,81,73,0.25);border-radius:10px;padding:14px 16px;margin-bottom:22px;">
                    <p style="color:var(--text-primary);font-size:14px;margin-bottom:6px;">Permanently deleting:</p>
                    <p style="color:white;font-size:15px;font-weight:700;">🏘️ ${communityName}</p>
                    <p style="color:var(--text-secondary);font-size:12px;margin-top:8px;">All members, messages, polls, properties and notifications will be deleted.</p>
                </div>
                <div style="display:flex;gap:10px;">
                    <button id="del-cancel-btn" class="btn btn-secondary" style="flex:1;justify-content:center;">Cancel</button>
                    <button id="del-confirm-btn" class="btn" style="flex:1;justify-content:center;background:var(--danger-color);border-color:var(--danger-color);">
                        <i class="ph ph-trash"></i> Delete Forever
                    </button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('#del-cancel-btn').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        overlay.querySelector('#del-confirm-btn').addEventListener('click', async () => {
            const btn = overlay.querySelector('#del-confirm-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-circle-notch" style="animation:spin 1s linear infinite;"></i> Deleting…';
            try {
                await ApiClient.deleteCommunity(communityId);
                close();
                showToast(`'${communityName}' deleted.`, 'success');
                await App.pages.dashboard(document.getElementById('page-content'));
            } catch (err) {
                showToast(err.message, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="ph ph-trash"></i> Delete Forever';
            }
        });
        },

        showChangePasswordForm(communityId) {
            const el = document.getElementById(`change-pass-form-${communityId}`);
            if (!el) return;
            if (el.innerHTML.trim()) { el.innerHTML = ''; return; }
            
            // Generate user select options
            const commCard = document.getElementById(`comm-card-${communityId}`);
            const commData = App.pages._dashboardData.find(c => c.id === communityId);
            let optionsHTML = '<option value="">Select a user...</option>';
            if (commData && commData.members) {
                commData.members.forEach(m => {
                    optionsHTML += `<option value="${m.id}">${m.name} (${m.email})</option>`;
                });
            }

            const iS = `padding:10px;background:rgba(0,0,0,0.35);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:13px;width:100%;box-sizing:border-box;`;
            el.innerHTML = `<div style="margin-top:16px;padding:20px;background:rgba(248,160,73,0.05);border:1px solid rgba(248,160,73,0.2);border-radius:12px;">
                <h3 style="color:white;font-size:14px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
                    <i class="ph ph-key" style="color:var(--warning-color);"></i> Change User Password
                </h3>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
                    <select id="cp-user-${communityId}" style="${iS}">${optionsHTML}</select>
                    <input id="cp-pass-${communityId}" type="password" placeholder="New Password (min 6 chars)" style="${iS}">
                </div>
                <div style="display:flex;gap:8px;">
                    <button class="btn" id="cp-btn-${communityId}" onclick="App.pages.submitChangePassword(${communityId})" style="background:var(--warning-color);">
                        <i class="ph ph-check"></i> Update Password
                    </button>
                    <button class="btn btn-secondary" onclick="document.getElementById('change-pass-form-${communityId}').innerHTML=''">
                        Cancel
                    </button>
                </div>
            </div>`;
        },

        async submitChangePassword(communityId) {
            const userId = document.getElementById(`cp-user-${communityId}`).value;
            const pass = document.getElementById(`cp-pass-${communityId}`).value.trim();
            if (!userId || !pass) { showToast('Select user and enter password', 'error'); return; }
            if (pass.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
            const btn = document.getElementById(`cp-btn-${communityId}`);
            btn.disabled = true; btn.textContent = 'Updating...';
            try {
                await ApiClient.superAdminChangeUserPassword(userId, pass);
                showToast('Password updated successfully', 'success');
                document.getElementById(`change-pass-form-${communityId}`).innerHTML = '';
            } catch (err) {
                showToast(err.message, 'error');
                btn.disabled = false;
                btn.textContent = 'Update Password';
            }
        },
    },

    async renderSettings() {
        const area = document.getElementById('page-content');
        const currentLang = localStorage.getItem('gcms_lang') || 'en';
        const currentTheme = localStorage.getItem('gcms_theme') || 'dark';

        area.innerHTML = `<div class="fade-in">
            <div class="page-header"><div><div class="h1">Account Settings</div><p style="color:var(--text-secondary);margin-top:8px;">Manage your profile and preferences.</p></div></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">

                <!-- Profile Card -->
                <div class="card" id="profile-card"><p style="color:var(--text-secondary);">Loading profile…</p></div>

                <!-- Appearance Card -->
                <div class="card">
                    <h3 style="color:var(--text-primary);margin-bottom:20px;border-bottom:1px solid var(--border-color);padding-bottom:12px;">Appearance</h3>
                    <div style="margin-bottom:16px;">
                        <label style="display:block;margin-bottom:8px;color:var(--text-secondary);font-size:13px;">Theme</label>
                        <select id="theme-select" style="width:100%;padding:11px;background:rgba(0,0,0,0.2);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-family:inherit;">
                            <option value="dark" ${currentTheme==='dark'?'selected':''}>Dark Mode</option>
                            <option value="light" ${currentTheme==='light'?'selected':''}>Light Mode</option>
                        </select>
                    </div>
                    <div style="margin-bottom:24px;">
                        <label style="display:block;margin-bottom:8px;color:var(--text-secondary);font-size:13px;">Language</label>
                        <select id="lang-select" style="width:100%;padding:11px;background:rgba(0,0,0,0.2);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-family:inherit;">
                            <option value="en" ${currentLang==='en'?'selected':''}>English</option>
                            <option value="te" ${currentLang==='te'?'selected':''}>Telugu</option>
                            <option value="hi" ${currentLang==='hi'?'selected':''}>Hindi</option>
                        </select>
                    </div>
                    <button id="save-settings-btn" class="btn"><i class="ph ph-floppy-disk"></i> Save Preferences</button>
                </div>
            </div>
        </div>`;

        // Save appearance
        document.getElementById('save-settings-btn').addEventListener('click', () => {
            const t = document.getElementById('theme-select').value;
            const l = document.getElementById('lang-select').value;
            localStorage.setItem('gcms_theme', t);
            if (t === 'light') document.documentElement.setAttribute('data-theme','light');
            else document.documentElement.removeAttribute('data-theme');
            if (typeof appI18n !== 'undefined') appI18n.setLanguage(l);
            showToast('Preferences saved!', 'success');
        });

        // Load real profile from API
        try {
            const profile = await ApiClient.getProfile();
            const profileCard = document.getElementById('profile-card');
            if (!profileCard) return;
            profileCard.innerHTML = `
                <h3 style="color:var(--text-primary);margin-bottom:20px;border-bottom:1px solid var(--border-color);padding-bottom:12px;display:flex;align-items:center;gap:8px;">
                    <i class="ph ph-user-circle" style="color:var(--primary-color);"></i> My Profile
                </h3>
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding:16px;background:rgba(0,0,0,0.2);border-radius:12px;">
                    <div style="width:56px;height:56px;border-radius:50%;background:var(--primary-color);display:flex;align-items:center;justify-content:center;color:white;font-size:22px;font-weight:700;flex-shrink:0;">${profile.name.charAt(0).toUpperCase()}</div>
                    <div>
                        <div style="color:white;font-size:16px;font-weight:600;">${profile.name}</div>
                        <div style="color:var(--text-secondary);font-size:13px;">${profile.email}</div>
                        <div style="margin-top:4px;"><span style="background:rgba(88,166,255,0.15);color:var(--primary-color);padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">${profile.role.toUpperCase()}</span>${profile.community_name ? ` <span style="color:var(--text-secondary);font-size:12px;">• ${profile.community_name}</span>` : ''}</div>
                    </div>
                </div>
                ${!App.user?.is_superadmin ? `
                <div id="profile-edit-form">
                    <div style="margin-bottom:12px;">
                        <label style="display:block;color:var(--text-secondary);font-size:12px;margin-bottom:6px;">Display Name</label>
                        <input id="prof-name" value="${profile.name}" style="width:100%;padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:13px;box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="display:block;color:var(--text-secondary);font-size:12px;margin-bottom:6px;">Current Password <span style="color:var(--text-secondary);font-size:11px;">(required to change password)</span></label>
                        <input id="prof-curr-pass" type="password" placeholder="Enter current password" style="width:100%;padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:13px;box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:16px;">
                        <label style="display:block;color:var(--text-secondary);font-size:12px;margin-bottom:6px;">New Password <span style="color:var(--text-secondary);font-size:11px;">(leave blank to keep current)</span></label>
                        <input id="prof-new-pass" type="password" placeholder="Min 6 characters" style="width:100%;padding:10px;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:8px;color:white;font-family:inherit;font-size:13px;box-sizing:border-box;">
                    </div>
                    <button class="btn" id="save-profile-btn" onclick="App.saveProfile()"><i class="ph ph-check"></i> Update Profile</button>
                </div>` : '<p style="color:var(--text-secondary);font-size:13px;">Super Admin profile is managed by the system.</p>'}
            `;
        } catch (err) {
            const el = document.getElementById('profile-card');
            if (el) el.innerHTML = `<p style="color:var(--danger-color);">Could not load profile: ${err.message}</p>`;
        }
    },

    async saveProfile() {
        const name = document.getElementById('prof-name')?.value.trim();
        const currPass = document.getElementById('prof-curr-pass')?.value;
        const newPass  = document.getElementById('prof-new-pass')?.value;
        if (!name || name.length < 2) { showToast('Name must be at least 2 characters', 'error'); return; }
        if (newPass && newPass.length < 6) { showToast('New password must be at least 6 characters', 'error'); return; }
        if (newPass && !currPass) { showToast('Enter your current password to set a new one', 'error'); return; }
        const btn = document.getElementById('save-profile-btn');
        btn.disabled = true; btn.innerHTML = '<i class="ph ph-circle-notch" style="animation:spin 1s linear infinite;"></i> Saving…';
        try {
            const updated = await ApiClient.updateProfile(name, currPass || null, newPass || null);
            App.user.name = updated.name;
            App.updateHeader();
            showToast('Profile updated successfully!', 'success');
            App.renderSettings();
        } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.innerHTML = '<i class="ph ph-check"></i> Update Profile'; }
    },

    // ── Notifications ─────────────────────────────────────────
    async updateNotifBadge() {
        try {
            const { count } = await ApiClient.getUnreadCount();
            const badge = document.getElementById('notif-badge');
            if (!badge) return;
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = '';
            } else {
                badge.style.display = 'none';
            }
        } catch { /* silent — badge stays as-is */ }
    },

    async openNotificationsPanel() {
        // Remove any existing panel
        document.getElementById('notif-overlay')?.remove();
        document.getElementById('notif-panel')?.remove();

        // Fetch notifications
        let notifs = [];
        try { notifs = await ApiClient.getNotifications(); } catch { /* empty */ }

        // Build overlay + panel DOM
        const overlay = document.createElement('div');
        overlay.className = 'notif-overlay';
        overlay.id = 'notif-overlay';
        overlay.addEventListener('click', closePanel);
        document.body.appendChild(overlay);

        const panel = document.createElement('div');
        panel.className = 'notif-panel';
        panel.id = 'notif-panel';

        const typeIcon = { poll: 'ph-chart-bar', announcement: 'ph-megaphone', system: 'ph-info' };
        const relTime = ts => {
            const diff = Math.floor((Date.now() - new Date(ts + 'Z').getTime()) / 1000);
            if (diff < 60)  return 'just now';
            if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
            if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
            return new Date(ts).toLocaleDateString();
        };

        const listHTML = notifs.length
            ? notifs.map(n => `
                <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-read="${n.is_read}">
                    <div class="notif-icon ${n.type}">
                        <i class="ph-fill ${typeIcon[n.type] || 'ph-bell'}"></i>
                    </div>
                    <div class="notif-body">
                        <div class="notif-title">${n.title}</div>
                        <div class="notif-msg">${n.message}</div>
                        <div class="notif-time">${relTime(n.created_at)}</div>
                    </div>
                </div>`).join('')
            : `<div class="notif-empty"><i class="ph ph-bell-slash"></i><p>No notifications yet.<br><span style="font-size:13px;">Announcements and new polls will appear here.</span></p></div>`;

        panel.innerHTML = `
            <div class="notif-panel-header">
                <h2><i class="ph ph-bell" style="margin-right:8px;color:var(--primary-color);"></i>Notifications</h2>
                <div style="display:flex;gap:8px;align-items:center;">
                    ${notifs.some(n => !n.is_read)
                        ? `<button class="btn btn-secondary" id="mark-all-btn" style="padding:6px 12px;font-size:12px;">Mark all read</button>`
                        : ''}
                    <button class="icon-btn" id="close-notif-btn" title="Close" style="width:32px;height:32px;font-size:20px;"><i class="ph ph-x"></i></button>
                </div>
            </div>
            <div class="notif-list" id="notif-list-inner">${listHTML}</div>
            <div class="notif-footer" style="font-size:12px;color:var(--text-secondary);text-align:center;">
                ${notifs.length} notification${notifs.length !== 1 ? 's' : ''}
            </div>`;

        document.body.appendChild(panel);

        function closePanel() {
            document.getElementById('notif-overlay')?.remove();
            document.getElementById('notif-panel')?.remove();
        }

        panel.querySelector('#close-notif-btn')?.addEventListener('click', closePanel);

        // Mark all read handler
        panel.querySelector('#mark-all-btn')?.addEventListener('click', async () => {
            try {
                await ApiClient.markAllNotificationsRead();
                // Refresh panel
                closePanel();
                App.openNotificationsPanel();
                App.updateNotifBadge();
            } catch (err) { showToast(err.message, 'error'); }
        });

        // Mark individual as read on click
        panel.querySelector('#notif-list-inner')?.addEventListener('click', async (e) => {
            const item = e.target.closest('.notif-item');
            if (!item) return;
            const id = parseInt(item.dataset.id);
            const wasRead = item.dataset.read === 'true';
            if (!wasRead) {
                item.classList.remove('unread');
                item.dataset.read = 'true';
                item.querySelector('::before');
                try { await ApiClient.markNotificationRead(id); App.updateNotifBadge(); } catch { /* silent */ }
            }
        });

        // Mark all read automatically when panel opens
        if (notifs.some(n => !n.is_read)) {
            setTimeout(async () => {
                try {
                    await ApiClient.markAllNotificationsRead();
                    App.updateNotifBadge();
                    // Update items visually
                    panel.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
                    panel.querySelector('#mark-all-btn')?.remove();
                } catch { /* silent */ }
            }, 800);
        }
    },

};


// Add spin keyframe
const style = document.createElement('style');
style.textContent = '@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}';
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', () => App.init());
