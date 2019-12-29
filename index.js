//Importing all required libraries for Discord, Showdown, and Google
const fs = require("fs");
const request = require("request");
const express = require("express");
const ws = require("ws");
const path = require("path");
const http = require("http");
const url = require("url");
const opn = require("open");
const axios = require("axios");
const destroyer = require("server-destroy");
const Discord = require("discord.js");
const getUrls = require("get-urls");

//Constants required to make the program work as intended
const {google} = require("googleapis");
const plus = google.plus("v1");
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
const {psUsername, psPassword, botToken} = require("./config.json");

const keyfile = path.join(__dirname, "client_secret.json");
const keys = JSON.parse(fs.readFileSync(keyfile));
const scopes = [
    'https://www.googleapis.com/auth/spreadsheets'
];

// Create an oAuth2 client to authorize the API call
const client = new google.auth.OAuth2(
    keys.web.client_id,
    keys.web.client_secret,
    keys.web.redirect_uris[0]
);

// Generate the url that will be used for authorization
let authorizeUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: scopes
});

// Open an http server to accept the oauth callback. In this
// simple example, the only request to our webserver is to
// /oauth2callback?code=<code>
const app = express();
app.get("/oauth2callback", (req, res) => {
    const code = req.query.code;
    client.getToken(code, (err, tokens) => {
        if (err) {
            console.error("Error getting oAuth tokens:");
            throw err;
        }
        client.credentials = tokens;
        res.send("Authentication successful! Please return to the console.");
        server.close();
        //listMajors(client); is an example of how you'd call the actual sheets function
    });
});

const server = app.listen(3000, () => {
    // open the browser to the authorize url to start the workflow
    opn(authorizeUrl, { wait: false });
});

const bot = new Discord.Client({disableEveryone: true});

//When the bot is connected and logged in to Discord
bot.on("ready", async () => {
	console.log(`${bot.user.username} is online!`);
	bot.user.setActivity(`PS battles`, {type: "watching"});
});

//This is connection code to the PS server.
const websocket = new ws("ws://34.222.148.43:8000/showdown/websocket");
console.log("Server started!");

//When the server has connected
websocket.on("open", function open() {
	console.log("Server connected!");
});

//This is an array filled with all the data sent to me by the server since the bot has last been started
let dataArr = [];
let p1a = "";
let p2a = "";
let killstreak = [];
let battlelink = "";
//when the websocket sends a message
websocket.on("message", async function incoming(data) {
	let realdata = data.split("\n");

	//stuff to do after server connects
	if (data.startsWith("|challstr|")) {
		let nonce = data.substring(10);
		let assertion = await login(nonce);
		//logs in
		websocket.send(`|/trn iGLBot,128,${assertion}|`);
    }

	let players = [];
	let pokes1 = [];
	let pokes2 = [];
	let killer = "";
	let victim = "";
    let winner = "";
    let killJson = {};
    let deathJson = {};
    //removing the `-supereffective` line if it exists in realdata
    for (let element of realdata) {
        if (element.startsWith(`|-supereffective|`)) {
            realdata.splice(realdata.indexOf(element), 1);
        }
    }
    //going through each line in realdata
	for (let line of realdata) {
		dataArr.push(line);
		let linenew = line.substring(1);
        let parts = linenew.split("|");

        if (line.startsWith(`battle`))
            battlelink = line;
        
        else if (linenew.startsWith(`switch`)) {
            console.log("SWITCH HERE ")
            if (linenew.includes("p1a")) p1a = parts[2].split(",")[0];
            else if (linenew.includes("p2a")) p2a = parts[2].split(",")[0];
        }

		//|player|p2|infernapeisawesome|1|
		else if (linenew.startsWith(`player`)) {
			players.push(parts[2]);
			console.log("Players: " + players);
		}

		//|poke|p1|Hatterene, F|
		else if (linenew.startsWith(`poke`)) {
			if (parts[1] === "p1") pokes1.push(parts[2]);
			else if (parts[1] === "p2") pokes2.push(parts[2]);

			console.log("Pokes1: " + pokes1);
			console.log("Pokes2: " + pokes2);
        } 
        else if (linenew.startsWith("faint")) {
            if (parts[1].substring(0, 3) === "p1a") {
                killer = p2a;
                victim = parts[1].substring(5,);
            }
            else {
                killer = p1a;
                victim = parts[1].substring(5,);
            }
            
            console.log(`${killer} killed ${victim}`);
            //updating killer info in the JSON
            if (!killJson[killer]) 
                killJson[killer] = 1;
            else 
                killJson[killer]++;
            //updating victim info in the JSON
            if (!deathJson[victim]) 
                deathJson[victim] = 1;
            else 
                deathJson[victim]++;
		}

		//|win|infernapeisawesome
		else if (linenew.startsWith(`win`)) {
			winner = parts[1];
            console.log(winner + " won!");
            websocket.send(`/leave ${battlelink}`);
            let loser = winner === players[0] ? players[1] : players[2];

            //updating the google sheet accordingly
            let winSpreadsheetId, winTableName = getTableId(winner);
            let winPokeInfo = getPokemonInfo(winSpreadsheetId, winTableName);
            let loseSpreadsheetId, loseTableName = getTableId(loser);
            let losePokeInfo = getPokemonInfo(loseSpreadsheetId, loseTableName);

            //creating requests to update spreadsheet with new info
            let winRequest = {
                "spreadsheetId": winSpreadsheetId,
                "range": `${winTableName}!C9:I19`,
                "includeValuesInResponse": false,
                "responseValueRenderOption": "FORMATTED_VALUE",
                "valueInputOption": "USER_ENTERED",
                "resource": {
                    "range": `${winTableName}!C9:I19`,
                    "values": winPokeInfo.values
                }
            }
            let loseRequest = {
                "spreadsheetId": loseSpreadsheetId,
                "range": `${loseTableName}!C9:I19`,
                "includeValuesInResponse": false,
                "responseValueRenderOption": "FORMATTED_VALUE",
                "valueInputOption": "USER_ENTERED",
                "resource": {
                    "range": `${loseTableName}!C9:I19`,
                    "values": losePokeInfo.values
                }
            }
            for (let i = 0; i < 10; i++) {
                //updating winner pokemon info
                winRequest.resource.values[i][5] += killJson[winPokeInfo.values[i][0]];
                winRequest.resource.values[i][6] += deathJson[winPokeInfo.values[i][0]];
                //updating loser pokemon info
                loseRequest.resource.values[i][5] += killJson[losePokeInfo.values[i][0]];
                loseRequest.resource.values[i][6] += deathJson[losePokeInfo.values[i][0]];
            }

            //updating pokemon info
            updatePokemonInfo(winRequest);
            updatePokemonInfo(loseRequest);

            //resetting after every game
			dataArr = [];
            statusArr = [];
            killstreak = [];
            battlelink = "";
		}
	}
});

//When a message gets sent on Discord in the channel
bot.on("message", async message => {
	let channel = message.channel;

	if (message.author.bot) return;

	if (channel.type === "dm") return;
	else if (
		channel.id === "658057669617254411" ||
		channel.id === "658058064154329089" ||
		channel.id === "657647109926813708"
	) {
		//separates given message into its parts
		let msgStr = message.content;
		let urls = Array.from(getUrls(msgStr)); //This is because getUrls returns a Set
		let battleLink = urls[0]; //http://sports.psim.us/battle-gen8legacynationaldex-17597 format

		//joins the battle linked
		channel.send(`Joining the battle...`);
		websocket.send(`|/join ${battleLink.substring(22)}`);
		channel.send(`Battle joined! Keeping track of the stats now.`);
		websocket.send(
			`${battleLink.substring(22)}|Battle joined! Keeping track of the stats now.`
		);
	}
});
//making the bot login
bot.login(botToken);

async function login(nonce) {
	let psUrl = "https://play.pokemonshowdown.com/action.php";
	let data = {
		act: "login",
		name: psUsername,
		pass: psPassword,
		challstr: nonce
	};

	let response = await axios.post(psUrl, data);
	let json = JSON.parse(response.data.substring(1));
	console.log("Logged in to PS.");
	return json.assertion;
}

//Sheets function to do TODO something or other
const sheets = google.sheets({
    version: 'v4',
    auth: client
});
function getTableId(showdownName) {
    //"showdownName":"SHEETNAME"
    const majors = {
        "beastnugget35":"DS",
        "e24mcon":"BBP",
        "Killer Mojo":"LLL",
        "JDMR98":"JDMR",
        "SpooksLite":"DTD",
        "Talal_23":"SoF",
        "I am TheDudest":"TDD",
        "M UpSideDown W":"USD",
        "CinnabarCyndaquil":"CCQ",
        "pop5isaac":"ELA",
        "Vienna Vullabies":"VVB",
        "tiep123":"ORR",
        "LimitBroke":"MCM",
        "a7x2567":"NYP",
        "jelani":"Lani",
        "pickle brine":"PPK"
    }
    const minors = {
        "GableGames":"MWM",
        "russian runerussia":"RRG",
        "Fate LVL":"LVL",
        "Aaron12pkmn":"LSS",
        "Wolf iGL":"CKM",
        "JonnyGoldApple":"UUB",
        "mexicanshyguy":"ARD",
        "SnooZEA":"DDL",
        "joey34":"DSY",
        "Gen 4 Elitist":"G4E",
        "HalluNasty":"KCC",
        "Hi I'm WoW":"WOW",
        "ChampionDragonites":"ETD",
        "infernapeisawesome":"SSR",
        "metsrule97":"HT",
        "Darkkstar":"BBF",
        "Dominicann":"MMT",
        "RetroLikesMemes":"GRG"
    }
    //finding out the name of the Table as well as if the league is Minors or Majors
    let tableName = "";
    let isMajor = false;
    if (majors[showdownName]) {
        isMajor = true;
        tableName = majors[showdownName];
    }
    else if (minors[showdownName]) {
        isMajor = false;
        tableName = minors[showdownName];
    }
    else {
        return "Invalid Showdown name";
    }

    //Gets info about the sheet
    let spreadsheetId = `${isMajor ? "1Z0lFg8MFYONpMLia1jrAv9LC5MSJOJByRs3LDKxV0eI" : "1U85VJem_HDDXNCTB8954R1oCs9-ls6W0Micn2q6P-kE"}`;
    return tableName, spreadsheetId;
}

function getPokemonInfo(spreadsheetId, tableName) {
    let request = {
        "spreadsheetId": spreadsheetId,
        "range": `${tableName}!C9:I19`,
        "valueRenderOption": "UNFORMATTED_VALUE",
        "auth": client
    }
    let pokemonJson = sheets.spreadsheets.values.get(request, function(err, response) {
        console.log("Response", response);
        console.error("Execute error", err); 
    });
    
    return pokemonJson;
}

function updatePokemonInfo(request) {
    sheets.spreadsheets.values.update(request, function(err, response) {
        console.log("Response", response);
        console.error("Execute error", err); 
    });
}