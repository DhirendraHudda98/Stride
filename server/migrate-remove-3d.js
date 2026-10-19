require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stride';
    console.log('Connecting to:', uri);
    await mongoose.connect(uri);

    const result = await mongoose.connection.collection('products').updateMany(
      {},
      { $unset: { color: "", sole: "", accent: "" } }
    );

    console.log(`Successfully migrated products. Modified ${result.modifiedCount} products (unset color, sole, accent).`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
})();
