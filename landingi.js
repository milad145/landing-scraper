const fs = require('fs').promises;
const https = require('https');
const path = require('path');
const Stream = require('stream').Transform;
const URL = require('url');

const cheerio = require('cheerio');
const pretty = require("pretty");

const configData = require("./config.json")

const pageUrl = configData["landing-url"];
const projectsPath = path.join(__dirname, 'projects')
let projectPath = null;
let projectName = null;
const urlExpression = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi;
const baseUrl = "http://localhost/"

let allFiles = []
let cdnFiles = []
let cssFiles = []

function downloadFiles(url, pathName, name) {
    return new Promise((resolve, reject) => {
        const request = https.request(url, function (response) {
            if (response.statusCode === 200) {
                let data = new Stream();

                response.on('data', function (chunk) {
                    data.push(chunk);
                });

                response.on('end', function () {
                    return fs.mkdir(pathName, {recursive: true})
                        .then(() => {
                            return fs.writeFile(path.join(pathName, name), data.read());
                        })
                        .then(() => resolve(true))
                        .catch(err => reject(err))
                });
            } else reject(response.statusCode)
        });

        request.on('error', err => reject(err));
        request.end();
    })
}

function getProjectName(url, index = 0) {
    return new Promise((resolve, reject) => {
        if (!projectName) {
            projectName = URL.parse(url).host.replace(/\./g, '_');
            if (index)
                projectName = `${projectName}_${index}`

            projectPath = path.join(projectsPath, projectName)
            return fs.access(projectPath)
                .then(() => {
                    projectName = null;
                    resolve(getProjectName(url, ++index))
                })
                .catch(err => {
                    if (err && err.errno === -2) {
                        return fs.mkdir(projectPath, {recursive: true})
                            .then(() => resolve(true))
                            .catch(err => reject(err))
                    } else
                        reject(err)
                })
        } else {
            projectPath = path.join(projectsPath, projectName)
            resolve(true)
        }
    })
}

function downloadAllFiles(urls, index = 0) {
    return new Promise((resolve, reject) => {
        let url = urls[index]
        if (url) {
            url = URL.parse(url);
            let urlPath = url.path.split('/')
            let fileName = urlPath.pop().split('?')[0]

            console.log(`download assets (${++index}/${urls.length}) : ${url.href}`)
            if (url.host === 'cdn.lugc.link') {
                urlPath = [url.path.split('/-/')[0].split('/')[1]]
            }
            urlPath = path.join(projectPath, ...urlPath)
            if (url.host !== 'popups.landingi.com') {
                return downloadFiles(url.href, urlPath, fileName)
                    .then(() => resolve(downloadAllFiles(urls, index)))
                    .catch(err => reject(err))
            } else
                resolve(downloadAllFiles(urls, index))
        } else
            resolve(true)
    })
}

function fixTheCssFiles(urls, index = 0, downloadedFiles = []) {
    return new Promise((resolve, reject) => {
        let url = urls[index]
        if (url) {
            let filePath = path.join(projectPath, url)
            let filePathLevel = url.split('/').length - 1
            let filePathInCss = Array(filePathLevel - 1).fill('../')
            fs.readFile(filePath)
                .then(data => {
                    data += ""
                    let newUrls = data.match(urlExpression).filter(u => u.includes("landingi.com"))
                    for (let f of newUrls) {
                        f = URL.parse(f)
                        data = data.replace(new RegExp(`${f.protocol}//${f.host}/`, 'g'), filePathInCss.join(''))
                    }
                    downloadedFiles = [...downloadedFiles, ...newUrls]
                    return fs.writeFile(filePath, data)
                })
                .then(() => resolve(fixTheCssFiles(urls, ++index, downloadedFiles)))
                .catch(err => reject(err))
        } else
            resolve(downloadedFiles)
    })
}

function startDownload(pageUrl) {
    return new Promise((resolve, reject) => {
        let htmlData = `<? include 'data.php'; ?>`
        return getProjectName(pageUrl)
            .then(() => {
                console.log(`download main file : ${pageUrl}`)
                // if (projectName)
                //     return true
                // else
                return downloadFiles(pageUrl, projectPath, 'index.php')
            })
            .then(() => fs.readFile(path.join(projectPath, 'index.php')))
            .then(data => {
                const $ = cheerio.load(data + '');
                $('script').each(function () {
                    let src = $(this).attr("src");
                    if (!src)
                        $(this).remove()
                })
                let targetUrls = []
                $('a').each(function () {
                    let src = $(this).attr("href");
                    if (src === 'https://landin.ir')
                        $(this).remove()

                    let dataTargetUrl = $(this).attr("data-target-url");
                    if (dataTargetUrl)
                        targetUrls.push({from: src, to: dataTargetUrl})
                })
                htmlData += pretty($.html())

                for (let tu of targetUrls) {
                    htmlData = htmlData.replace(tu.from, tu.to)
                }
                allFiles = htmlData.match(urlExpression)
                allFiles = allFiles.map(a => {
                    let b = a.split('"')[0]
                    b = b.replace(/\)/g, '')
                    b = b.replace(/;/g, '')
                    return b
                })
                cssFiles = allFiles.filter(a => a.includes('.css')).map(c => {
                    c = URL.parse(c)
                    return c.path
                })
                cdnFiles = allFiles.filter(a => a.includes('cdn.lugc.link'))
                allFiles = allFiles.filter(a => a.includes('landingi.com'))
                // allFiles = allFiles.filter(a => a.includes('.css'))
                for (let f of allFiles) {
                    f = URL.parse(f)
                    htmlData = htmlData.replace(new RegExp(`${f.protocol}//${f.host}/`, 'g'), '<?=$baseUrl?>')
                }
                cdnFiles = cdnFiles.map((cf, i) => {
                    let url = URL.parse(cf)
                    let id = url.path.split('/-/')[0].split('/')[1]
                    let newUrl = cf.replace(cf, `<?=$baseUrl?>${id}/preview-${i}.png`)
                    htmlData = htmlData.replace(cf, newUrl)
                    cf += `preview-${i}.png`
                    return cf;
                })
                htmlData = htmlData.replace(/data-blink-src/g, `src`)
                // projectPath += "_1"
                return fs.writeFile(path.join(projectPath, 'index.php'), htmlData);
            })
            .then(() => fs.writeFile(path.join(projectPath, 'data.php'), `<? $baseUrl='${baseUrl}' ?>`))
            .then(() => downloadAllFiles(allFiles, 0))
            .then(() => fixTheCssFiles(cssFiles, 0))
            .then(filesInCss => downloadAllFiles(filesInCss, 0))
            .then(() => downloadAllFiles(cdnFiles, 0))
            .then(payload => resolve(payload))
            .catch(err => reject(err))
    })
}

startDownload(pageUrl)
    .then(() => {
        console.log(projectPath)
        console.log(`worker done : ${projectName}`)
    })
    .catch(err => console.error(err))
