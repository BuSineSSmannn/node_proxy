
const express = require('express');
const store = require('app-store-scraper');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

app.post('/suggest', async (req, res) => {
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
            message: error.message
        });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
