<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# API Guardian Project Instructions

This is the API Guardian project - a comprehensive API management and security hub for developers.

## Project Structure
- **Backend**: Node.js/Express server with PostgreSQL and Redis
- **Frontend**: React application with Material-UI
- **Security**: JWT authentication, 2FA with TOTP, bcrypt password hashing
- **Features**: API key management, granular permissions, rate limiting, monitoring, proxy functionality

## Key Components
1. **Authentication System**: Secure user registration/login with 2FA support
2. **API Management**: Register APIs, generate/manage keys, set permissions
3. **Proxy Gateway**: Route and validate API requests with rate limiting
4. **Monitoring**: Real-time analytics and usage tracking
5. **Security**: Comprehensive access control and audit logging

## Development Guidelines
- Follow RESTful API design patterns
- Implement proper error handling and validation
- Use environment variables for configuration
- Follow security best practices (HTTPS, input validation, SQL injection prevention)
- Implement comprehensive logging and monitoring
- Use Docker for containerization

## Database Schema
- Users table with authentication details
- APIs table for registered APIs
- API Keys table with permissions and status
- Usage logs for monitoring and analytics
- Audit logs for security tracking

When working on this project, prioritize security, scalability, and user experience.
