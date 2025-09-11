require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// MongoDB
const client = new MongoClient(process.env.MONGODB_URI);
let reservasCollection;

app.use(cors({
  origin: 'https://pirire.github.io'
}));
app.use(express.json());

// Criar sessão de pagamento e salvar reserva no MongoDB
app.post('/', async (req, res) => {
  const { valor, nome, partida, destino, data } = req.body;
  const codigoReserva = uuidv4().split('-')[0]; // Código curto para reserva

  try {
    // Criar sessão Stripe
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
      metadata: { nome, partida, destino, data, codigoReserva },
    });

    // Salvar reserva no MongoDB
    await reservasCollection.insertOne({ valor, nome, partida, destino, data, pago: false, codigo: codigoReserva });

    res.json({ url: session.url, codigoReserva });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
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

// Rota de teste rápida para criar reserva
app.get("/teste-criar", async (req, res) => {
  try {
    const novaReserva = {
      nome: "Cliente Teste",
      email: "teste@example.com",
      data: new Date().toISOString(),
      codigo: uuidv4().split('-')[0]
    };

    const resultado = await reservasCollection.insertOne(novaReserva);
    res.json({ mensagem: "Reserva de teste criada!", id: resultado.insertedId, codigo: novaReserva.codigo });
  } catch (err) {
    console.error("Erro ao criar reserva de teste:", err);
    res.status(500).json({ error: "Erro ao criar reserva de teste" });
  }
});

// Rota para cancelar reserva pelo código
app.delete("/cancelar/:codigo", async (req, res) => {
  const codigo = req.params.codigo;

  try {
    const resultado = await reservasCollection.deleteOne({ codigo });
    if (resultado.deletedCount === 0) {
      return res.status(404).json({ error: "Código de reserva não encontrado." });
    }
    res.json({ mensagem: "Reserva cancelada com sucesso!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao tentar cancelar a reserva." });
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
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Falha ao conectar ao MongoDB:", err);
    process.exit(1);
  }
}

startServer();
