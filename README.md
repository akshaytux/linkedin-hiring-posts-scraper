# LinkedIn Hiring Posts Scraper

An [Apify Actor](https://apify.com/actors) that scrapes LinkedIn for hiring-related posts. Search by **job roles**, **location**, and **recency** to find the latest hiring opportunities posted on LinkedIn.

## ✨ What it does

This actor searches LinkedIn's content feed for posts containing hiring-related keywords combined with specific job roles you're interested in. It extracts:

- **Author details** — name, profile URL, headline
- **Post content** — full text of the post
- **Post link** — direct URL to the LinkedIn post
- **Date posted** — when the post was published
- **Engagement metrics** — reactions, comments, and reposts count
- **Search metadata** — which job role matched the result

## 🔧 Input Configuration

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `searchKeyword` | string | Yes | `"Hiring"` | Primary keyword to search for |
| `jobRoles` | string[] | Yes | `["Product Designer"]` | Job roles to search for |
| `location` | string | No | *(worldwide)* | Location filter (city/country) |
| `datePosted` | enum | No | `pastWeek` | When posted filter |
| `maxResults` | integer | No | `50` | Max posts per job role (1–500) |
| `li_at` | string | Yes | — | LinkedIn session cookie |
| `proxyConfig` | object | No | Residential proxy | Proxy settings |

### Date Filter Options

| Value | Description |
|---|---|
| `past24h` | Posts from the last 24 hours |
| `pastWeek` | Posts from the last 7 days |
| `pastMonth` | Posts from the last 30 days |
| `anyTime` | No date filter |

### Example Input

```json
{
    "searchKeyword": "Hiring",
    "jobRoles": [
        "Product Designer",
        "UI/UX Designer",
        "UI Designer",
        "UX Designer"
    ],
    "location": "India",
    "datePosted": "pastWeek",
    "maxResults": 50,
    "li_at": "YOUR_LI_AT_COOKIE_HERE"
}
```

## 🔑 How to get your LinkedIn cookie (`li_at`)

1. Open your browser and **log into LinkedIn**
2. Press **F12** to open Developer Tools
3. Go to the **Application** tab (Chrome) or **Storage** tab (Firefox)
4. Click **Cookies** → `https://www.linkedin.com`
5. Find the cookie named **`li_at`**
6. Copy its **Value** — it's a long string starting with `AQE...`
7. Paste it into the `li_at` input field

> ⚠️ **Important**: Your `li_at` cookie expires periodically. If the actor reports login errors, get a fresh cookie.

## 📦 Output Format

Each post in the output dataset contains:

```json
{
    "#": 1,
    "authorName": "John Doe",
    "authorProfileUrl": "https://www.linkedin.com/in/johndoe/",
    "authorHeadline": "Head of Design at TechCorp",
    "postText": "We're hiring a Senior Product Designer to join our team in Bangalore...",
    "postUrl": "https://www.linkedin.com/feed/update/urn:li:activity:1234567890/",
    "postedDate": "3d",
    "postedDateParsed": "2026-06-22T13:30:00.000Z",
    "reactionCount": 142,
    "commentCount": 28,
    "repostCount": 15,
    "postId": "1234567890",
    "searchedJobRole": "Product Designer",
    "scrapedAt": "2026-06-25T13:00:00.000Z"
}
```

## 🏗️ Architecture

```
Actor Input → Validate → Build Search URLs (1 per role)
                              ↓
                    PlaywrightCrawler
                    + Cookie injection
                    + Residential proxy
                              ↓
                    For each search URL:
                      → Load page
                      → Auto-scroll for more results
                      → Extract post data
                      → Paginate if needed
                              ↓
                    Push to Apify Dataset
```

## 🛡️ Anti-Detection Features

- **Cookie-based auth** — no email/password login flow
- **Residential proxies** — avoids datacenter IP blocks
- **Rate limiting** — max 1 concurrent request, 8 requests/minute
- **Random delays** — 1.5–7 second delays between actions
- **Human-like scrolling** — gradual scroll with pauses
- **Anti-automation flags** — disables Playwright detection markers
- **Overlay dismissal** — handles LinkedIn modals and chat popups

## ⚠️ Limitations & Disclaimers

- **LinkedIn ToS**: Scraping LinkedIn may violate their Terms of Service. Use responsibly and at your own risk.
- **Rate limits**: LinkedIn limits search results. Very large `maxResults` values may not yield more data.
- **Cookie expiry**: The `li_at` cookie expires periodically and must be refreshed.
- **Selector changes**: LinkedIn may update their HTML structure, which could break the scraper. If you notice issues, please report them.
- **Location accuracy**: Some locations may not have a geo ID mapping and will fall back to keyword-based location search.

## 🚀 Running Locally

```bash
# Install dependencies
npm install

# Create input file
echo '{"searchKeyword":"Hiring","jobRoles":["Product Designer"],"li_at":"YOUR_COOKIE"}' > storage/key_value_stores/default/INPUT.json

# Run the actor
apify run
```

## 📄 License

ISC
