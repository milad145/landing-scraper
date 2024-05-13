# landing-scraper
- Node.js scraper for landing page builders

# Installation:
- clone repository to your local
- cd to repo
- run  ` npm install ` or ` yarn ` on your terminal

# Create Config File
- copy `config-sample.json` file and rename it to `config.js`

# Set Config:
- set your custom config at `config.js` for different landings

# Run Scraper:
- `npm run landingi` for scraping your landing page
- watch the `console logs` for destination directory

# Results
- `projects` directory will be created during the scraping. you can find your project there.

# Last Step
- inside of your project you can find `data.php` file
- this file is like this
```
<? $baseUrl='http://localhost/' ?>
```
- edit this file and replace the localhost with your host domain
