const { sendEmail, testEmailConfig } = require('../utils/email');

async function testEmail() {
  try {
    console.log('Testing email configuration...');
    
    // Test email config
    const configValid = await testEmailConfig();
    console.log('Email config valid:', configValid);
    
    if (configValid) {
      console.log('Sending test email...');
      
      const result = await sendEmail({
        to: 'test@example.com',
        template: 'email-verification',
        data: {
          firstName: 'Test User',
          verificationUrl: 'http://localhost:3000/verify?token=test123'
        }
      });
      
      console.log('✅ Email sent successfully!');
      console.log('Message ID:', result.messageId);
      console.log('Preview URL:', result.preview);
      
      // Also log the preview URL which we can use to see the email
      if (result.preview) {
        console.log('📧 View the sent email at:', result.preview);
      }
    }
    
  } catch (error) {
    console.error('❌ Email test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testEmail();
