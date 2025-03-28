const express = require('express');
const store = require('app-store-scraper');
const cors = require('cors');

const app = express();
const port = 3000;


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

app.post('/search-position', async (req, res) => {
    try {
        const { keyword, appId, country, num = 1000, page = 1 } = req.body;

        // Проверка обязательных параметров
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

        if (!appId) {
            return res.status(400).json({
                error: 'Missing parameter',
                message: 'AppId is required in request body'
            });
        }

        // Нормализация appId к числовому типу
        const targetAppId = parseInt(appId);

        // Выполняем поиск по ключевому слову
        const searchResults = await store.search({
            term: keyword,
            num: num,
            page: page,
            country: country
        });

        // Найдем позицию приложения в результатах
        const appPosition = searchResults.findIndex(app => app.id === targetAppId);

        if (appPosition !== -1) {
            // Приложение найдено
            const position = (page - 1) * num + appPosition + 1;
            const appInfo = searchResults[appPosition];

            return res.json({
                found: true,
                position: position,
                keyword: keyword,
                appId: targetAppId,
                appName: appInfo.title,
                developer: appInfo.developer,
                appInfo: appInfo,
                totalResults: searchResults.length
            });
        } else {
            // Приложение не найдено на текущей странице
            return res.json({
                found: false,
                keyword: keyword,
                appId: targetAppId,
                message: `App with ID ${targetAppId} not found in the search results for keyword "${keyword}" on page ${page}`,
                totalResults: searchResults.length
            });
        }
    } catch (error) {
        console.log(req.response)
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message,
            stack: error.stack
        });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


store.similar({id: 1093525667}).then(console.log).catch(console.log);
