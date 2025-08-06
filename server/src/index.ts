import express from 'express';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { createServer } from 'http';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { typeDefs } from './schema/typeDefs';
import { resolvers } from './schema/resolvers';
import { syncHistoryResolvers, userPreferenceResolvers } from './utils/resolverUtils';
import { PubSub } from 'graphql-subscriptions';
import dotenv from 'dotenv';
import { merge } from 'lodash';
import mongoose from 'mongoose';
import { initializeCronJobs } from './utils/cronManager';
import authRoutes from './routes/authRoutes';
import configRoutes from './routes/configRoutes';

dotenv.config();

// Create and export a properly initialized PubSub instance
export const pubsub = new PubSub();

// Export event name constants for consistent use
export const SYNC_PROGRESS_UPDATED = 'SYNC_PROGRESS_UPDATED';
export const SYNC_HISTORY_UPDATED = 'SYNC_HISTORY_UPDATED';

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
};

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const port = process.env.PORT || 4000;

  // Connect to MongoDB
  const mongoUri = process.env.MONGO_URI || 'mongodb://mongo:27017/github-migrations';
  try {
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');
    
    // Initialize cron jobs after MongoDB connection is established
    await initializeCronJobs();
    logger.info('Initialized cron jobs');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }

  // Create schema with proper merging of all resolvers
  // Merge all resolver objects together to ensure subscriptions work correctly
  const mergedResolvers = merge(
    {},
    resolvers,
    { 
      Query: { ...userPreferenceResolvers.Query, ...syncHistoryResolvers.Query },
      Mutation: { ...userPreferenceResolvers.Mutation },
      Subscription: { 
        ...syncHistoryResolvers.Subscription,
      }
    }
  );
  
  const schema = makeExecutableSchema({ 
    typeDefs, 
    resolvers: mergedResolvers
  });

  // Set up WebSocket server
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  // WebSocket server cleanup
  const serverCleanup = useServer({ 
    schema,
    onConnect: async (ctx) => {
      console.log('Client connected');
    },
    onDisconnect: () => {
      console.log('Client disconnected');
    },
  }, wsServer);

  // Create Apollo Server with WebSocket support
  const server = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
    formatError: (error) => {
      logger.error('GraphQL Error:', error.message);
      return error;
    },
  });

  await server.start();
  logger.info('Apollo Server started');

  app.use(cors());
  app.use(express.json());

  // Register API routes
  app.use('/api', authRoutes);
  app.use('/api', configRoutes);

  // Apply Apollo Server middleware with minimal context logging
  app.use('/graphql', expressMiddleware(server, {
    context: async ({ req }) => {
      // For APIs that need a token, use the environment variable by default
      // This is safer than relying on client-provided tokens
      let token = process.env.GITHUB_TOKEN || '';
      
      // Only for development/testing where we might need to override with a request header
      if (process.env.NODE_ENV === 'development' && req.headers.authorization) {
        token = req.headers.authorization;
      }
      
      // Validate token before returning context
      if (!token || token.trim() === '') {
        console.warn('No valid GitHub token in environment variables or request headers');
      }
      
      return { 
        token: token.trim() !== '' ? token : '',
        enterpriseName: process.env.GITHUB_ENTERPRISE_NAME || ''
      };
    },
  }));

  // Start server
  httpServer.listen(port, () => {
    logger.info(`Server ready at http://localhost:${port}/graphql`);
    logger.info(`WebSocket server ready at ws://localhost:${port}/graphql`);
  });
}

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
});