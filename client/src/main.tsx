import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ApolloClient, InMemoryCache, ApolloProvider, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { ThemeProvider } from './utils/ThemeContext';
import App from './App';
import './index.css';

// Create a HTTP link for Apollo Client
const httpLink = createHttpLink({
  uri: 'http://localhost:4000/graphql',
});

// Add authentication to Apollo Client requests
const authLink = setContext((_, { headers }) => {
  // Get token from environment variable
  const token = import.meta.env.VITE_GITHUB_TOKEN;
  
  // Return the headers to the context
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    }
  };
});

// Create Apollo Client with retries
const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          allMigrations: {
            // Don't merge results, treat each page as separate
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
          <App />
        </ThemeProvider>
      </ApolloProvider>
    </BrowserRouter>
  </React.StrictMode>
);