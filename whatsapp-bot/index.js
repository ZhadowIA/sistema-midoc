require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const APP_WEBHOOK_URL = process.env.APP_WEBHOOK_URL || 'http://localhost:3000/api/internal/whatsapp/incoming';
const APP_WEBHOOK_SECRET =
  process.env.APP_WEBHOOK_SECRET ||
  process.env.WHATSAPP_WEBHOOK_SECRET ||
  'MiDoc_local_webhook_secret';

app.use(cors());
app.use(express.json());

// Main map keeping track of instantiated doctors
const clients = {};
// State map tracking status of each doctor
const statuses = {};
// QR codes waiting to be scanned
const qrs = {};

const postIncomingMessageToApp = async ({ doctorId, message }) => {
  try {
    const response = await fetch(APP_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-whatsapp-secret': APP_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        doctorId,
        from: message.from,
        message: message.body || '',
        messageId: message.id?._serialized || message.id?.id || undefined,
        timestamp: message.timestamp || undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn(
        `[!] Webhook app devolvió ${response.status} para doctor ${doctorId}: ${errorText || 'sin detalle'}`
      );
      return null;
    }

    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload.replyMessage !== 'string' || !payload.replyMessage.trim()) {
      return null;
    }

    return payload.replyMessage.trim();
  } catch (error) {
    console.error(`[X] Error enviando mensaje entrante al app backend para doctor ${doctorId}:`, error);
    return null;
  }
};

// When server starts or a new doctor requests a session
const initializeClient = (doctorId) => {
  if (clients[doctorId]) return; // Already exists

  console.log(`[+] Inicializando cliente WhatsApp para el Doctor: ${doctorId}`);
  statuses[doctorId] = 'initializing';

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: doctorId }),
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: {
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', (qr) => {
    console.log(`[!] QR Generado para Doctor: ${doctorId}. Esperando escaneo...`);
    statuses[doctorId] = 'qr_ready';
    qrs[doctorId] = qr;
  });

  client.on('ready', () => {
    console.log(`[✓] WhatsApp Listo y conectado para Doctor: ${doctorId}`);
    statuses[doctorId] = 'connected';
    qrs[doctorId] = null; // Clear QR
  });

  client.on('authenticated', () => {
    console.log(`[✓] Sesion autenticada para Doctor: ${doctorId}`);
  });

  client.on('auth_failure', msg => {
    console.error(`[X] Falla de autenticacion para Doctor: ${doctorId}`, msg);
    statuses[doctorId] = 'auth_failure';
  });

  client.on('disconnected', (reason) => {
    console.log(`[-] Cliente desconectado para Doctor: ${doctorId}`, reason);
    statuses[doctorId] = 'disconnected';
    delete clients[doctorId];
  });

  client.on('message', async (message) => {
    try {
      if (message.fromMe) return;
      if (!message.from || message.from.endsWith('@g.us') || message.from === 'status@broadcast') return;
      if (!message.body || !message.body.trim()) return;

      const replyMessage = await postIncomingMessageToApp({ doctorId, message });
      if (!replyMessage) return;

      await client.sendMessage(message.from, replyMessage);
    } catch (error) {
      console.error(`[X] Error procesando mensaje entrante para doctor ${doctorId}:`, error);
    }
  });

  client.initialize();
  clients[doctorId] = client;
};

// Autoload existing sessions on start
const wpFolderPath = path.join(__dirname, '.wwebjs_auth');
if (fs.existsSync(wpFolderPath)) {
  const sessions = fs.readdirSync(wpFolderPath).filter(f => f.startsWith('session-'));
  sessions.forEach(sessionFolder => {
    const doctorId = sessionFolder.replace('session-', '');
    console.log(`[*] Autocargando sesion existente: ${doctorId}`);
    initializeClient(doctorId);
  });
}


app.get('/api/whatsapp/status/:doctorId', (req, res) => {
  const { doctorId } = req.params;
  const status = statuses[doctorId] || 'disconnected';
  res.json({ status });
});

app.get('/api/whatsapp/qr/:doctorId', async (req, res) => {
  const { doctorId } = req.params;
  
  if (!clients[doctorId] || statuses[doctorId] === 'disconnected') {
    initializeClient(doctorId);
    return res.json({ status: 'initializing' });
  }

  if (statuses[doctorId] === 'qr_ready' && qrs[doctorId]) {
    try {
      const qrImageBase64 = await qrcode.toDataURL(qrs[doctorId]);
      return res.json({ status: 'qr_ready', qrBase64: qrImageBase64 });
    } catch (err) {
      return res.status(500).json({ error: 'Error generando imagen QR' });
    }
  }

  res.json({ status: statuses[doctorId] });
});

app.post('/api/whatsapp/send', async (req, res) => {
  const { doctorId, to, message } = req.body;

  if (!doctorId || !to || !message) {
    return res.status(400).json({ error: 'Faltan parámetros (doctorId, to, message)' });
  }

  const client = clients[doctorId];
  if (!client || statuses[doctorId] !== 'connected') {
    return res.status(403).json({ error: 'WhatsApp no está conectado para este doctor. Vincula el dispositivo primero.' });
  }

  try {
    // Format number removing everything except digits
    let formattedNumber = to.replace(/\D/g, '');
    
    // Convert 521 -> 52 or add 52 if missing
    if (formattedNumber.length === 13 && formattedNumber.startsWith('521')) {
      formattedNumber = '52' + formattedNumber.substring(3);
    } else if (formattedNumber.length === 10 && !formattedNumber.startsWith('52')) {
      formattedNumber = '52' + formattedNumber;
    }

    // Usar la librería para que ella encuentre el _serialized (@c.us) correcto con o sin el 1 para números mexicanos.
    const contactId = await client.getNumberId(formattedNumber);
    if (!contactId) {
      return res.status(404).json({ error: 'El número no está registrado o no se pudo resolver en WhatsApp.' });
    }
    const chatId = contactId._serialized;

    const response = await client.sendMessage(chatId, message);
    res.json({ success: true, messageId: response.id.id });
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/whatsapp/logout/:doctorId', async (req, res) => {
    const { doctorId } = req.params;
    const client = clients[doctorId];
    
    if (client) {
      try {
        await client.logout();
        delete clients[doctorId];
        statuses[doctorId] = 'disconnected';
        qrs[doctorId] = null;
        res.json({ success: true, message: 'Sesión desconectada y cerrada.' });
      } catch (err) {
        res.status(500).json({ error: 'Error al desconectar', details: err.message });
      }
    } else {
        res.json({ success: true, message: 'No había sesión activa' });
    }
});

const server = app.listen(PORT, () => {
  console.log(`[OK] MiDoc WhatsApp Engine corriendo en http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`[X] El puerto ${PORT} ya está en uso. Cierra el proceso anterior y vuelve a intentar.`);
    return;
  }
  console.error('[X] Error levantando servidor Express:', err);
});
