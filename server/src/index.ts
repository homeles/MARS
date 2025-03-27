import express from 'express';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { typeDefs } from './schema/typeDefs';
import { resolvers } from './schema/resolvers';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

type LogLevel = 'info' | 'error' | 'debug';

// Configure logging
const logger = {
  info: (...args: any[]) => {
    if (process.env.NODE_ENV !== 'test') {
      console.log(new Date().toISOString(), '[INFO]', ...args);
    }
  },
  error: (...args: any[]) => {
    console.error(new Date().toISOString(), '[ERROR]', ...args);
  },
  debug: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development' && process.env.DEBUG === 'true') {
      console.debug(new Date().toISOString(), '[DEBUG]', ...args);
    }
  }
} as const;

async function startServer() {
  const app = express();
  const port = process.env.PORT || 4000;

  // Connect to MongoDB
  const mongoUri = process.env.MONGO_URI || 'mongodb://mongo:27017/github-migrations';
  try {
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }

  // Create Apollo Server with minimal logging
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    formatError: (error) => {
      logger.error('GraphQL Error:', error.message);
      return error;
    },
  });

  await server.start();
  logger.info('Apollo Server started');

  app.use(cors());
  app.use(express.json());

  // Apply Apollo Server middleware with minimal context logging
  app.use('/graphql', expressMiddleware(server, {
    context: async ({ req }) => {
      const token = req.headers.authorization || '';
      return { token };
    },
  }));

  app.listen(port, () => {
    logger.info(`Server ready at http://localhost:${port}/graphql`);
  });
}

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
});