import 'dotenv/config';
console.log('NODE_ENV=', process.env.NODE_ENV);
console.log('MONGO_ATLAS=', process.env.MONGO_ATLAS);
console.log('MONGO_LOCAL=', process.env.MONGO_LOCAL);
console.log('MONGO_ATLAS.includes(mongodb+srv)=', process.env.MONGO_ATLAS?.includes('mongodb+srv'));
