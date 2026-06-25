# Use the Apify Playwright + Chrome base image
FROM apify/actor-node-playwright-chrome:20

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev --prefer-online \
    && echo "Installed NPM packages:" \
    && (npm ls --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version \
    && rm -r ~/.npm

# Copy the rest of the source code
COPY . ./

# Run the actor
CMD npm start
