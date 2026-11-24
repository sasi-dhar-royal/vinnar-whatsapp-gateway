const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');

let waSocket = null;
let currentQRDataUrl = null;
let connectionStatus = 'DISCONNECTED'; // 'DISCONNECTED' | 'SCAN_QR' | 'CONNECTING' | 'CONNECTED'
let reconnectAttempts = 0;

// Initialize Baileys Session
async function initWhatsAppSession() {
    try {
        if (!fs.existsSync(AUTH_DIR)) {
            fs.mkdirSync(AUTH_DIR, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

        connectionStatus = 'CONNECTING';

        waSocket = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: pino({ level: 'silent' }),
            browser: ['Vinnar Portal', 'Chrome', '1.0.0']
        });

        waSocket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                try {
                    currentQRDataUrl = await QRCode.toDataURL(qr);
                    connectionStatus = 'SCAN_QR';
                    console.log('⚡ WhatsApp QR Code refreshed. Ready to scan.');
                } catch (e) {
                    console.error('Failed to generate QR data URL', e);
                }
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                connectionStatus = 'DISCONNECTED';
                currentQRDataUrl = null;
                console.log('WhatsApp connection closed. Should reconnect:', shouldReconnect);

                if (shouldReconnect && reconnectAttempts < 10) {
                    reconnectAttempts++;
                    setTimeout(() => initWhatsAppSession(), 4000);
                } else if (!shouldReconnect) {
                    try {
                        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                    } catch (err) {}
                    reconnectAttempts = 0;
                }
            } else if (connection === 'open') {
                connectionStatus = 'CONNECTED';
                currentQRDataUrl = null;
                reconnectAttempts = 0;
                console.log('✅ WhatsApp Gateway is CONNECTED and READY for 1-Click bulk messages!');
            }
        });

        waSocket.ev.on('creds.update', saveCreds);

    } catch (err) {
        console.error('Error starting WhatsApp gateway:', err);
        connectionStatus = 'DISCONNECTED';
    }
}

// Format Phone Number to International WhatsApp JID
function formatJid(rawPhone) {
    let phone = String(rawPhone).replace(/\D/g, '');
    if (phone.length === 10) {
        phone = '91' + phone;
    }
    if (!phone.startsWith('91')) {
        phone = '91' + phone;
    }
    return `${phone}@s.whatsapp.net`;
}

// Endpoints
app.get('/', (req, res) => {
    res.send(`
    <html>
      <head><title>Vinnar WhatsApp Gateway Microservice</title></head>
      <body style="font-family: system-ui, sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #f8fafc;">
        <h1 style="color: #25D366;">⚡ Vinnar WhatsApp Microservice Gateway</h1>
        <p>Status: <strong style="color: ${connectionStatus === 'CONNECTED' ? '#22c55e' : '#f59e0b'};">${connectionStatus}</strong></p>
        <p>This service provides persistent 24/7 WhatsApp Web connection for Vinnar Portal bulk sending.</p>
        ${currentQRDataUrl ? `<div style="margin: 20px;"><img src="${currentQRDataUrl}" style="border: 4px solid #fff; border-radius: 12px; max-width: 280px;"/><p>Scan with WhatsApp > Linked Devices</p></div>` : ''}
      </body>
    </html>
    `);
});

// Get status & QR code
app.get('/api/status', (req, res) => {
    res.json({
        status: connectionStatus,
        qr: currentQRDataUrl
    });
});

// Trigger connection / re-generate QR code
app.post('/api/connect', async (req, res) => {
    try {
        await initWhatsAppSession();
        res.json({
            status: connectionStatus,
            qr: currentQRDataUrl,
            message: 'Session initialization triggered'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Logout / Reset session
app.post('/api/disconnect', async (req, res) => {
    try {
        if (waSocket) {
            await waSocket.logout().catch(() => {});
        }
        waSocket = null;
        connectionStatus = 'DISCONNECTED';
        currentQRDataUrl = null;
        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
        setTimeout(() => initWhatsAppSession(), 1000);
        res.json({ success: true, message: 'Disconnected and reset WhatsApp session' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Send Single Message
app.post('/api/send-message', async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) {
        return res.status(400).json({ error: 'Phone and message are required' });
    }

    if (connectionStatus !== 'CONNECTED' || !waSocket) {
        return res.status(400).json({ error: 'WhatsApp is not connected. Please scan the QR code first.' });
    }

    try {
        const jid = formatJid(phone);
        const result = await waSocket.sendMessage(jid, { text: message });
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Bulk Send Messages (with safe anti-spam delay)
app.post('/api/send-bulk', async (req, res) => {
    const { messages } = req.body; // Array of { phone, message, studentName }
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array is required' });
    }

    if (connectionStatus !== 'CONNECTED' || !waSocket) {
        return res.status(400).json({ error: 'WhatsApp is not connected. Please scan the QR code first.' });
    }

    const results = [];

    for (const item of messages) {
        const { phone, message, studentName } = item;
        if (!phone || !message) {
            results.push({ studentName, phone, status: 'SKIPPED', error: 'Missing phone or message' });
            continue;
        }

        try {
            const jid = formatJid(phone);
            await waSocket.sendMessage(jid, { text: message });
            results.push({ studentName, phone, status: 'SENT' });
        } catch (err) {
            results.push({ studentName, phone, status: 'FAILED', error: err.message });
        }

        // 1.5s - 2.5s jitter delay between sends
        await new Promise(r => setTimeout(r, 1800));
    }

    const sentCount = results.filter(r => r.status === 'SENT').length;
    res.json({
        success: true,
        summary: `Dispatched ${sentCount} of ${messages.length} messages.`,
        results
    });
});

// Start Server & Auto-init Baileys
app.listen(PORT, () => {
    console.log(`WhatsApp Gateway Microservice running on port ${PORT}`);
    initWhatsAppSession();
});

