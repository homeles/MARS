import { Router } from 'express';
import crypto from 'crypto';

const router = Router();

// Authentication endpoint
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // Compare with environment variables
  const validUsername = process.env.MARS_ADMIN;
  const validPassword = process.env.MARS_PASSWORD;
  
  // Use constant-time comparison for username and password
  const usernameBuffer = Buffer.from(username || '', 'utf8');
  const validUsernameBuffer = Buffer.from(validUsername || '', 'utf8');
  const passwordBuffer = Buffer.from(password || '', 'utf8');
  const validPasswordBuffer = Buffer.from(validPassword || '', 'utf8');
  
  // Ensure buffers are the same length for timingSafeEqual
  const usernameMatch = (usernameBuffer.length === validUsernameBuffer.length) &&
    crypto.timingSafeEqual(usernameBuffer, validUsernameBuffer);
  const passwordMatch = (passwordBuffer.length === validPasswordBuffer.length) &&
    crypto.timingSafeEqual(passwordBuffer, validPasswordBuffer);
  
  if (usernameMatch && passwordMatch) {
    // In a production app, you would generate a JWT token here
    // For simplicity, we're just returning a success message
    return res.status(200).json({ 
      success: true, 
      message: 'Authentication successful'
    });
  }
  
  return res.status(401).json({ 
    success: false, 
    message: 'Invalid credentials'
  });
});

export default router;
