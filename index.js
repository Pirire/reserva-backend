require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { MongoClient } = require('mongodb');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

let reservasCollection;

// Conectar ao MongoDB
async function conectarMongo() {
  try {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db(); // O banco definido na URI será usado
    reservasCollection = db.collection('reservas');
    console.log("Conectado ao MongoDB!");
  } catch (err) {
    console.error("Erro ao conectar ao MongoDB:", err);
    process.exit(1); // encerra o app se não conectar
  }
}

conectarMongo();

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// Criar sessão de pagamento e salvar reserva no MongoDB
app.post('/', async (req, res) => {
  const { valor, nome, partida, destino, data } = req.body;

  if (!valor || !nome || !partida || !destino || !data) {
    return res.status(400).json({ error: "Campos obrigatórios faltando." });
  }

  try {
    // Criar sessão de pagamento no Stripe
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
      metadata: { nome, partida, destino, data },
    });

    // Salvar reserva no MongoDB
    await reservasCollection.insertOne({ valor, nome, partida, destino, data, pago: false });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Rota para consultar reservas
app.get('/ver-reservas', async (req, res) => {
  try {
    const reservas = await reservasCollection.find().toArray();
    res.json(reservas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Não foi possível consultar as reservas." });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
