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

// ================================
// Conexão com o MongoDB
// ================================
const client = new MongoClient(process.env.MONGO_URI);
let reservasCollection;

async function connectDB() {
  try {
    await client.connect();
    const db = client.db("reservaDB");
    reservasCollection = db.collection("reservas");
    console.log("✅ Conectado ao MongoDB!");
  } catch (err) {
    console.error("❌ Erro ao conectar ao MongoDB:", err);
  }
}
connectDB();

// ================================
// Rota de reserva (salva no MongoDB)
// ================================
app.post("/reservar", async (req, res) => {
  try {
    const reserva = req.body;
    await reservasCollection.insertOne(reserva);
    res.status(200).json({ message: "Reserva salva com sucesso!" });
  } catch (err) {
    res.status(500).json({ error: "Erro ao salvar reserva" });
  }
});

// ================================
// Rota de envio de e-mail (Nodemailer)
// ================================
app.post("/reservar-email", async (req, res) => {
  try {
    const { nome, email, partida, destino, data, codigo } = req.body;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Confirmação da Reserva",
      text: `Olá ${nome}, sua reserva de ${partida} para ${destino} em ${data} foi confirmada! Código: ${codigo}`,
    });

    res.status(200).json({ message: "E-mail enviado com sucesso!" });
  } catch (err) {
    res.status(500).json({ error: "Erro ao enviar e-mail" });
  }
});

// ================================
// Rota de pagamento (Stripe Checkout)
// ================================
app.post("/checkout", async (req, res) => {
  try {
    const { valor, nome, email } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Reserva de viagem - ${nome}`,
            },
            unit_amount: valor * 100, // Stripe trabalha em centavos
          },
          quantity: 1,
        },
      ],
      success_url: "http://localhost:4000/sucesso",
      cancel_url: "http://localhost:4000/cancelado",
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar checkout" });
  }
});

// ================================
// Rota para visualizar reservas
// ================================
app.get("/ver-reservas", async (req, res) => {
  try {
    const reservas = await reservasCollection.find().toArray();
    res.status(200).json(reservas);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar reservas" });
  }
});

// ================================
// Inicializa o servidor
// ================================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
