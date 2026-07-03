const nodemailer = require('nodemailer');
const logger = require('./logger');

// Create reusable transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    debug: true, // Enable debug for testing
    logger: true // Enable logging for testing
  });
};

// Email templates
const templates = {
  'email-verification': (data) => ({
    subject: 'Verify your API Guardian account',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2196F3; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { 
            display: inline-block; 
            background: #2196F3; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 4px; 
            margin: 20px 0; 
          }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>API Guardian</h1>
          </div>
          <div class="content">
            <h2>Hello ${data.firstName}!</h2>
            <p>Thank you for registering with API Guardian. Please click the button below to verify your email address:</p>
            <p style="text-align: center;">
              <a href="${data.verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all;">${data.verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create an account with API Guardian, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} API Guardian. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Hello ${data.firstName}!
      
      Thank you for registering with API Guardian. Please visit the following link to verify your email address:
      
      ${data.verificationUrl}
      
      This link will expire in 24 hours.
      
      If you didn't create an account with API Guardian, you can safely ignore this email.
      
      © ${new Date().getFullYear()} API Guardian. All rights reserved.
    `
  }),

  'password-reset': (data) => ({
    subject: 'Reset your API Guardian password',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2196F3; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { 
            display: inline-block; 
            background: #2196F3; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 4px; 
            margin: 20px 0; 
          }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>API Guardian</h1>
          </div>
          <div class="content">
            <h2>Password Reset Request</h2>
            <p>Hello ${data.firstName || 'User'},</p>
            <p>We received a request to reset your password for your API Guardian account.</p>
            <p style="text-align: center;">
              <a href="${data.resetUrl}" class="button">Reset Password</a>
            </p>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all;">${data.resetUrl}</p>
            <div class="warning">
              <strong>Security Notice:</strong>
              <ul>
                <li>This link will expire in 1 hour</li>
                <li>If you didn't request this reset, please ignore this email</li>
                <li>For security, this link can only be used once</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} API Guardian. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Password Reset Request
      
      Hello ${data.firstName || 'User'},
      
      We received a request to reset your password for your API Guardian account.
      
      Please visit the following link to reset your password:
      ${data.resetUrl}
      
      Security Notice:
      - This link will expire in 1 hour
      - If you didn't request this reset, please ignore this email
      - For security, this link can only be used once
      
      © ${new Date().getFullYear()} API Guardian. All rights reserved.
    `
  }),

  'api-key-created': (data) => ({
    subject: 'New API Key Created',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>API Key Created</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2196F3; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .info-box { background: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>API Guardian</h1>
          </div>
          <div class="content">
            <h2>New API Key Created</h2>
            <p>Hello ${data.firstName || 'User'},</p>
            <p>A new API key has been created for your API: <strong>${data.apiName}</strong></p>
            <div class="info-box">
              <strong>Key Details:</strong>
              <ul>
                <li><strong>Name:</strong> ${data.keyName}</li>
                <li><strong>Created:</strong> ${new Date(data.createdAt).toLocaleString()}</li>
                <li><strong>Rate Limit:</strong> ${data.rateLimit} requests per hour</li>
                ${data.expiresAt ? `<li><strong>Expires:</strong> ${new Date(data.expiresAt).toLocaleString()}</li>` : ''}
              </ul>
            </div>
            <p>If you didn't create this API key, please log into your account immediately and review your security settings.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} API Guardian. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      New API Key Created
      
      Hello ${data.firstName || 'User'},
      
      A new API key has been created for your API: ${data.apiName}
      
      Key Details:
      - Name: ${data.keyName}
      - Created: ${new Date(data.createdAt).toLocaleString()}
      - Rate Limit: ${data.rateLimit} requests per hour
      ${data.expiresAt ? `- Expires: ${new Date(data.expiresAt).toLocaleString()}` : ''}
      
      If you didn't create this API key, please log into your account immediately and review your security settings.
      
      © ${new Date().getFullYear()} API Guardian. All rights reserved.
    `
  }),

  'rate-limit-exceeded': (data) => ({
    subject: 'Rate Limit Exceeded Alert',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Rate Limit Alert</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ff9800; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .alert-box { background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Rate Limit Alert</h1>
          </div>
          <div class="content">
            <h2>Rate Limit Exceeded</h2>
            <p>Hello ${data.firstName || 'User'},</p>
            <div class="alert-box">
              <p><strong>One of your API keys has exceeded its rate limit:</strong></p>
              <ul>
                <li><strong>API:</strong> ${data.apiName}</li>
                <li><strong>Key:</strong> ${data.keyName}</li>
                <li><strong>Current Usage:</strong> ${data.currentUsage} requests</li>
                <li><strong>Rate Limit:</strong> ${data.rateLimit} requests per hour</li>
                <li><strong>Time:</strong> ${new Date(data.timestamp).toLocaleString()}</li>
              </ul>
            </div>
            <p>Requests from this key are being temporarily blocked. The rate limit will reset at the next hour boundary.</p>
            <p>Consider upgrading your rate limits or optimizing your API usage patterns.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} API Guardian. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Rate Limit Exceeded Alert
      
      Hello ${data.firstName || 'User'},
      
      One of your API keys has exceeded its rate limit:
      
      - API: ${data.apiName}
      - Key: ${data.keyName}
      - Current Usage: ${data.currentUsage} requests
      - Rate Limit: ${data.rateLimit} requests per hour
      - Time: ${new Date(data.timestamp).toLocaleString()}
      
      Requests from this key are being temporarily blocked. The rate limit will reset at the next hour boundary.
      
      Consider upgrading your rate limits or optimizing your API usage patterns.
      
      © ${new Date().getFullYear()} API Guardian. All rights reserved.
    `
  })
};

// Send email function
const sendEmail = async ({ to, subject, template, data, html, text }) => {
  try {
    if (!to) {
      throw new Error('Recipient email is required');
    }

    let emailContent = {};

    if (template && templates[template]) {
      emailContent = templates[template](data || {});
    } else if (html || text) {
      emailContent = { subject: subject || 'API Guardian Notification', html, text };
    } else {
      throw new Error('Either template or html/text content is required');
    }

    const transporter = createTransporter();

    const mailOptions = {
      from: `${process.env.FROM_NAME || 'API Guardian'} <${process.env.FROM_EMAIL}>`,
      to,
      subject: subject || emailContent.subject,
      html: emailContent.html,
      text: emailContent.text
    };    const result = await transporter.sendMail(mailOptions);
    
    logger.info('Email sent successfully', {
      to,
      subject: mailOptions.subject,
      messageId: result.messageId
    });

    // For Ethereal Email, add preview URL
    if (process.env.SMTP_HOST === 'smtp.ethereal.email') {
      result.preview = nodemailer.getTestMessageUrl(result);
      logger.info('Email preview URL', { preview: result.preview });
    }

    return result;

  } catch (error) {
    logger.error('Failed to send email', {
      to,
      subject,
      template,
      error: error.message
    });
    throw error;
  }
};

// Send bulk emails
const sendBulkEmails = async (emails) => {
  const results = [];
  
  for (const emailData of emails) {
    try {
      const result = await sendEmail(emailData);
      results.push({ success: true, ...result });
    } catch (error) {
      results.push({ 
        success: false, 
        error: error.message, 
        to: emailData.to 
      });
    }
  }
  
  return results;
};

// Test email configuration
const testEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    logger.info('Email configuration is valid');
    return true;
  } catch (error) {
    logger.error('Email configuration test failed:', error);
    return false;
  }
};

module.exports = {
  sendEmail,
  sendBulkEmails,
  testEmailConfig,
  templates
};
