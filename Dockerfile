# Use the Apify Playwright + Chrome base image
FROM apify/actor-node-playwright-chrome:20

# Copy package files with correct ownership and install dependencies
COPY --chown=myuser:myuser package*.json ./
RUN npm install --omit=dev --prefer-online \
    && echo "Installed NPM packages:" \
    && (npm ls --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version \
    && rm -r ~/.npm

# Copy the rest of the source code with correct ownership
COPY --chown=myuser:myuser . ./

# Run the actor
CMD npm start
