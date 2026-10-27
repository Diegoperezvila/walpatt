const { MongoClient } = require('mongodb');

const cache = globalThis.__pokelistMongo || (globalThis.__pokelistMongo = {});

async function getDatabase() {
  if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI');
  if (!cache.clientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    cache.clientPromise = client.connect().catch((error) => {
      cache.clientPromise = null;
      throw error;
    });
  }
  const client = await cache.clientPromise;
  return client.db('pokelist');
}

module.exports = { getDatabase };
