# Stage 1: Development Stage (Installs all dependencies, including dev dependencies)
FROM node:20-alpine AS development

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to leverage Docker layer caching
COPY package*.json ./

# Install all dependencies (both production and development dependencies)
RUN npm install --legacy-peer-deps

# Copy the entire application code into the container
# COPY . .

# Build the NestJS project (create the dist folder for production)
# RUN npm run build

# Expose the port your app runs on (e.g., 8005 assumed)
EXPOSE 8007

# Stage 2: Production Stage (Optimized for production with production dependencies only)
FROM node:20-alpine AS production

# Set working directory for the production container
WORKDIR /app

# Copy only package.json and package-lock.json from the dev stage (without node_modules)
COPY package*.json ./

# Install only production dependencies (no dev dependencies like Chokidar)
RUN npm install --production --legacy-peer-deps

# Copy the compiled code (dist folder) from the dev stage to the production image
COPY . .


# Build the NestJS project (it will create the dist folder)
RUN npm run build

# Expose the port for the production app
EXPOSE 8007

# Optional: Use a non-root user for better security (recommended in production)
RUN addgroup -S app && adduser -S app -G app
USER app

# Start the app in production mode
CMD ["npm", "run", "start:prod"]


# # Use Node.js LTS as base image
# FROM node:20-alpine
# # Create app directory
# WORKDIR /app
# # Install app dependencies
# COPY package*.json ./
# RUN npm install
# # Copy source files
# COPY . .
# # Build the NestJS project
# RUN npm run build
# # Expose the port your app runs on (8005 assumed)
# EXPOSE 8005
# # Start the app in production
# CMD ["npm", "run", "start:prod"]