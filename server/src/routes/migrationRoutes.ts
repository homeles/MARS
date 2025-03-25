import express, { Router, Request, Response } from 'express';
import { RepositoryMigration } from '../models/RepositoryMigration';

const router = Router();

interface SyncBody {
  migration_id: string;
  status: string;
}

// Get all migrations
router.get('/', async (req: Request, res: Response) => {
  try {
    const migrations = await RepositoryMigration.find().sort({ createdAt: -1 });
    res.json(migrations);
  } catch (error) {
    console.error('Error fetching migrations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get migration by ID
router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const migration = await RepositoryMigration.findById(req.params.id);
    if (!migration) {
      res.status(404).json({ error: 'Migration not found' });
      return;
    }
    res.json(migration);
  } catch (error) {
    console.error('Error fetching migration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sync migration status
router.post('/sync', async (req: Request<{}, {}, SyncBody>, res: Response) => {
  try {
    const { migration_id, status } = req.body;
    const migration = await RepositoryMigration.findOneAndUpdate(
      { migration_id },
      { status },
      { new: true }
    );
    if (!migration) {
      res.status(404).json({ error: 'Migration not found' });
      return;
    }
    res.json(migration);
  } catch (error) {
    console.error('Error syncing migration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as migrationRoutes };