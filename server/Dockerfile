FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Clean install dependencies
RUN rm -rf node_modules && \
    npm install

# Copy the rest of the application code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose the API port
EXPOSE 4000

# Command to run the application
CMD ["npm", "start"]