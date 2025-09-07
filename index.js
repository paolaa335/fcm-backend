import express from "express";
import cors from "cors";
import admin from "firebase-admin";

const app = express();
app.use(cors());
app.use(express.json());

// Inicializa Firebase Admin con credenciales desde variables de entorno
if (!admin.apps.length) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(creds),
      databaseURL: process.env.FIREBASE_DB_URL
    });
  } else {
    throw new Error("Faltan GOOGLE_APPLICATION_CREDENTIALS_JSON y/o FIREBASE_DB_URL");
  }
}

const db = admin.database();

// API key de seguridad básica
const REQUIRED_API_KEY = process.env.BACKEND_API_KEY || "dev-key-change-me";
app.use((req, res, next) => {
  const key = req.headers["x-api-key"];
  if (!key || key !== REQUIRED_API_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

// Endpoint para probar si corre
app.get("/health", (_, res) => res.json({ ok: true }));

// Endpoint para enviar notificación
app.post("/notifyOrderAccepted", async (req, res) => {
  try {
    const { usuarioUid, articuloPushKey, titulo, cuerpo } = req.body || {};
    if (!usuarioUid || !articuloPushKey) {
      return res.status(400).json({ error: "missing usuarioUid or articuloPushKey" });
    }

    // Busca token del usuario
    const tokenSnap = await db.ref(`Usuario/${usuarioUid}/fcmToken`).get();
    const token = tokenSnap.val();
    if (!token) return res.status(404).json({ error: "user token not found" });

    // Construye mensaje
    const message = {
      token,
      notification: {
        title: titulo || "¡Tu pedido fue aceptado!",
        body: cuerpo || "El comerciante aceptó tu pedido."
      },
      data: {
        type: "ORDER_ACCEPTED",
        articuloPushKey
      }
    };

    // Envía notificación
    const msgId = await admin.messaging().send(message);
    return res.json({ ok: true, messageId: msgId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "internal", detail: e.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("FCM backend listening on", port));
