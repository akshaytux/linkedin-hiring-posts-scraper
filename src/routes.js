/**
 * Route handler for processing LinkedIn content search result pages.
 * Extracts post data from the search results feed.
 */

import { Actor, log } from 'apify';
import { parseRelativeDate, cleanPostText, parseEngagementCount, randomDelay, extractPostId } from './utils.js';

/**
 * Creates the request handler function for the PlaywrightCrawler.
 *
 * @param {object} options
 * @param {number} options.maxResults - Maximum posts to collect per job role
 * @returns {Function} The request handler
 */
export function createRequestHandler({ maxResults }) {
    // Track collected results per job role to enforce maxResults
    const collectedPerRole = {};

    return async function requestHandler({ page, request, enqueueLinks }) {
        const { jobRole } = request.userData;
        const url = request.loadedUrl || request.url;

        if (!collectedPerRole[jobRole]) {
            collectedPerRole[jobRole] = 0;
        }

        log.info(`Processing search results for role: "${jobRole}"`, { url });

        // ── Wait for the page to load ────────────────────────────────────
        try {
            // Wait for either the results container or a "no results" indicator
            await page.waitForSelector(
                '.search-results-container, .search-reusable-search-no-results, .scaffold-finite-scroll',
                { timeout: 30000 }
            );
        } catch {
            log.warning('Page did not load expected elements. Checking for login wall or error...');

            // Check if we hit a login wall
            const isLoginPage = await page.evaluate(() => {
                return document.querySelector('.login-form, [data-id="sign-in-form"], .authwall-join-form') !== null
                    || window.location.href.includes('/login')
                    || window.location.href.includes('/authwall');
            });

            if (isLoginPage) {
                throw new Error(
                    'LinkedIn login wall detected. Your li_at cookie may be expired or invalid. ' +
                    'Please get a fresh cookie from your browser.'
                );
            }

            // Take a screenshot for debugging
            const screenshotBuffer = await page.screenshot({ fullPage: false });
            const screenshotKey = `debug-${jobRole.replace(/\s+/g, '-')}-${Date.now()}`;
            await Actor.setValue(screenshotKey, screenshotBuffer, { contentType: 'image/png' });
            log.warning(`Saved debug screenshot as "${screenshotKey}". Page may have an unexpected layout.`);
        }

        // ── Dismiss any modals or overlays ───────────────────────────────
        await dismissOverlays(page);

        // ── Auto-scroll to load more posts ───────────────────────────────
        const postsNeeded = maxResults - collectedPerRole[jobRole];
        if (postsNeeded <= 0) {
            log.info(`Already collected enough posts for "${jobRole}". Skipping.`);
            return;
        }

        await autoScroll(page, postsNeeded);

        // ── Extract posts ────────────────────────────────────────────────
        const posts = await extractPosts(page, jobRole);

        if (posts.length === 0) {
            log.warning(`No posts found for "${jobRole}". The search may have returned no results.`);
            return;
        }

        // Limit to maxResults per role
        const postsToSave = posts.slice(0, postsNeeded);
        collectedPerRole[jobRole] += postsToSave.length;

        log.info(`Extracted ${postsToSave.length} posts for "${jobRole}" (total: ${collectedPerRole[jobRole]}/${maxResults})`);

        // Push to dataset
        await Actor.pushData(postsToSave);

        // ── Handle pagination ────────────────────────────────────────────
        if (collectedPerRole[jobRole] < maxResults) {
            await handlePagination(page, request, enqueueLinks, jobRole);
        }
    };
}

/**
 * Dismisses common LinkedIn overlays and modals that can block interaction.
 *
 * @param {import('playwright').Page} page
 */
async function dismissOverlays(page) {
    const overlaySelectors = [
        'button[data-test-modal-close-btn]',
        '.msg-overlay-bubble-header__control--new-convo-btn',
        '.artdeco-modal__dismiss',
        'button.artdeco-toast-item__dismiss',
        '.msg-overlay-bubble-header button[data-control-name="overlay.close_conversation_window"]',
    ];

    for (const selector of overlaySelectors) {
        try {
            const element = await page.$(selector);
            if (element) {
                await element.click();
                await randomDelay(300, 600);
            }
        } catch {
            // Ignore — overlay may not exist
        }
    }
}

/**
 * Scrolls the page to trigger LinkedIn's lazy loading and load more post results.
 *
 * @param {import('playwright').Page} page
 * @param {number} targetCount - Approximate number of posts we want loaded
 */
async function autoScroll(page, targetCount) {
    const maxScrollAttempts = Math.ceil(targetCount / 5) + 5; // ~5 posts per scroll
    let scrollAttempts = 0;
    let previousHeight = 0;
    let unchangedCount = 0;

    while (scrollAttempts < maxScrollAttempts) {
        // Count currently loaded posts
        const currentPostCount = await page.evaluate(() => {
            return document.querySelectorAll('.feed-shared-update-v2, .update-components-actor, [data-urn]').length;
        });

        if (currentPostCount >= targetCount) {
            log.debug(`Loaded ${currentPostCount} posts, target was ${targetCount}. Stopping scroll.`);
            break;
        }

        // Scroll down
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await randomDelay(1500, 3000);

        // Check if page height changed (new content loaded)
        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        if (newHeight === previousHeight) {
            unchangedCount++;
            if (unchangedCount >= 3) {
                log.debug('Page height unchanged after 3 scroll attempts. No more content to load.');
                break;
            }
        } else {
            unchangedCount = 0;
        }

        previousHeight = newHeight;
        scrollAttempts++;

        // Click "Show more results" button if present
        try {
            const showMoreBtn = await page.$('button.scaffold-finite-scroll__load-button');
            if (showMoreBtn) {
                await showMoreBtn.click();
                await randomDelay(2000, 4000);
            }
        } catch {
            // Button may not exist
        }
    }
}

/**
 * Extracts post data from the currently loaded LinkedIn search results page.
 *
 * @param {import('playwright').Page} page
 * @param {string} jobRole - The job role this search was for (attached to each result)
 * @returns {Promise<object[]>} Array of extracted post data objects
 */
async function extractPosts(page, jobRole) {
    return page.evaluate((role) => {
        const posts = [];

        // LinkedIn renders search results in containers with these possible selectors
        const postElements = document.querySelectorAll(
            '.feed-shared-update-v2, .search-content__result, [data-chameleon-result-urn]'
        );

        postElements.forEach((postEl) => {
            try {
                // ── Author info ──────────────────────────────────────
                const authorEl = postEl.querySelector(
                    '.update-components-actor__name .hoverable-link-text, ' +
                    '.update-components-actor__name span[aria-hidden="true"], ' +
                    '.feed-shared-actor__name span, ' +
                    'a.app-aware-link span[aria-hidden="true"]'
                );
                const authorName = authorEl?.textContent?.trim() || '';

                const authorLinkEl = postEl.querySelector(
                    '.update-components-actor__container a, ' +
                    '.feed-shared-actor__container-link, ' +
                    'a.app-aware-link[href*="/in/"]'
                );
                const authorProfileUrl = authorLinkEl?.href || '';

                const headlineEl = postEl.querySelector(
                    '.update-components-actor__description, ' +
                    '.feed-shared-actor__description, ' +
                    '.update-components-actor__supplementary-actor-info'
                );
                const authorHeadline = headlineEl?.textContent?.trim() || '';

                // ── Post content ─────────────────────────────────────
                const contentEl = postEl.querySelector(
                    '.feed-shared-update-v2__description, ' +
                    '.update-components-text, ' +
                    '.feed-shared-text, ' +
                    '.break-words span[dir="ltr"]'
                );
                const postText = contentEl?.textContent?.trim() || '';

                // ── Post URL ─────────────────────────────────────────
                const postLinkEl = postEl.querySelector(
                    'a[href*="feed/update/urn"], ' +
                    'a[href*="activity"]'
                );
                let postUrl = postLinkEl?.href || '';
                // Clean up URL — remove query params
                if (postUrl) {
                    try {
                        const urlObj = new URL(postUrl);
                        postUrl = `${urlObj.origin}${urlObj.pathname}`;
                    } catch {
                        // Keep as-is
                    }
                }

                // ── Date posted ──────────────────────────────────────
                const dateEl = postEl.querySelector(
                    '.update-components-actor__sub-description span[aria-hidden="true"], ' +
                    '.feed-shared-actor__sub-description span, ' +
                    '.update-components-text-view span.visually-hidden'
                );
                const postedDateRaw = dateEl?.textContent?.trim() || '';

                // ── Engagement metrics ───────────────────────────────
                const reactionsEl = postEl.querySelector(
                    '.social-details-social-counts__reactions-count, ' +
                    'button[aria-label*="reaction"] span, ' +
                    '.social-details-social-counts__count-value'
                );
                const reactionCountRaw = reactionsEl?.textContent?.trim() || '0';

                const commentsEl = postEl.querySelector(
                    'button[aria-label*="comment"] span, ' +
                    '.social-details-social-counts__comments'
                );
                const commentCountRaw = commentsEl?.textContent?.trim() || '0';

                const repostsEl = postEl.querySelector(
                    'button[aria-label*="repost"] span, ' +
                    '.social-details-social-counts__reposts'
                );
                const repostCountRaw = repostsEl?.textContent?.trim() || '0';

                // ── Data URN for deduplication ───────────────────────
                const dataUrn = postEl.getAttribute('data-urn')
                    || postEl.getAttribute('data-chameleon-result-urn')
                    || '';

                // Only include if we have some meaningful content
                if (postText || authorName) {
                    posts.push({
                        authorName,
                        authorProfileUrl,
                        authorHeadline,
                        postText,
                        postUrl,
                        postedDateRaw,
                        reactionCountRaw,
                        commentCountRaw,
                        repostCountRaw,
                        dataUrn,
                        searchedRole: role,
                    });
                }
            } catch (err) {
                // Skip malformed post elements
                console.error('Error extracting post:', err.message);
            }
        });

        return posts;
    }, jobRole).then((rawPosts) => {
        // Post-process outside the browser context
        return rawPosts.map((post, index) => ({
            '#': index + 1,
            authorName: post.authorName,
            authorProfileUrl: post.authorProfileUrl,
            authorHeadline: post.authorHeadline,
            postText: cleanPostTextLocal(post.postText),
            postUrl: post.postUrl,
            postedDate: post.postedDateRaw,
            postedDateParsed: parseRelativeDateLocal(post.postedDateRaw),
            reactionCount: parseCountLocal(post.reactionCountRaw),
            commentCount: parseCountLocal(post.commentCountRaw),
            repostCount: parseCountLocal(post.repostCountRaw),
            postId: extractPostIdLocal(post.postUrl || post.dataUrn),
            searchedJobRole: post.searchedRole,
            scrapedAt: new Date().toISOString(),
        }));
    });
}

// Local wrappers for the imported utilities (used outside page.evaluate context)
function cleanPostTextLocal(text) {
    return cleanPostText(text);
}

function parseRelativeDateLocal(text) {
    return parseRelativeDate(text);
}

function parseCountLocal(text) {
    return parseEngagementCount(text);
}

function extractPostIdLocal(urlOrUrn) {
    return extractPostId(urlOrUrn);
}

/**
 * Handles pagination by looking for a "Next" button or constructing the next page URL.
 *
 * @param {import('playwright').Page} page
 * @param {import('crawlee').Request} request
 * @param {Function} enqueueLinks
 * @param {string} jobRole
 */
async function handlePagination(page, request, enqueueLinks, jobRole) {
    // LinkedIn content search uses URL params for pagination: &page=2, &page=3, etc.
    const currentUrl = new URL(request.loadedUrl || request.url);
    const currentPage = parseInt(currentUrl.searchParams.get('page') || '1', 10);
    const nextPage = currentPage + 1;

    // LinkedIn typically limits content search to ~40 pages
    if (nextPage > 40) {
        log.info(`Reached LinkedIn's pagination limit (page 40) for "${jobRole}".`);
        return;
    }

    currentUrl.searchParams.set('page', nextPage.toString());
    const nextUrl = currentUrl.toString();

    log.info(`Enqueueing next page ${nextPage} for "${jobRole}"`);

    await enqueueLinks({
        urls: [nextUrl],
        userData: { jobRole },
    });

    // Random delay before the next page request
    await randomDelay(3000, 7000);
}
