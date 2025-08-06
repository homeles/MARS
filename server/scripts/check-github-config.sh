#!/bin/bash

# Script to check GitHub token validity at container startup

echo "🔍 Checking GitHub configuration..."

# Check if GitHub token is set
if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ ERROR: GITHUB_TOKEN is not set in environment variables"
  echo "   Please set GITHUB_TOKEN in your .env file with a valid GitHub Personal Access Token"
  echo "   The application will not be able to access GitHub API"
else
  echo "✅ GITHUB_TOKEN is configured"
  
  # Verify token format - simple check
  if [[ ! "$GITHUB_TOKEN" =~ ^gh[pus]_[A-Za-z0-9_]+$ ]]; then
    echo "⚠️  WARNING: GITHUB_TOKEN format looks unusual"
    echo "   Token should start with 'ghp_', 'ghu_', or 'ghs_' for personal access tokens"
  fi
  
  # Validate the token by making a simple API call
  echo "🔒 Validating token with GitHub API..."
  response=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    https://api.github.com/user)
  
  if [ "$response" = "200" ]; then
    echo "✅ GITHUB_TOKEN is valid and working"
  else
    echo "❌ ERROR: GITHUB_TOKEN is not valid (HTTP $response)"
    echo "   - If 401: Token is invalid, expired, or revoked"
    echo "   - If 403: Token lacks required permissions"
    echo "   - If 404: Resource not found, check enterprise name"
    echo "   You need to provide a valid token in your .env file"
  fi
fi

# Check if GitHub enterprise name is set
if [ -z "$GITHUB_ENTERPRISE_NAME" ]; then
  echo "⚠️  WARNING: GITHUB_ENTERPRISE_NAME is not set in environment variables"
  echo "   Please set GITHUB_ENTERPRISE_NAME in your .env file"
else
  echo "✅ GITHUB_ENTERPRISE_NAME is configured as: $GITHUB_ENTERPRISE_NAME"
  
  # Validate enterprise name if token is valid
  if [ ! -z "$GITHUB_TOKEN" ] && [ "$response" = "200" ]; then
    echo "🔍 Validating enterprise access..."
    enterprise_response=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github.v3+json" \
      "https://api.github.com/enterprises/$GITHUB_ENTERPRISE_NAME")
    
    if [ "$enterprise_response" = "200" ]; then
      echo "✅ Enterprise access confirmed"
    else
      echo "⚠️  WARNING: Could not verify enterprise access (HTTP $enterprise_response)"
      echo "   Check that your token has sufficient permissions and the enterprise name is correct"
    fi
  fi
fi

echo "📋 GitHub configuration check complete"
echo "--------------------------------------"
