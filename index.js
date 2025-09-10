require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { MongoClient } = require('mongodb');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Conectar ao MongoDB
const client = new MongoClient(process.env.MONGODB_URI);
let reservasCollection;

async function conectarMongo() {
  await client.connect();
  const db = client.db(); // usa o banco definido na URI
  reservasCollection = db.collection('reservas');
  console.log("Conectado ao MongoDB!");
}

conectarMongo().catch(err => {
  console.error("Erro ao conectar ao MongoDB:", err);
  process.exit(1); // encerra se não conectar
});

app.use(cors({
  origin: 'https://pirire.github.io' // seu frontend
}));

app.use(express.json());

// Criar sessão de pagamento e salvar reserva
app.post('/', async (req, res) => {
  const { valor, nome, partida, destino, data } = req.body;

  try {
    // Criar sessão de pagamento Stripe
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

    // Salvar no MongoDB
    await reservasCollection.insertOne({ valor, nome, partida, destino, data, pago: false });

    res.json({ url: session.url });
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
    res.status(500).json({ error: "Não foi possível consultar as reservas." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}?canceled=true`,
      metadata: { nome, partida, destino, data },
    });

    // Salva a reserva localmente
    const reservas = JSON.parse(fs.readFileSync(reservasFile, 'utf8'));
    reservas.push({ valor, nome, partida, destino, data, pago: false });
    fs.writeFileSync(reservasFile, JSON.stringify(reservas, null, 2));

  res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
