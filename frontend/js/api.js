const API_BASE = '/api';

class ApiClient {
    static getToken() { return localStorage.getItem('gcms_token'); }
    static setToken(token) {
        if (token) localStorage.setItem('gcms_token', token);
        else localStorage.removeItem('gcms_token');
    }

    static async request(endpoint, options = {}) {
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...options.headers
        };
        const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: 'Request failed' }));
            throw new Error(err.detail || 'API Request Failed');
        }
        return response.json();
    }

    static async login(username, password, communityId = null) {
        // Build multi-community username syntax if communityId is selected
        const loginUsername = communityId ? `${username}|${communityId}` : username;
        const formData = new URLSearchParams();
        formData.append('username', loginUsername);
        formData.append('password', password);
        const response = await fetch(`${API_BASE}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });
        if (!response.ok) { const e = await response.json(); throw new Error(e.detail || 'Login failed'); }
        const data = await response.json();
        this.setToken(data.access_token);
        return data;
    }

    static async getPublicCommunities() {
        const response = await fetch(`${API_BASE}/public/communities`);
        if (!response.ok) { const e = await response.json(); throw new Error(e.detail || 'Failed to fetch communities'); }
        return response.json();
    }

    static async getMe() { return this.request('/me'); }

    // Profile
    static async getProfile() { return this.request('/profile'); }
    static async updateProfile(name, currentPassword, newPassword) {
        return this.request('/profile', {
            method: 'PUT',
            body: JSON.stringify({ name, current_password: currentPassword || null, new_password: newPassword || null })
        });
    }

    // Communities
    static async registerSuperAdmin(email, password) {
        return this.request('/superadmin/register', { method: 'POST', body: JSON.stringify({ email, password }) });
    }
    static async createCommunity(name, address) {
        return this.request('/communities/', { method: 'POST', body: JSON.stringify({ name, address }) });
    }
    static async getCommunities() { return this.request('/communities/'); }
    static async getCommunityMembers(communityId) { return this.request(`/communities/${communityId}/members`); }
    static async deleteCommunity(communityId) { return this.request(`/communities/${communityId}`, { method: 'DELETE' }); }

    // Users
    static async registerUser(community_id, email, name, password, role = 'resident') {
        return this.request(`/users/?community_id=${community_id}`, {
            method: 'POST', body: JSON.stringify({ email, name, password, role })
        });
    }
    static async getUsers() { return this.request('/users/'); }

    // Messages
    static async getMessages(channel = 'general') { return this.request(`/messages/?channel=${channel}`); }
    static async createMessage(content, channel = 'general') {
        return this.request('/messages/', { method: 'POST', body: JSON.stringify({ content, channel }) });
    }

    // Polls
    static async getPolls() { return this.request('/polls/'); }
    static async createPoll(question, options) {
        return this.request('/polls/', { method: 'POST', body: JSON.stringify({ question, options }) });
    }
    static async votePoll(pollId, optionId) {
        return this.request(`/polls/${pollId}/vote?option_id=${optionId}`, { method: 'POST' });
    }

    // Properties
    static async getProperties() { return this.request('/properties/'); }
    static async createProperty(title, description, price, status) {
        return this.request('/properties/', { method: 'POST', body: JSON.stringify({ title, description, price, status }) });
    }

    // Notifications
    static async getNotifications() { return this.request('/notifications/'); }
    static async getUnreadCount() { return this.request('/notifications/unread-count'); }
    static async markNotificationRead(id) { return this.request(`/notifications/${id}/read`, { method: 'PUT' }); }
    static async markAllNotificationsRead() { return this.request('/notifications/read-all', { method: 'PUT' }); }

    // Deletes
    static async deleteMessage(id) { return this.request(`/messages/${id}`, { method: 'DELETE' }); }
    static async deletePoll(id) { return this.request(`/polls/${id}`, { method: 'DELETE' }); }

    // Gallery
    static async getGalleryImages() { return this.request('/gallery/'); }
    static async addGalleryImage(src, label) {
        return this.request('/gallery/', { method: 'POST', body: JSON.stringify({ src, label }) });
    }
    static async deleteGalleryImage(id) { return this.request(`/gallery/${id}`, { method: 'DELETE' }); }

    // Super Admin user mgmt
    static async superAdminChangeUserPassword(userId, newPassword) {
        return this.request('/superadmin/users/password', {
            method: 'PUT', body: JSON.stringify({ user_id: userId, new_password: newPassword })
        });
    }

    // Maintenance Bills
    static async getMaintenanceBills() { return this.request('/maintenance/bills/'); }
    static async getMyBills() { return this.request('/maintenance/my-bills/'); }
    static async createMaintenanceBills(residentIds, billingPeriod, amount, description, dueDate) {
        return this.request('/maintenance/bills/', {
            method: 'POST',
            body: JSON.stringify({
                resident_ids: residentIds,
                billing_period: billingPeriod,
                amount: parseFloat(amount),
                description: description || null,
                due_date: dueDate
            })
        });
    }
    static async markBillPaid(billId) {
        return this.request(`/maintenance/bills/${billId}/pay`, { method: 'PUT' });
    }
    static async deleteMaintenanceBill(billId) {
        return this.request(`/maintenance/bills/${billId}`, { method: 'DELETE' });
    }
}
