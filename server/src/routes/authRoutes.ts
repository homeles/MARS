import { Router } from 'express';

const router = Router();

// Authentication endpoint
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // Compare with environment variables
  const validUsername = process.env.MARS_ADMIN;
  const validPassword = process.env.MARS_PASSWORD;
  
  if (username === validUsername && password === validPassword) {
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
