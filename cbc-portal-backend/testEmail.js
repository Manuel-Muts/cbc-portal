import sendEmail from './utils/sendEmail.js'; // adjust path if sendEmail.js is in utils/

(async () => {
  try {
    console.log('Starting SMTP test...');

    await sendEmail({
      to: 'gitongaemmanuel50@gmail.com', // replace with your email
      subject: 'CBC Portal SMTP Test',
      text: 'This is a plain text test email from CBC Portal.',
      html: '<h2>SMTP Test Email</h2><p>This is a test email from CBC Portal.</p>'
    });

    console.log('✅ Test email sent successfully');
  } catch (err) {
    console.error('❌ Test email failed:', err);
  }
})();
