FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application for production
RUN npm run build

# Expose the client port
EXPOSE 3000

# For development, use Vite's dev server
CMD ["npm", "run", "dev", "--", "--host"]