require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// MongoDB
const client = new MongoClient(process.env.MONGODB_URI);
let reservasCollection;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Para o webhook do Stripe (precisa do raw body)
app.use("/webhook", bodyParser.raw({ type: "application/json" }));

// Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Reserva SEM pagamento → só admin recebe
 */
app.post("/reservar-email", async (req, res) => {
  const { valor, nome, email, partida, destino, data, codigo } = req.body;

  try {
    await reservasCollection.insertOne({ valor, nome, email, partida, destino, data, codigo, pago: false });

    await transporter.sendMail({
      from: `"Reservas Viagem" <${process.env.SMTP_USER}>`,
      to: process.env.ADMIN_EMAIL, // só admin
      subject: "Nova Reserva (sem pagamento)",
      html: `
        <h2>Nova Reserva Recebida</h2>
        <p><strong>Nome:</strong> ${nome}</p>
        <p><strong>Email informado:</strong> ${email}</p>
        <p><strong>Partida:</strong> ${partida}</p>
        <p><strong>Destino:</strong> ${destino}</p>
        <p><strong>Data:</strong> ${data}</p>
        <p><strong>Valor estimado:</strong> ${valor} €</p>
        <p><strong>Código:</strong> ${codigo}</p>
      `
    });

    res.json({ mensagem: "Reserva registada (sem pagamento). Admin notificado." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar reserva sem pagamento" });
  }
});

/**
 * Reserva COM pagamento → cria sessão Stripe
 */
app.post("/", async (req, res) => {
  const { valor, nome, email, partida, destino, data, codigo } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: `Viagem de ${partida} até ${destino}` },
          unit_amount: Math.round(parseFloat(valor) * 100),
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL}?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}?canceled=true`,
      metadata: { nome, email, partida, destino, data, codigo },
      customer_email: email
    });

    await reservasCollection.insertOne({ valor, nome, email, partida, destino, data, codigo, pago: false });

    // Notificação inicial apenas para admin
    await transporter.sendMail({
      from: `"Reservas Viagem" <${process.env.SMTP_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: "Nova Reserva Criada (aguarda pagamento)",
      text: `Reserva criada. Aguardando pagamento.\n\nNome: ${nome}\nPartida: ${partida}\nDestino: ${destino}\nData: ${data}\nValor: ${valor} €\nCódigo: ${codigo}`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Webhook Stripe → confirma pagamento e envia emails (admin + cliente)
 */
app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("❌ Erro no webhook:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { nome, email, partida, destino, data, codigo } = session.metadata;
    const valor = (session.amount_total / 100).toFixed(2);

    // Atualizar no MongoDB
    await reservasCollection.updateOne({ codigo }, { $set: { pago: true } });

    const conteudo = `
      <h2>Reserva Confirmada e Paga</h2>
      <p><strong>Nome:</strong> ${nome}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Partida:</strong> ${partida}</p>
      <p><strong>Destino:</strong> ${destino}</p>
      <p><strong>Data:</strong> ${data}</p>
      <p><strong>Valor pago:</strong> ${valor} €</p>
      <p><strong>Código:</strong> ${codigo}</p>
    `;

    // Email para cliente
    await transporter.sendMail({
      from: `"Reservas Viagem" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Pagamento Confirmado - Sua Reserva",
      html: conteudo
    });

    // Email para admin
    await transporter.sendMail({
      from: `"Reservas Viagem" <${process.env.SMTP_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `Reserva Paga - ${nome}`,
      html: conteudo
    });

    console.log("✅ E-mails enviados após pagamento confirmado.");
  }

  res.json({ received: true });
});

/**
 * Cancelar reserva
 */
app.delete("/cancelar/:codigo", async (req, res) => {
  const { codigo } = req.params;
  try {
    const resultado = await reservasCollection.deleteOne({ codigo });
    if (resultado.deletedCount === 0) return res.status(404).json({ error: "Reserva não encontrada" });
    res.json({ mensagem: "Reserva cancelada com sucesso" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao tentar cancelar a reserva" });
  }
});

/**
 * Consultar reservas
 */
app.get("/ver-reservas", async (req, res) => {
  try {
    const reservas = await reservasCollection.find().toArray();
    res.json(reservas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Não foi possível consultar as reservas." });
  }
});

// Conectar ao MongoDB e iniciar servidor
async function startServer() {
  try {
    await client.connect();
    const db = client.db();
    reservasCollection = db.collection("reservas");
    console.log("✅ Conectado ao MongoDB!");

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
  } catch (err) {
    console.error("❌ Falha ao conectar ao MongoDB:", err);
    process.exit(1);
  }
}

startServer();
