const mongoose = require('mongoose');

const uri = 'mongodb://gitongaemmanuel50_db_user:eYAlzqxeNOKw1joW@ac-vglhpod-shard-00-00.affw4rx.mongodb.net:27017/cbc_portal?directConnection=true&tls=true&authSource=admin&retryWrites=true&w=majority';

(async () => {
  try {
    const conn = await mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    }).asPromise();
    console.log('connected');
    const admin = conn.db.admin();
    try {
      const hello = await admin.command({ hello: 1 });
      console.log('hello:', hello);
    } catch (e) {
      console.error('hello failed:', e.message);
    }
    try {
      const repl = await admin.command({ replSetGetStatus: 1 });
      console.log('replSetGetStatus:', repl);
    } catch (e) {
      console.error('replSetGetStatus failed:', e.message);
    }
    await conn.close();
  } catch (err) {
    console.error('connect failed:', err);
  }
  process.exit(0);
})();
