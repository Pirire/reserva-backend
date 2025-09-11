require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function testarMongo() {
  try {
    await client.connect();
    console.log('✅ Conectado ao MongoDB com sucesso!');

    const db = client.db(); // usa o banco definido na URI
    const colecoes = await db.listCollections().toArray();
    console.log('Coleções existentes:', colecoes.map(c => c.name));
    
    await client.close();
  } catch (err) {
    console.error('❌ Erro ao conectar ao MongoDB:', err);
  }
}

testarMongo();
