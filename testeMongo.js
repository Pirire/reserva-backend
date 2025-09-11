require('dotenv').config();
const { MongoClient } = require('mongodb');

async function testarMongo() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    console.log("✅ Conectado ao MongoDB!");

    const db = client.db(); // usa o banco definido na URI
    const colecao = db.collection('reservas');

    // Verifica se a coleção já existe
    const collections = await db.listCollections({ name: 'reservas' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('reservas');
      console.log("📂 Coleção 'reservas' criada!");
    } else {
      console.log("📂 Coleção 'reservas' já existe.");
    }

    // Mostra os documentos atuais da coleção
    const documentos = await colecao.find().toArray();
    console.log("📄 Documentos atuais na coleção 'reservas':", documentos);

  } catch (err) {
    console.error("❌ Erro ao conectar ou acessar o MongoDB:", err);
  } finally {
    await client.close();
    console.log("🔒 Conexão fechada.");
  }
}

testarMongo();

