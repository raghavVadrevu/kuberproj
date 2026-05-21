# 1. This tells Docker to pull an image with Node 22 pre-installed
FROM node:20.19.4-alpine

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy only the package files first
COPY package.json package-lock.json ./

# 4. Run the install INSIDE the container (using Node 20.19.4)
RUN npm install

# 5. Copy the rest of your frontend code
COPY . .

# 6. Expose Vite's default port
EXPOSE 5173

# 7. Start Vite. The "--host" flag is crucial so it's accessible outside the Docker container
CMD ["npm", "run", "dev", "--", "--host"]