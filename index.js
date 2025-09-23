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
// MongoDB
// ================================
const client = new MongoClient(process.env.MONGODB_URI);
let reservasCollection, motoristasCollection;

async function connectDB() {
  try {
    await client.connect();
    reservasCollection = client.db("reservasDB").collection("reservas");
    motoristasCollection = client.db("reservasDB").collection("motoristas");
    console.log("✅ Conectado ao MongoDB!");
  } catch (err) {
    console.error("❌ Erro ao conectar ao MongoDB:", err.message);
  }
}
connectDB();

// ================================
// Nodemailer
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
// Endpoints: Reservas
// ================================
app.post("/reserva", async (req, res) => {
  try {
    const { nome, email, partida, destino, data } = req.body;
    if (!nome || !email || !partida || !destino || !data)
      return res.status(400).json({ error: "Campos obrigatórios faltando" });

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
// Endpoints: Motoristas
// ================================
app.post("/motorista", async (req, res) => {
  try {
    const { nome, email, telefone, cnh, veiculo, disponibilidade } = req.body;
    if (!nome || !email || !telefone || !cnh || !veiculo || !disponibilidade)
      return res.status(400).json({ error: "Campos obrigatórios faltando" });

    const motorista = { nome, email, telefone, cnh, veiculo, disponibilidade, createdAt: new Date() };
    await motoristasCollection.insertOne(motorista);

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Cadastro de Motorista",
      text: `Olá ${nome}, seu cadastro como motorista foi realizado com sucesso!`,
    });

    res.status(200).json({ message: "Motorista registrado e e-mail enviado!" });
  } catch (err) {
    console.error("❌ Erro ao registrar motorista:", err);
    res.status(500).json({ error: "Erro ao registrar motorista", detalhes: err.message });
  }
});

app.get("/ver-motoristas", async (req, res) => {
  try {
    const motoristas = await motoristasCollection.find().toArray();
    res.status(200).json(motoristas);
  } catch (err) {
    console.error("❌ Erro ao buscar motoristas:", err);
    res.status(500).json({ error: "Erro ao buscar motoristas", detalhes: err.message });
  }
});

// ================================
// Inicializa o servidor
// ================================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
