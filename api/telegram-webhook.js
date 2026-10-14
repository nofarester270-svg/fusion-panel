import admin from "firebase-admin";

const TELEGRAM_API = "https://api.telegram.org";

const ADMIN_TELEGRAM_ID = String(process.env.ADMIN_TELEGRAM_ID || "");

function esAdministrador(chatId) {
  return ADMIN_TELEGRAM_ID !== "" &&
    String(chatId) === ADMIN_TELEGRAM_ID;
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Faltan variables FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY");
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

function db() {
  return getAdminApp().firestore();
}

async function telegram(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN");

  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!result.ok) throw new Error(`Telegram ${method}: ${result.description}`);
  return result.result;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function mainMenu() {
  return {
    inline_keyboard: [
      [
        { text: "💰 Mi saldo", callback_data: "saldo" },
        { text: "🛒 Comprar", callback_data: "comprar" },
      ],
      [{ text: "📋 Mis compras", callback_data: "historial" }],
      [{ text: "🆘 Soporte", callback_data: "soporte" }],
    ],
  };
}

async function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

async function answerCallbackQuery(callbackQueryId, text = "") {
  return telegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

async function findSeller(chatId) {
  const snap = await db()
    .collection("vendedores")
    .where("telegramId", "==", String(chatId))
    .limit(1)
    .get();

  if (snap.empty) return null;
  return { id: snap.docs[0].id, ref: snap.docs[0].ref, ...snap.docs[0].data() };
}

async function requireSeller(chatId) {
  const seller = await findSeller(chatId);
  if (seller) return seller;

  await sendMessage(
    chatId,
    `🔒 <b>Tu Telegram aún no está vinculado.</b>\n\nEnvía este código al administrador para que te registre:\n<code>${chatId}</code>`
  );
  return null;
}

async function showStart(chatId, firstName = "") {
  const seller = await findSeller(chatId);

  if (!seller) {
    await sendMessage(
      chatId,
      `👋 Hola${firstName ? `, ${firstName}` : ""}. Bienvenido a <b>Fusion Cuentas</b>.\n\nPara activar tu acceso, envía este código al administrador:\n<code>${chatId}</code>`
    );
    return;
  }

  await sendMessage(
    chatId,
    `👋 Bienvenido, <b>${escapeHtml(seller.nombre || seller.usuario || "vendedor")}</b>.\n\nSelecciona una opción:`,
    { reply_markup: mainMenu() }
  );
}

async function showBalance(chatId) {
  const seller = await requireSeller(chatId);
  if (!seller) return;

  await sendMessage(
    chatId,
    `💰 <b>Saldo disponible:</b> ${Number(seller.saldo || 0).toFixed(2)} créditos`,
    { reply_markup: mainMenu() }
  );
}

async function showPlatforms(chatId) {
  const seller = await requireSeller(chatId);
  if (!seller) return;

  const snap = await db().collection("plataformas").get();
  const platforms = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => Number(p.stock || 0) > 0)
    .sort((a, b) => String(a.nombre || a.id).localeCompare(String(b.nombre || b.id)));

  if (!platforms.length) {
    await sendMessage(chatId, "📦 No hay stock disponible en este momento.", {
      reply_markup: mainMenu(),
    });
    return;
  }

  const rows = platforms.map((p) => [
    {
      text: `${p.nombre || p.id} · ${Number(p.precio || 0)} créditos`,
      callback_data: `plataforma:${p.id}`,
    },
  ]);
  rows.push([{ text: "⬅️ Menú", callback_data: "menu" }]);

  await sendMessage(chatId, "🛒 <b>Selecciona una plataforma:</b>", {
    reply_markup: { inline_keyboard: rows },
  });
}

async function showPlatform(chatId, platformId) {
  const seller = await requireSeller(chatId);
  if (!seller) return;

  const ref = db().collection("plataformas").doc(platformId);
  const snap = await ref.get();

  if (!snap.exists) {
    await sendMessage(chatId, "❌ La plataforma ya no existe.");
    return;
  }

  const platform = snap.data();
  await sendMessage(
    chatId,
    `📺 <b>${escapeHtml(platform.nombre || platformId)}</b>\n💳 Precio: <b>${Number(platform.precio || 0)} créditos</b>\n📦 Stock: <b>${Number(platform.stock || 0)}</b>\n💰 Tu saldo: <b>${Number(seller.saldo || 0).toFixed(2)}</b>`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Confirmar compra", callback_data: `confirmar:${platformId}` }],
          [{ text: "⬅️ Volver", callback_data: "comprar" }],
        ],
      },
    }
  );
}

async function purchase(chatId, platformId) {
  const seller = await requireSeller(chatId);
  if (!seller) return;

  const database = db();
  const platformRef = database.collection("plataformas").doc(platformId);
  const available = await platformRef
    .collection("cuentas")
    .where("disponible", "==", true)
    .limit(5)
    .get();

  if (available.empty) {
    await sendMessage(chatId, "❌ No quedan cuentas disponibles para esta plataforma.", {
      reply_markup: mainMenu(),
    });
    return;
  }

  let delivered = null;
  let lastError = null;

  for (const candidate of available.docs) {
    try {
      delivered = await database.runTransaction(async (tx) => {
        const [sellerSnap, platformSnap, accountSnap] = await Promise.all([
          tx.get(seller.ref),
          tx.get(platformRef),
          tx.get(candidate.ref),
        ]);

        if (!sellerSnap.exists) throw new Error("VENDEDOR_NO_EXISTE");
        if (!platformSnap.exists) throw new Error("PLATAFORMA_NO_EXISTE");
        if (!accountSnap.exists || accountSnap.data().disponible !== true) {
          throw new Error("CUENTA_OCUPADA");
        }

        const sellerData = sellerSnap.data();
        const platformData = platformSnap.data();
        const price = Number(platformData.precio || 0);
        const balance = Number(sellerData.saldo || 0);

        if (price <= 0) throw new Error("PRECIO_INVALIDO");
        if (balance < price) throw new Error("SALDO_INSUFICIENTE");

        const newBalance = balance - price;
        const account = accountSnap.data();
        const saleRef = database.collection("ventas").doc();

        tx.update(seller.ref, { saldo: newBalance });
        tx.update(candidate.ref, {
          disponible: false,
          vendidoA: sellerData.nombre || sellerData.usuario || seller.ref.id,
          vendidoTelegramId: String(chatId),
          vendidoFecha: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.update(platformRef, {
          stock: Math.max(0, Number(platformData.stock || 0) - 1),
        });
        tx.set(saleRef, {
          vendedor: sellerData.nombre || sellerData.usuario || seller.ref.id,
          vendedorId: seller.ref.id,
          telegramId: String(chatId),
          plataforma: platformData.nombre || platformId,
          plataformaId: platformId,
          precio: price,
          correo: account.correo || "",
          contraseña: account.contraseña || "",
          perfil: account.perfil || "",
          pin: account.pin || "",
          fecha: admin.firestore.FieldValue.serverTimestamp(),
          canal: "telegram",
        });

        return {
          platformName: platformData.nombre || platformId,
          price,
          newBalance,
          account,
        };
      });

      break;
    } catch (error) {
      lastError = error;
      if (error.message !== "CUENTA_OCUPADA") break;
    }
  }

  if (!delivered) {
    const messages = {
      SALDO_INSUFICIENTE: "❌ No tienes créditos suficientes.",
      CUENTA_OCUPADA: "⚠️ Esa cuenta acaba de venderse. Intenta nuevamente.",
      PRECIO_INVALIDO: "⚠️ El precio de la plataforma no está configurado correctamente.",
    };
    await sendMessage(chatId, messages[lastError?.message] || "❌ No se pudo completar la compra.", {
      reply_markup: mainMenu(),
    });
    return;
  }

  const { account, platformName, price, newBalance } = delivered;
  await sendMessage(
    chatId,
    `✅ <b>Compra realizada</b>\n\n📺 Plataforma: <b>${escapeHtml(platformName)}</b>\n💳 Precio: <b>${price} créditos</b>\n\n📧 Correo: <code>${escapeHtml(account.correo || "No aplica")}</code>\n🔑 Contraseña: <code>${escapeHtml(account.contraseña || "No aplica")}</code>\n👤 Perfil: <code>${escapeHtml(account.perfil || "No aplica")}</code>\n🔢 PIN: <code>${escapeHtml(account.pin || "No aplica")}</code>\n\n💰 Saldo restante: <b>${newBalance.toFixed(2)}</b>`,
    { reply_markup: mainMenu() }
  );
}

async function showHistory(chatId) {
  const seller = await requireSeller(chatId);
  if (!seller) return;

  const snap = await db()
    .collection("ventas")
    .where("vendedorId", "==", seller.id)
    .orderBy("fecha", "desc")
    .limit(8)
    .get();

  if (snap.empty) {
    await sendMessage(chatId, "📋 Aún no tienes compras registradas.", {
      reply_markup: mainMenu(),
    });
    return;
  }

  const lines = snap.docs.map((d, index) => {
    const sale = d.data();
    const date = sale.fecha?.toDate?.();
    const dateText = date
      ? date.toLocaleString("es-PE", { timeZone: "America/Lima" })
      : "Fecha pendiente";
    return `${index + 1}. <b>${escapeHtml(sale.plataforma || "Plataforma")}</b> · ${sale.precio || 0} créditos\n   ${dateText}`;
  });

  await sendMessage(chatId, `📋 <b>Tus últimas compras</b>\n\n${lines.join("\n\n")}`, {
    reply_markup: mainMenu(),
  });
}

async function handleCallback(callback) {
  const chatId = callback.message?.chat?.id;
  if (!chatId) return;

  await answerCallbackQuery(callback.id);
  const data = callback.data || "";

  if (data === "menu") return showStart(chatId, callback.from?.first_name);
  if (data === "saldo") return showBalance(chatId);
  if (data === "comprar") return showPlatforms(chatId);
  if (data === "historial") return showHistory(chatId);
  if (data === "soporte") {
    return sendMessage(chatId, "🆘 Para soporte, comunícate con el administrador de Fusion Cuentas.", {
      reply_markup: mainMenu(),
    });
  }
  if (data.startsWith("plataforma:")) return showPlatform(chatId, data.slice(11));
  if (data.startsWith("confirmar:")) return purchase(chatId, data.slice(10));
}

async function handleMessage(message) {
  const chatId = message.chat?.id;
  if (!chatId) return;

  if (message.text?.trim() === "/admin") {
    if (!esAdministrador(chatId)) {
      return sendMessage(chatId, "🔒 No tienes permisos de administrador.");
    }

    return sendMessage(
      chatId,
      "👑 <b>Panel de administrador - Fusion Cuentas</b>\n\n✅ Tu Telegram ha sido reconocido como administrador.\n\nPróximamente podrás gestionar solicitudes de soporte desde aquí."
    );
  }

  const text = String(message.text || "").trim().toLowerCase();
  if (text === "/start" || text === "menu" || text === "/menu") {
    return showStart(chatId, message.from?.first_name);
  }
  if (text === "saldo" || text === "/saldo") return showBalance(chatId);
  if (text === "comprar" || text === "/comprar") return showPlatforms(chatId);
  if (text === "historial" || text === "/historial") return showHistory(chatId);

  return sendMessage(chatId, "No entendí ese mensaje. Usa el menú:", {
    reply_markup: mainMenu(),
  });
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "fusion-telegram-bot" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const receivedSecret = req.headers["x-telegram-bot-api-secret-token"];
  if (expectedSecret && receivedSecret !== expectedSecret) {
    return res.status(401).json({ ok: false, error: "Webhook no autorizado" });
  }

  try {
    const update = req.body;
    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.message) await handleMessage(update.message);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return res.status(200).json({ ok: true });
  }
}
