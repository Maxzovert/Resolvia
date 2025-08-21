// Temporary environment setup for development
// Replace MONGODB_URI with your Atlas connection string

process.env.NODE_ENV = 'development';
process.env.PORT = '5000';
// REPLACE THIS LINE WITH YOUR MONGODB ATLAS CONNECTION STRING:
// process.env.MONGODB_URI = 'mongodb://localhost:27017/resolvia';
// 👇 PASTE YOUR ATLAS CONNECTION STRING HERE (uncomment the line below and add your string):
// process.env.MONGODB_URI = 'mongodb+srv://admin:password123@your-cluster.xxxxx.mongodb.net/resolvia?retryWrites=true&w=majority';

// Temporary fallback for local MongoDB (if you have it installed)
process.env.MONGODB_URI = 'mongodb+srv://admin:admin@resolvia.csaozj4.mongodb.net/?retryWrites=true&w=majority&appName=Resolvia';
process.env.JWT_SECRET = 'dev-secret-key-change-in-production';
process.env.JWT_REFRESH_SECRET = 'dev-refresh-secret-change-in-production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.STUB_MODE = 'true';
process.env.EMAIL_FROM = 'noreply@resolvia.com';
process.env.EMAIL_SERVICE = 'stub';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX_REQUESTS = '100';

console.log('Environment variables set for development');
