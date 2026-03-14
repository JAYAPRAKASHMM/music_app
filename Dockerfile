# Use a lightweight Node.js image based on Debian
FROM node:18-bullseye-slim

# Install OS dependencies required for the zero-disk pipes
RUN apt-get update && \
    apt-get install -y ffmpeg curl python3 && \
    # Download and install the latest yt-dlp system binary
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    # Clean up package lists to keep the Docker image small
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy package configurations
COPY package*.json ./
COPY server/package*.json ./server/

# Install backend dependencies
RUN npm run install:server

# Copy all the project source code (client and server)
COPY . .

# Expose the default port (Render overrides this via the PORT environment variable dynamically)
EXPOSE 3001

# Start the Infinity Player
CMD ["npm", "start"]
