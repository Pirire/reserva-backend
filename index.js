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
const mongoURI = process.env.MONGODB_URI || "mongodb+srv://realmetropoli_db_user:985699Silsa@cluster0.jzjfit8.mongodb.net/reservasDB?retryWrites=true&w=majority";
const client = new MongoClient(mongoURI);
let reservasCollection;

async function connectDB() {
  try {
    await client.connect();
    reservasCollection = client.db("reservaDB").collection("reservas");
    console.log("✅ Conectado ao MongoDB!");
  } catch (err) {
    console.error("❌ Erro ao conectar ao MongoDB:", err);
  }
}
connectDB();

// ================================
// Configuração do Nodemailer
// ================================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ================================
// Rotas
// ================================

// Rota de reserva + envio de email
app.post("/reserva", async (req, res) => {
  try {
    const { nome, email, partida, destino, data } = req.body;

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
    console.error(err);
    res.status(500).json({ error: "Erro ao processar reserva" });
  }
});

// Rota de checkout Stripe
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
    console.error(err);
    res.status(500).json({ error: "Erro ao criar checkout" });
  }
});

// Rota para visualizar reservas
app.get("/ver-reservas", async (req, res) => {
  try {
    const reservas = await reservasCollection.find().toArray();
    res.status(200).json(reservas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar reservas" });
  }
});

// Rota de teste de conexão com MongoDB
app.get("/teste-mongo", async (req, res) => {
  try {
    const count = await reservasCollection.countDocuments();
    res.status(200).json({ message: `Conexão OK! ${count} reservas encontradas.` });
  } catch (err) {
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
