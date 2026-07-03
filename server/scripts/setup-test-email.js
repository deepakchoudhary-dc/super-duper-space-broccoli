const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

async function setupTestEmail() {
  try {
    console.log('Creating test email account...');
    
    // Create a test account with Ethereal Email
    const testAccount = await nodemailer.createTestAccount();
    
    console.log('Test email account created:');
    console.log('Host:', testAccount.smtp.host);
    console.log('Port:', testAccount.smtp.port);
    console.log('Secure:', testAccount.smtp.secure);
    console.log('User:', testAccount.user);
    console.log('Password:', testAccount.pass);
    
    // Update .env file with test credentials
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Replace email configuration
    envContent = envContent.replace(
      /SMTP_HOST=.*/,
      `SMTP_HOST=${testAccount.smtp.host}`
    );
    envContent = envContent.replace(
      /SMTP_PORT=.*/,
      `SMTP_PORT=${testAccount.smtp.port}`
    );
    envContent = envContent.replace(
      /SMTP_USER=.*/,
      `SMTP_USER=${testAccount.user}`
    );
    envContent = envContent.replace(
      /SMTP_PASSWORD=.*/,
      `SMTP_PASSWORD=${testAccount.pass}`
    );
    envContent = envContent.replace(
      /FROM_EMAIL=.*/,
      `FROM_EMAIL=${testAccount.user}`
    );
    
    fs.writeFileSync(envPath, envContent);
    
    console.log('✅ .env file updated with test email credentials');
    console.log('📧 You can preview sent emails at: https://ethereal.email');
    console.log('🔗 Use the test account credentials above to log in and view emails');
    
  } catch (error) {
    console.error('❌ Failed to setup test email:', error.message);
  }
}

setupTestEmail();
