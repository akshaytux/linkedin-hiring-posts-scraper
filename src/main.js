/**
 * LinkedIn Hiring Posts Scraper — Main Entry Point
 *
 * This Apify Actor scrapes LinkedIn content search results to find
 * hiring-related posts matching user-specified job roles, locations,
 * and recency filters.
 *
 * It uses Crawlee's PlaywrightCrawler with cookie-based authentication
 * to access LinkedIn's authenticated search interface.
 */

import { Actor, log } from 'apify';
import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';
import { createRequestHandler } from './routes.js';
import { buildAllSearchUrls } from './linkedin-url-builder.js';
import { validateInput } from './utils.js';

// Initialize the Apify Actor
await Actor.init();

try {
    // ── 1. Read and validate input ───────────────────────────────────────
    const rawInput = await Actor.getInput();
    const input = validateInput(rawInput);

    log.info('Actor started with configuration:', {
        searchKeyword: input.searchKeyword,
        jobRoles: input.jobRoles,
        location: input.location || '(worldwide)',
        datePosted: input.datePosted,
        maxResults: input.maxResults,
        hasCookie: !!input.li_at,
    });

    // ── 2. Build search URLs ─────────────────────────────────────────────
    const searchUrls = buildAllSearchUrls(input);

    log.info(`Generated ${searchUrls.length} search URL(s):`);
    searchUrls.forEach(({ url, jobRole }) => {
        log.info(`  → "${jobRole}": ${url}`);
    });

    // ── 3. Configure proxy ───────────────────────────────────────────────
    const proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfig);

    // ── 4. Set up cookies for LinkedIn authentication ────────────────────
    const linkedinCookies = [
        {
            name: 'li_at',
            value: input.li_at,
            domain: '.linkedin.com',
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'None',
        },
    ];

    // ── 5. Configure and create the PlaywrightCrawler ────────────────────
    const crawler = new PlaywrightCrawler({
        proxyConfiguration,

        // Use persistent browser context to maintain cookies across requests
        useSessionPool: true,
        persistCookiesPerSession: true,

        // Browser launch options
        launchContext: {
            launchOptions: {
                headless: true,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                ],
            },
        },

        // Limit concurrency to avoid LinkedIn rate limits
        maxConcurrency: 1,
        maxRequestsPerMinute: 8,

        // Timeouts
        navigationTimeoutSecs: 60,
        requestHandlerTimeoutSecs: 120,

        // Retry configuration
        maxRequestRetries: 2,

        // Pre-navigation hook: inject cookies before each page loads
        preNavigationHooks: [
            async ({ page, request }, gotoOptions) => {
                // Inject LinkedIn session cookies
                const context = page.context();
                await context.addCookies(linkedinCookies);

                // Set a realistic user agent
                await page.setExtraHTTPHeaders({
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                });

                log.debug(`Navigating to: ${request.url}`);

                // Override goto options for better loading
                gotoOptions.waitUntil = 'domcontentloaded';
            },
        ],

        // The main request handler
        requestHandler: createRequestHandler({ maxResults: input.maxResults }),

        // Error handler
        failedRequestHandler: async ({ request }, error) => {
            log.error(`Request failed: ${request.url}`, {
                error: error.message,
                jobRole: request.userData.jobRole,
                retryCount: request.retryCount,
            });

            // Save failure info for debugging
            await Actor.pushData({
                error: true,
                errorMessage: error.message,
                url: request.url,
                jobRole: request.userData.jobRole,
                scrapedAt: new Date().toISOString(),
            });
        },
    });

    // ── 6. Build the initial request list ─────────────────────────────────
    const requests = searchUrls.map(({ url, jobRole }) => ({
        url,
        userData: { jobRole },
        uniqueKey: `${jobRole}::page1`,
    }));

    // ── 7. Run the crawler ───────────────────────────────────────────────
    log.info('Starting crawler...');
    await crawler.run(requests);

    // ── 8. Summary ───────────────────────────────────────────────────────
    const { datasetItemCount } = await Actor.getDataset()
        .then((dataset) => dataset.getInfo())
        .catch(() => ({ datasetItemCount: 0 }));

    log.info(`✅ Scraping complete! Collected ${datasetItemCount} posts total.`);
    log.info('Results are available in the default dataset. You can export them as JSON, CSV, or Excel.');

} catch (error) {
    log.error('Actor failed with error:', { message: error.message, stack: error.stack });
    throw error;
} finally {
    // Gracefully shut down the Actor
    await Actor.exit();
}
