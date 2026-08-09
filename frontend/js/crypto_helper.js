/**
 * CryptoHelper — AES-GCM message encryption using the Web Crypto API.
 * Messages are encrypted client-side before sending to the server.
 * The community key is derived from the community_id so all members
 * of the same community can decrypt each other's messages.
 * The server never sees plaintext content.
 */
const CryptoHelper = {
    _keyCache: {},

    async _deriveKey(communityId) {
        if (this._keyCache[communityId]) return this._keyCache[communityId];
        const passphrase = `gcms-community-${communityId}-v1`;
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(passphrase),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        const key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: new TextEncoder().encode('gcms-salt-2026'), iterations: 100000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        this._keyCache[communityId] = key;
        return key;
    },

    async encrypt(text, communityId) {
        try {
            const key = await this._deriveKey(communityId);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encoded = new TextEncoder().encode(text);
            const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
            const ivB64 = btoa(String.fromCharCode(...iv));
            const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
            return `enc:${ivB64}:${ctB64}`;
        } catch (e) {
            console.error('Encryption failed:', e);
            return text;   // fallback: send plaintext
        }
    },

    async decrypt(content, communityId) {
        if (!content || !content.startsWith('enc:')) return content;
        try {
            const parts = content.split(':');
            if (parts.length < 3) return '[encrypted]';
            const ivB64 = parts[1];
            const ctB64 = parts.slice(2).join(':');
            const key = await this._deriveKey(communityId);
            const iv = new Uint8Array(atob(ivB64).split('').map(c => c.charCodeAt(0)));
            const ct = new Uint8Array(atob(ctB64).split('').map(c => c.charCodeAt(0)));
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            return '[could not decrypt message]';
        }
    },

    isEncrypted(content) {
        return content && content.startsWith('enc:');
    }
};
