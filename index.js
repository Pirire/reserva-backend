require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// MongoDB
const client = new MongoClient(process.env.MONGODB_URI);
let reservasCollection;

app.use(cors({ origin: '*' })); // Ajuste o frontend se quiser restringir
app.use(express.json());

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

// Criar sessão de pagamento e salvar reserva
app.post('/', async (req, res) => {
  const { valor, nome, partida, destino, data, codigo } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `Viagem de ${partida} até ${destino}` },
          unit_amount: Math.round(parseFloat(valor) * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}?canceled=true`,
      metadata: { nome, partida, destino, data, codigo },
    });

    await reservasCollection.insertOne({ valor, nome, partida, destino, data, codigo, pago: false });

    // Enviar email de notificação
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: 'realmetropoli@gmail.com',
      subject: 'Nova Reserva de Viagem',
      text: `Nova reserva criada!\n\nNome: ${nome}\nPartida: ${partida}\nDestino: ${destino}\nData: ${data}\nValor: ${valor} €\nCódigo: ${codigo}`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Cancelar reserva
app.delete('/cancelar/:codigo', async (req, res) => {
  const { codigo } = req.params;
  try {
    const resultado = await reservasCollection.deleteOne({ codigo });
    if (resultado.deletedCount === 0) return res.status(404).json({ error: 'Reserva não encontrada' });
    res.json({ mensagem: 'Reserva cancelada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao tentar cancelar a reserva' });
  }
});

// Rota para consultar reservas
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
