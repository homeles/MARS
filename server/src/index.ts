import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { typeDefs } from './schema/typeDefs';
import { resolvers } from './schema/resolvers';
import { migrationRoutes } from './routes/migrationRoutes';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/github-migrations';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Set up Apollo Server
const startServer = async () => {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  await server.start();
  
  // Apply middleware with specific CORS configuration and body parsing
  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        // Get auth token from request headers
        const token = req.headers.authorization || '';
        return { token };
      },
    })
  );

  // API routes
  app.use('/api/migrations', cors(), migrationRoutes);

  // Health check endpoint
  app.get('/api/health', cors(), (_req: Request, res: Response) => {
    res.status(200).json({ status: 'OK', message: 'Server is running' });
  });

  // Start server
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`GraphQL server ready at http://localhost:${PORT}/graphql`);
  });
};

startServer().catch(err => console.error('Error starting server:', err));