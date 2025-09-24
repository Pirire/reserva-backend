// ================================
// index.js - Servidor de Reservas
// ================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const nodemailer = require("nodemailer");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

// Serve arquivos estáticos da pasta public
app.use(express.static('public'));

// ================================
// Conexão com o MongoDB
// ================================
if (!process.env.MONGODB_URI) {
  console.error("❌ ERRO: a variável de ambiente MONGODB_URI não está definida!");
  process.exit(1);
}

console.log("Mongo URI encontrada ✔");

const client = new MongoClient(process.env.MONGODB_URI);
let reservasCollection;

async function connectDB() {
  try {
    await client.connect();
    reservasCollection = client.db("reservasDB").collection("reservas");
    console.log("✅ Conectado ao MongoDB!");
  } catch (err) {
    console.error("❌ Erro ao conectar ao MongoDB:", err.message);
    process.exit(1);
  }
}
connectDB();

// ================================
// Configuração do Nodemailer
// ================================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ================================
// Endpoint: criar reserva + enviar e-mail
// ================================
app.post("/reserva", async (req, res) => {
  try {
    const { nome, email, partida, destino, data } = req.body;

    if (!nome || !email || !partida || !destino || !data) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }

    const reserva = { nome, email, partida, destino, data, createdAt: new Date() };
    await reservasCollection.insertOne(reserva);

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Confirmação da Reserva",
      text: `Olá ${nome}, sua reserva de ${partida} para ${destino} em ${data} foi confirmada!`,
    });

    res.status(200).json({ message: "Reserva confirmada e e-mail enviado!" });
  } catch (err) {
    console.error("❌ Erro ao processar reserva:", err);
    res.status(500).json({ error: "Erro ao processar reserva", detalhes: err.message });
  }
});

// ================================
// Endpoint: checkout Stripe
// ================================
app.post("/checkout", async (req, res) => {
  try {
    const { valor, nome, email } = req.body;

    if (!valor || !nome || !email) {
      return res.status(400).json({ error: "Campos obrigatórios faltando para checkout" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: `Reserva de viagem - ${nome}` },
            unit_amount: valor * 100,
          },
          quantity: 1,
        },
      ],
      success_url: process.env.SUCCESS_URL || "http://localhost:4000/sucesso",
      cancel_url: process.env.CANCEL_URL || "http://localhost:4000/cancelado",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("❌ Erro ao criar checkout:", err);
    res.status(500).json({ error: "Erro ao criar checkout", detalhes: err.message });
  }
});

// ================================
// Endpoint: visualizar reservas
// ================================
app.get("/ver-reservas", async (req, res) => {
  try {
    const reservas = await reservasCollection.find().toArray();
    res.status(200).json(reservas);
  } catch (err) {
    console.error("❌ Erro ao buscar reservas:", err);
    res.status(500).json({ error: "Erro ao buscar reservas", detalhes: err.message });
  }
});

// ================================
// Endpoint: teste conexão MongoDB
// ================================
app.get("/teste-mongo", async (req, res) => {
  try {
    const count = await reservasCollection.countDocuments();
    res.status(200).json({ message: `Conexão OK! ${count} reservas encontradas.` });
  } catch (err) {
    console.error("❌ Erro na conexão com o MongoDB:", err);
    res.status(500).json({ error: "Erro na conexão com o MongoDB", detalhes: err.message });
  }
});

// ================================
// Inicializa o servidor
// ================================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
