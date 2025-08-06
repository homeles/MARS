FROM node:20-alpine

WORKDIR /app

# Install bash and curl for the validation script
RUN apk add --no-cache bash curl

# Copy package files
COPY package*.json ./

# Clean install dependencies
RUN rm -rf node_modules && \
    npm install

# Copy the rest of the application code
COPY . .

# Make the validation script executable
RUN chmod +x ./scripts/check-github-config.sh

# Build TypeScript code
RUN npm run build

# Expose the API port
EXPOSE 4000

# Command to run the application
CMD ["sh", "-c", "./scripts/check-github-config.sh && npm start"]