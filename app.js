const express = require('express');
const store = require('app-store-scraper');
const cors = require('cors');
const Bottleneck = require('bottleneck');

const app = express();
const port = 3000;

// Throttle outgoing requests to Apple iTunes API: 18 req/min (safe margin under 20 limit)
const limiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: Math.ceil(60000 / 18), // ~3333ms between requests
});

app.use((req, res, next) => {
    const originalJson = res.json;

    res.json = function(data) {
        return originalJson.call(this, data);
    };

    next();
});

app.use(cors());
app.use(express.json());

app.post('/suggestions', async (req, res) => {
    try {
        const { term } = req.body;

        if (!term || term.trim() === '') {
            return res.status(400).json({
                error: 'Param term is required',
                message: 'You must provide a search term in request body'
            });
        }

        const suggestions = await store.suggest({ term });

        const terms = suggestions.map(item => item.term);
        res.json({
            'suggestions': terms
        });
    } catch (error) {
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message,
            stack: error.stack
        });
    }
});

/**
 * Search position via official iTunes Search API
 * https://itunes.apple.com/search?term=...&country=...&entity=software&limit=200
 *
 * Throttled to 18 req/min via Bottleneck to respect Apple rate limits.
 */
app.post('/search-position', async (req, res) => {
    try {
        const { keyword, app_id, country } = req.body;

        if (!keyword || keyword.trim() === '') {
            return res.status(400).json({
                error: 'Missing parameter',
                message: 'Keyword is required in request body'
            });
        }

        if (!country) {
            return res.status(400).json({
                error: 'Missing parameter',
                message: 'Country is required in request body'
            });
        }

        if (!app_id) {
            return res.status(400).json({
                error: 'Missing parameter',
                message: 'AppId is required in request body'
            });
        }

        const targetAppId = parseInt(app_id);

        // compact: true -> answer without appInfo / searchResults (~1 KB instead of ~0.5 MB).
        // Without the flag the answer is unchanged.
        const compact = req.body.compact === true;

        // Throttled call to iTunes Search API
        const searchResults = await limiter.schedule(() => itunesSearch(keyword, country));

        const appPosition = searchResults.findIndex(app => app.id === targetAppId);

        if (appPosition !== -1) {
            const appInfo = searchResults[appPosition];

            return res.json({
                found: true,
                position: appPosition + 1,
                keyword: keyword,
                appId: targetAppId,
                appName: appInfo.title,
                developer: appInfo.developer,
                ...(compact ? {} : { appInfo: appInfo }),
                totalResults: searchResults.length,
                ...(compact ? {} : { searchResults: searchResults })
            });
        } else {
            return res.json({
                found: false,
                keyword: keyword,
                appId: targetAppId,
                message: `App with ID ${targetAppId} not found in the search results for keyword "${keyword}"`,
                totalResults: searchResults.length,
                ...(compact ? {} : { searchResults: searchResults })
            });
        }
    } catch (error) {
        console.error('search-position error:', error.message);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message,
        });
    }
});


app.post('/search-app', async (req, res) => {
    try {
        const { app_id } = req.body;

        if (!app_id) {
            return res.status(400).json({
                error: 'Missing parameter',
                message: 'AppId is required in request body'
            });
        }

        const targetAppId = parseInt(app_id);

        const searchResults = await store.app({
            id: targetAppId,
        });


        res.json({
            searchResults
        })
    } catch (error) {
        console.error('search-app error:', error.message);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message,
        });
    }

});

/**
 * Fetch search results from official iTunes Search API.
 * Returns array of apps mapped to match the previous response format.
 */
async function itunesSearch(keyword, country) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(keyword)}&country=${encodeURIComponent(country)}&entity=software&limit=200`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`iTunes API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    return (data.results || []).map(app => ({
        id: app.trackId,
        appId: app.bundleId,
        title: app.trackName,
        url: app.trackViewUrl,
        icon: app.artworkUrl512 || app.artworkUrl100 || app.artworkUrl60,
        genres: app.genres,
        primaryGenre: app.primaryGenreName,
        primaryGenreId: app.primaryGenreId,
        contentRating: app.contentAdvisoryRating,
        languages: app.languageCodesISO2A,
        requiredOsVersion: app.minimumOsVersion,
        released: app.releaseDate,
        updated: app.currentVersionReleaseDate || app.releaseDate,
        releaseNotes: app.releaseNotes,
        version: app.version,
        developer: app.artistName,
        developerUrl: app.artistViewUrl,
        developerWebsite: app.sellerUrl,
        score: app.averageUserRating,
        reviews: app.userRatingCount,
        currentVersionScore: app.averageUserRatingForCurrentVersion,
        currentVersionReviews: app.userRatingCountForCurrentVersion,
        screenshots: app.screenshotUrls,
        ipadScreenshots: app.ipadScreenshotUrls,
        appletvScreenshots: app.appletvScreenshotUrls,
    }));
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
