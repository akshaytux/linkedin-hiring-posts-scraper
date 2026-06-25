/**
 * Utility functions for the LinkedIn Hiring Posts Scraper.
 */

/**
 * Parses LinkedIn's relative date strings into approximate ISO date strings.
 * LinkedIn displays dates like "3d", "1w", "2mo", "1yr", "Just now", "5h", etc.
 *
 * @param {string} relativeText - The relative date text from LinkedIn (e.g., "3d", "1w")
 * @returns {string} ISO date string (approximate)
 */
export function parseRelativeDate(relativeText) {
    if (!relativeText) return '';

    const text = relativeText.trim().toLowerCase();
    const now = new Date();

    if (text === 'just now' || text === 'now') {
        return now.toISOString();
    }

    // Match patterns like "3d", "1w", "2mo", "5h", "30m", "1yr"
    const match = text.match(/^(\d+)\s*(s|m|mi|min|h|hr|d|w|wk|mo|yr|y)(?:s|ago|\.)?/i);
    if (!match) {
        // Try matching "X hours ago", "X days ago" etc.
        const longMatch = text.match(/^(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
        if (longMatch) {
            const value = parseInt(longMatch[1], 10);
            const unit = longMatch[2].toLowerCase();
            return subtractFromDate(now, value, unit);
        }
        return relativeText; // Return original if we can't parse
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    const unitMap = {
        's': 'second',
        'm': 'minute',
        'mi': 'minute',
        'min': 'minute',
        'h': 'hour',
        'hr': 'hour',
        'd': 'day',
        'w': 'week',
        'wk': 'week',
        'mo': 'month',
        'yr': 'year',
        'y': 'year',
    };

    return subtractFromDate(now, value, unitMap[unit] || 'day');
}

/**
 * Subtracts a duration from a date and returns an ISO string.
 *
 * @param {Date} date - Base date
 * @param {number} value - Number of units to subtract
 * @param {string} unit - Time unit (second, minute, hour, day, week, month, year)
 * @returns {string} ISO date string
 */
function subtractFromDate(date, value, unit) {
    const result = new Date(date);

    switch (unit) {
        case 'second':
            result.setSeconds(result.getSeconds() - value);
            break;
        case 'minute':
            result.setMinutes(result.getMinutes() - value);
            break;
        case 'hour':
            result.setHours(result.getHours() - value);
            break;
        case 'day':
            result.setDate(result.getDate() - value);
            break;
        case 'week':
            result.setDate(result.getDate() - value * 7);
            break;
        case 'month':
            result.setMonth(result.getMonth() - value);
            break;
        case 'year':
            result.setFullYear(result.getFullYear() - value);
            break;
        default:
            result.setDate(result.getDate() - value);
    }

    return result.toISOString();
}

/**
 * Cleans post text by removing excessive whitespace and trimming.
 *
 * @param {string} rawText - Raw text extracted from the DOM
 * @returns {string} Cleaned text
 */
export function cleanPostText(rawText) {
    if (!rawText) return '';

    return rawText
        .replace(/\s+/g, ' ')    // Collapse multiple whitespace into single space
        .replace(/\n\s*\n/g, '\n') // Collapse multiple newlines
        .trim();
}

/**
 * Extracts a numeric count from LinkedIn's engagement strings.
 * Handles formats like "1,234", "1.2K", "500", "12K", "1M", etc.
 *
 * @param {string} text - The engagement count text
 * @returns {number} Parsed numeric value
 */
export function parseEngagementCount(text) {
    if (!text) return 0;

    const cleaned = text.trim().toLowerCase().replace(/,/g, '');

    if (cleaned.endsWith('k')) {
        return Math.round(parseFloat(cleaned) * 1000);
    }
    if (cleaned.endsWith('m')) {
        return Math.round(parseFloat(cleaned) * 1000000);
    }

    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 0 : num;
}

/**
 * Returns a promise that resolves after a random delay between min and max ms.
 * Used to simulate human-like browsing behavior.
 *
 * @param {number} minMs - Minimum delay in milliseconds
 * @param {number} maxMs - Maximum delay in milliseconds
 * @returns {Promise<void>}
 */
export function randomDelay(minMs = 2000, maxMs = 5000) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Extracts the post URN/ID from a LinkedIn post URL.
 * LinkedIn post URLs contain an activity ID like: /feed/update/urn:li:activity:1234567890/
 *
 * @param {string} url - The post URL
 * @returns {string} The activity ID or empty string
 */
export function extractPostId(url) {
    if (!url) return '';
    const match = url.match(/activity[:%3A]+(\d+)/i);
    return match ? match[1] : '';
}

/**
 * Validates the actor input and provides defaults where needed.
 *
 * @param {object} input - Raw actor input
 * @returns {object} Validated and normalized input
 */
export function validateInput(input) {
    if (!input) {
        throw new Error('Actor input is required. Please provide at least searchKeyword, jobRoles, and li_at cookie.');
    }

    const {
        searchKeyword = 'Hiring',
        jobRoles = [],
        location = '',
        datePosted = 'pastWeek',
        maxResults = 50,
        li_at = '',
        proxyConfig = { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    } = input;

    if (!li_at) {
        throw new Error(
            'LinkedIn session cookie (li_at) is required. ' +
            'To get it: Log into LinkedIn → Open DevTools (F12) → Application → Cookies → linkedin.com → Copy "li_at" value.'
        );
    }

    if (!jobRoles || jobRoles.length === 0) {
        throw new Error('At least one job role must be provided in the "jobRoles" field.');
    }

    const validDateFilters = ['past24h', 'pastWeek', 'pastMonth', 'anyTime'];
    if (!validDateFilters.includes(datePosted)) {
        throw new Error(`Invalid datePosted value "${datePosted}". Must be one of: ${validDateFilters.join(', ')}`);
    }

    return {
        searchKeyword: searchKeyword.trim(),
        jobRoles: jobRoles.map((r) => r.trim()).filter(Boolean),
        location: location.trim(),
        datePosted,
        maxResults: Math.min(Math.max(1, maxResults), 500),
        li_at: li_at.trim(),
        proxyConfig,
    };
}
