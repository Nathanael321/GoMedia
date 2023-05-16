const portNumber = 8000;
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const app = express();

require("dotenv").config({ path: path.resolve(__dirname, 'credentialsDontPost/.env') }) 

const userName = process.env.MONGO_DB_USERNAME;
const password = process.env.MONGO_DB_PASSWORD;
const db = process.env.MONGO_DB_NAME;
const collection = process.env.MONGO_COLLECTION;
const databaseAndCollection = {db: db, collection: collection};

process.stdin.setEncoding("utf8");

if (process.argv.length != 2) {
    process.stdout.write(`Usage moviesAndTV.js\n`);
    process.exit(1);
}

console.log(`Web server started and running at http://localhost:${portNumber}`);
const prompt = "Stop to shutdown the server: ";
process.stdout.write(prompt);

process.stdin.on('readable', () => {  /* on equivalent to addEventListener */
	let dataInput = process.stdin.read();
	if (dataInput !== null) {
		let command = dataInput.trim();
		if (command === "stop") {
			console.log("Shutting down the server");
            process.exit(0);  /* exiting */
        } else {
			/* After invalid command, we cannot type anything else */
			console.log(`Invalid command: ${command}`);
		}

        process.stdout.write(prompt);
        process.stdin.resume();
    }
});

const { MongoClient, ServerApiVersion } = require('mongodb');
const { allowedNodeEnvironmentFlags } = require("process");
const { cannotHaveAUsernamePasswordPort } = require("whatwg-url");

async function main() {
    const uri = `mongodb+srv://${userName}:${password}@cluster0.daumvsc.mongodb.net/`;
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
    let user, imdbid, title;

    app.set("views", path.resolve(__dirname, "templates"));
    app.set("view engine", "ejs");

    try {
        await client.connect();

        app.use(express.static(__dirname));

        app.get("/", (request, response) => {
            user = undefined;
            const variables = {error: ""};
            response.render("index", variables);
        });

        app.get("/signup", (request, response) => {
            response.render("signup");
        });
        
        app.get("/account", (request, response) => {
            response.render("account");
        })

        app.use(bodyParser.urlencoded({extended:false}));

        app.post("/newFeed", async (request, response) => {
            let {firstname, username, password} = request.body;
            user = {
                username: username,
                password: password,
                firstname: firstname,
                favorites: {}
            };

            const variables = {
                name: firstname,
                feed: ""
            }

            await insertUser(client, databaseAndCollection, user);

            response.render("feed", variables);
        });

        app.get("/feed", async (request, response) => {
            
            if (user) {
                const favoritesFeed = Object.keys(user.favorites).length > 0 ? displayFavorites(user.favorites) : "";
                const variables = {
                    name: user.firstname,
                    feed: favoritesFeed
                };

                response.render("feed", variables);
            } else {
                const variables = {error: "<p style='color:red;'>Error: Please enter a valid username and password</p>"};
                response.render("index", variables);
            }
            
        });

        app.post("/feed", async (request, response) => {
            let {username, password, favorite} = request.body;

            if (!user) {
                user = await lookUpUser(client, databaseAndCollection, username, password);
            }
            if (user) {

                if (favorite) {
                    user.favorites[imdbid] = title;
                    let newValues = {favorites: user.favorites};
                    await addFavorite(client, databaseAndCollection, user.username, newValues);
                } else {
                    delete user.favorites[imdbid];
                }

                const favoritesFeed = Object.keys(user.favorites).length > 0 ? displayFavorites(user.favorites) : "";
                const variables = {
                    name: user.firstname,
                    feed: favoritesFeed
                };

                response.render("feed", variables);
            } else {
                const variables = {error: "<p style='color:red;'>Error: Please enter a valid username and password</p>"};
                response.render("index", variables);
            }
            
        });

        app.post("/searchFeed", async (request, response) => {
            let {search} = request.body;

            const apiResult = await searchMedia(search);
            const allMedia = searchResults(apiResult);
            const table = display(allMedia);

            const variables = {
                name: user.firstname,
                feed: table
            };

            response.render("feed", variables);
        });

        app.get("/searchFeed/:imdbid", async (request, response) => {
            imdbid = request.params.imdbid;
            const mediaInfo = await getMedia(imdbid);
            title = mediaInfo.title;

            // CSS Requirement
            const poster = `<img src=${mediaInfo.poster} style="width:300px;height:auto;">`
            const checkbox = user.favorites.hasOwnProperty(imdbid) ? '<input type="checkbox" name="favorite" checked>' : '<input type="checkbox" name="favorite">'
            const variables = {
                title: mediaInfo.title,
                poster: poster,
                released: mediaInfo.released,
                description: mediaInfo.description,
                checkbox: checkbox
            }

            response.render("displayMedia", variables);
        });

        app.post("/delete", async (request, response) => {
            const result = await deleteUser(client, databaseAndCollection, user.username);

            const variables = {
                username: user.username
            };

            response.render("userRemoved", variables);
        });

        app.listen(portNumber); 
    } catch (e) {

    }
}

async function insertUser(client, databaseAndCollection, newUser) {
    const result = await client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).insertOne(newUser);
}

async function lookUpUser(client, databaseAndCollection, username, password) {
    let filter = {username: username, password: password};
    const result = await client.db(databaseAndCollection.db)
                        .collection(databaseAndCollection.collection)
                        .findOne(filter);

   return result;
}

async function deleteUser(client, databaseAndCollection, targetName) {
    let filter = {username: targetName};
    const result = await client.db(databaseAndCollection.db)
                   .collection(databaseAndCollection.collection)
                   .deleteOne(filter);
    
}

async function addFavorite(client, databaseAndCollection, targetName, newValues) {
    let filter = {username : targetName};
    let update = { $set: newValues };

    const result = await client.db(databaseAndCollection.db)
    .collection(databaseAndCollection.collection)
    .updateOne(filter, update);

}
 
async function searchMedia(title) {
    const url = `https://mdblist.p.rapidapi.com/?s=${title}`;
    const options = {
        method: 'GET',
        headers: {
            'X-RapidAPI-Key': '0dae259212msh70a0c4f2f178157p144489jsn21f0b3f91a1a',
            'X-RapidAPI-Host': 'mdblist.p.rapidapi.com'
        }
    };

    try {
        const res = await fetch(url, options);
        const result = await res.json();
        return result.search;
    } catch (e) {
        console.error(e);
    }
}

async function getMedia(imdbid) {
    const url = `https://mdblist.p.rapidapi.com/?i=${imdbid}`;
    const options = {
    method: 'GET',
    headers: {
        'X-RapidAPI-Key': '0dae259212msh70a0c4f2f178157p144489jsn21f0b3f91a1a',
        'X-RapidAPI-Host': 'mdblist.p.rapidapi.com'
    }
    };

    try {
        const response = await fetch(url, options);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error(error);
    }
}

function searchResults(jsonArr) {
    let result = [];
    for (let media of jsonArr) {
        const currMedia = {
            title: media.title,
            score: media.score_average,
            imdbid: media.imdbid
        };

        result.push(JSON.stringify(currMedia));
    }

    return result;
}

function display(search) {
    let result = "<table border='1'><tr><th>Rank</th><th>Title</th><th>Average Rating</th></tr>";
    let rank = 1;
    for (let media of search) {
        media = JSON.parse(media);

        const titleLink = `<a href="/searchFeed/${media.imdbid}">${media.title}</a> `
        result += `<tr><td>${rank}</td><td>${titleLink}</td><td>${media.score}</td>`;
        rank++;
    }

    return result += "</table>";
}

function displayFavorites(faves) {
    let result = "<table border='1'><tr><th>Rank</th><th>Title</th></tr>";
    let rank = 1;
    for (let imdbid in faves) {
        // let media = await getMedia(imdbid);
        // console.log(`${imdbid}: ${media.title||media.message}`);
        // media = JSON.parse(media);

        const titleLink = `<a href="/searchFeed/${imdbid}">${faves[imdbid]}</a> `
        result += `<tr><td>${rank}</td><td>${titleLink}</td>`;
        rank++;
    }

    return result += "</table>";
}

main().catch(console.error);