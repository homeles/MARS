import { Router } from 'express';

const router = Router();

// GitHub config endpoint - provides a safe way to get GitHub config info
router.get('/github-config', (req, res) => {
  // We only return if a token exists, not the actual token value
  const hasToken = !!process.env.GITHUB_TOKEN;
  const enterpriseName = process.env.GITHUB_ENTERPRISE_NAME || '';

  return res.status(200).json({
    hasToken,
    enterpriseName
  });
});

export default router;
