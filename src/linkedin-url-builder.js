/**
 * Builds LinkedIn content search URLs from user input parameters.
 *
 * LinkedIn's content search URL format:
 *   https://www.linkedin.com/search/results/content/?keywords=...&datePosted=...&origin=FACETED_SEARCH
 */

/**
 * Mapping of common location names to LinkedIn geo URN IDs.
 * These IDs are LinkedIn's internal identifiers for geographic regions.
 * Expand this map as needed for additional locations.
 */
const LOCATION_GEO_IDS = {
    // Countries
    'india': '102713980',
    'united states': '103644278',
    'united kingdom': '101165590',
    'canada': '101174742',
    'australia': '101452733',
    'germany': '101282230',
    'france': '105015875',
    'singapore': '102454443',
    'netherlands': '102890719',
    'sweden': '105117694',
    'switzerland': '106693272',
    'japan': '101355337',
    'brazil': '106057199',
    'israel': '101620260',
    'ireland': '104738515',
    'spain': '105646813',
    'italy': '103350119',
    'uae': '104305776',
    'united arab emirates': '104305776',
    'south korea': '105149562',
    'new zealand': '105490917',
    'portugal': '100364837',
    'poland': '105072130',
    'mexico': '103323778',
    'argentina': '100446943',
    'indonesia': '102478259',
    'nigeria': '105365761',
    'kenya': '100578327',
    'south africa': '104035573',
    'egypt': '106155005',
    'pakistan': '101022442',
    'bangladesh': '106369942',
    'philippines': '103121230',
    'vietnam': '104195383',
    'thailand': '105146118',
    'malaysia': '106808692',
    'colombia': '100876405',
    'chile': '104621616',
    'peru': '102927786',
    'turkey': '102105699',
    'saudi arabia': '100459316',
    'qatar': '104690818',
    'kuwait': '103644102',
    'oman': '107713032',
    'bahrain': '101883558',
    'china': '102890883',
    'taiwan': '104187078',
    'hong kong': '103291313',
    'denmark': '104514075',
    'norway': '103819153',
    'finland': '100456013',
    'austria': '103883259',
    'belgium': '100565514',
    'czech republic': '104508036',
    'romania': '106670623',
    'greece': '104677530',
    'ukraine': '102264497',
    'russia': '101728296',
    'sri lanka': '100446943',

    // Major Cities
    'san francisco': '102277331',
    'new york': '105080838',
    'los angeles': '102448103',
    'chicago': '103112676',
    'seattle': '104116203',
    'austin': '104472866',
    'boston': '102380872',
    'denver': '103324627',
    'miami': '102395995',
    'london': '102257491',
    'berlin': '106967730',
    'paris': '105162991',
    'amsterdam': '102011674',
    'dublin': '105178154',
    'toronto': '100025096',
    'vancouver': '103366113',
    'sydney': '104769905',
    'melbourne': '103116025',
    'mumbai': '106164952',
    'bangalore': '105214831',
    'bengaluru': '105214831',
    'delhi': '102713980',
    'new delhi': '116894380',
    'hyderabad': '105556991',
    'chennai': '106522935',
    'pune': '114806696',
    'kolkata': '110084064',
    'ahmedabad': '110553536',
    'gurgaon': '115884833',
    'gurugram': '115884833',
    'noida': '114631980',
    'dubai': '104305776',
    'abu dhabi': '104305776',
    'singapore': '102454443',
    'tokyo': '101355337',
    'tel aviv': '101620260',
    'stockholm': '106691028',
    'zurich': '106693272',
    'remote': '',
};

/**
 * Maps user-friendly date filter values to LinkedIn's datePosted URL parameter.
 */
const DATE_POSTED_MAP = {
    'past24h': 'past-24h',
    'pastWeek': 'past-week',
    'pastMonth': 'past-month',
    'anyTime': '',
};

/**
 * Builds a LinkedIn content search URL for a given job role and filters.
 *
 * @param {object} options
 * @param {string} options.searchKeyword - Primary keyword (e.g., "Hiring")
 * @param {string} options.jobRole - Specific job role to search for
 * @param {string} [options.location] - Location name for geo filtering
 * @param {string} [options.datePosted] - Date recency filter key
 * @returns {string} Fully constructed LinkedIn search URL
 */
export function buildSearchUrl({ searchKeyword, jobRole, location, datePosted }) {
    const baseUrl = 'https://www.linkedin.com/search/results/content/';
    const params = new URLSearchParams();

    // Build the keywords query: "Hiring" AND "Product Designer"
    // If location is provided but not found in geo ID map, include it in keywords
    let keywordsQuery = `${searchKeyword} ${jobRole}`;

    const locationLower = (location || '').trim().toLowerCase();
    const geoId = LOCATION_GEO_IDS[locationLower];

    if (locationLower && !geoId && locationLower !== 'remote') {
        // Location not in our geo ID map — include it as a keyword
        keywordsQuery += ` ${location}`;
    }

    params.set('keywords', keywordsQuery);
    params.set('origin', 'FACETED_SEARCH');

    // Add date filter
    if (datePosted && DATE_POSTED_MAP[datePosted]) {
        params.set('datePosted', `"${DATE_POSTED_MAP[datePosted]}"`);
    }

    // Add geo filter if we have a valid geo ID
    if (geoId) {
        params.set('geoUrn', `["${geoId}"]`);
    }

    return `${baseUrl}?${params.toString()}`;
}

/**
 * Builds an array of search URLs — one per job role — using the provided input.
 *
 * @param {object} input - Actor input object
 * @param {string} input.searchKeyword
 * @param {string[]} input.jobRoles
 * @param {string} [input.location]
 * @param {string} [input.datePosted]
 * @returns {{ url: string, jobRole: string }[]} Array of URL + role pairs
 */
export function buildAllSearchUrls(input) {
    const { searchKeyword, jobRoles, location, datePosted } = input;

    return jobRoles.map((jobRole) => ({
        url: buildSearchUrl({ searchKeyword, jobRole: jobRole.trim(), location, datePosted }),
        jobRole: jobRole.trim(),
    }));
}
