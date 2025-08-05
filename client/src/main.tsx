import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { 
  ApolloClient, 
  InMemoryCache, 
  ApolloProvider, 
  split, 
  HttpLink 
} from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { setContext } from '@apollo/client/link/context';
import { ThemeProvider } from './utils/ThemeContext';
import { AuthProvider } from './utils/AuthContext';
import App from './App';
import './index.css';

// Create an HTTP link
const httpLink = new HttpLink({
  uri: 'http://localhost:4000/graphql'
});

// Create a WebSocket link
const wsLink = new GraphQLWsLink(createClient({
  url: 'ws://localhost:4000/graphql',
  connectionParams: {
    authToken: import.meta.env.VITE_GITHUB_TOKEN
  },
  retryAttempts: 5,
  retryWait: (retries) => new Promise((resolve) => setTimeout(resolve, retries * 1000)),
  shouldRetry: () => true,
  onNonLazyError: (error) => {
    console.error('WebSocket error:', error);
  }
}));

// Add authentication to Apollo Client requests
const authLink = setContext((_, { headers }) => {
  const token = import.meta.env.VITE_GITHUB_TOKEN;
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    }
  };
});

// Split links for subscription support
const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  authLink.concat(httpLink)
);

// Create Apollo Client with subscription support
const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          allMigrations: {
            keyArgs: ['state', 'enterpriseName', 'organizationName', 'search', 'orderBy'],
            merge: false
          }
        }
      }
    }
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'network-only'
    },
    query: {
      fetchPolicy: 'network-only'
    }
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ApolloProvider client={client}>
        <ThemeProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ThemeProvider>
      </ApolloProvider>
    </BrowserRouter>
  </React.StrictMode>
);