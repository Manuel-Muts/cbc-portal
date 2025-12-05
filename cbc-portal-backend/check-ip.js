import https from 'https';

https.get('https://api.ipify.org?format=json', (res) => {
  let data = '';

  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const ip = JSON.parse(data).ip;
    console.log('🌐 Your public IP address is:', ip);
    console.log('➡ Add this IP to MongoDB Atlas IP Access List.');
  });

}).on('error', (err) => {
  console.error('Error fetching IP:', err);
});
