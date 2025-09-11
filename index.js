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

// Configuração de CORS
app.use(cors({
  origin: 'https://pirire.github.io' // seu frontend
}));
app.use(express.json());

// Configuração de e-mail (Gmail + senha de app)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // realmetropoli@gmail.com
    pass: process.env.EMAIL_PASS
  }
});

// Função para gerar código de reserva
function gerarCodigoReserva() {
  return 'RES-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Criar sessão de pagamento e salvar reserva no MongoDB
app.post('/', async (req, res) => {
  const { valor, nome, partida, destino, data } = req.body;
  const codigo = gerarCodigoReserva();

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
      metadata: { nome, partida, destino, data, codigo },
    });

    // Salvar no MongoDB
    await reservasCollection.insertOne({
      valor,
      nome,
      partida,
      destino,
      data,
      codigo,
      pago: false
    });

    // Enviar notificação ao administrador
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "realmetropoli@gmail.com",
      subject: `🚖 Nova reserva criada (${codigo})`,
      text: `Nova reserva recebida:\n\n👤 Nome: ${nome}\n📍 Partida: ${partida}\n🏁 Destino: ${destino}\n📅 Data: ${data}\n💶 Valor: ${valor}€\n🔑 Código: ${codigo}`
    });

    // Enviar confirmação ao cliente (se tiver email válido no campo "nome" ou se preferir adicionar um campo "email" separado)
    if (req.body.email) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: req.body.email,
        subject: `✅ Confirmação da sua reserva (${codigo})`,
        text: `Olá ${nome},\n\nA sua reserva foi criada com sucesso!\n\nDetalhes:\n📍 Partida: ${partida}\n🏁 Destino: ${destino}\n📅 Data: ${data}\n💶 Valor: ${valor}€\n\n🔑 Código da Reserva: ${codigo}\n\nGuarde este código caso queira cancelar.\n\nObrigado por escolher nossos serviços 🚖`
      });
    }

    res.json({ url: session.url, codigoReserva: codigo });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Cancelar reserva pelo código
app.delete('/cancelar/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    const resultado = await reservasCollection.deleteOne({ codigo });

    if (resultado.deletedCount === 0) {
      return res.status(404).json({ error: "Reserva não encontrada." });
    }

    res.json({ mensagem: `Reserva ${codigo} cancelada com sucesso.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao cancelar a reserva." });
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
