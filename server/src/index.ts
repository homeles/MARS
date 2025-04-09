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
import { PubSub } from 'graphql-subscriptions';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

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
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }

  // Create schema
  const schema = makeExecutableSchema({ typeDefs, resolvers });

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

  // Apply Apollo Server middleware with minimal context logging
  app.use('/graphql', expressMiddleware(server, {
    context: async ({ req }) => {
      const token = req.headers.authorization || '';
      return { token };
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