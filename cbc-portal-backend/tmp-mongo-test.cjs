const mongoose = require('mongoose');

const tests = [
  {
    name: 'single-host directConnection',
    uri: 'mongodb://gitongaemmanuel50_db_user:eYAlzqxeNOKw1joW@ac-vglhpod-shard-00-00.affw4rx.mongodb.net:27017/cbc_portal?directConnection=true&tls=true&authSource=admin&retryWrites=true&w=majority'
  },
  {
    name: 'cluster standard',
    uri: 'mongodb://gitongaemmanuel50_db_user:eYAlzqxeNOKw1joW@ac-vglhpod-shard-00-00.affw4rx.mongodb.net:27017,ac-vglhpod-shard-00-01.affw4rx.mongodb.net:27017,ac-vglhpod-shard-00-02.affw4rx.mongodb.net:27017/cbc_portal?replicaSet=atlas-aoxzww-shard-0&tls=true&authSource=admin&retryWrites=true&w=majority'
  }
];

async function run() {
  for (const test of tests) {
    console.log('\n===', test.name, '===');
    try {
      const conn = await mongoose.createConnection(test.uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      }).asPromise();
      console.log(test.name, 'connected successfully');
      await conn.close();
    } catch (err) {
      console.error(test.name, 'failed:');
      console.error(err);
    }
  }
}

run().then(() => process.exit(0)).catch((err) => {
  console.error('Test script failed', err);
  process.exit(1);
});
