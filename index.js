require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const fs = require('fs');
const path = require('path');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const reservasFile = path.join(__dirname, 'reservas.json');

app.use(cors({
  origin: 'https://pirire.github.io'
}));

app.use(express.json());

// Cria o arquivo reservas.json se não existir
if (!fs.existsSync(reservasFile)) {
  fs.writeFileSync(reservasFile, JSON.stringify([]));
}

app.post('/', async (req, res) => {
  const { valor, nome, partida, destino, data } = req.body;

  try {
    // Cria a sessão de pagamento no Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: `Viagem de ${partida} até ${destino}` },
            unit_amount: Math.round(parseFloat(valor) * 100),
          },
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
