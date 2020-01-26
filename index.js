//Importing all required libraries for Discord, Showdown, and Google
const fs = require("fs");
const express = require("express");
const ws = require("ws");
const path = require("path");
const opn = require("open");
const axios = require("axios");
const Discord = require("discord.js");
const getUrls = require("get-urls");
const { google } = require("googleapis");

//Constants required to make the program work as intended
const plus = google.plus("v1");
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
const { psUsername, psPassword, botToken, api_key } = require("./config.json");

const keyfile = path.join(__dirname, "client_secret.json");
const keys = JSON.parse(fs.readFileSync(keyfile));
const scopes = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
    'https://www.googleapis.com/auth/spreadsheets',
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
app.get("/oauth2", (req, res) => {
    const code = req.query.code;
    client.getToken(code, (err, tokens) => {
        if (err) {
            console.error("Error getting oAuth tokens:");
            throw err;
        }
        client.setCredentials(tokens);
        res.send("Authentication successful! Please return to the console.");
        server.close();
    });
});
client.setCredentials()

const server = app.listen(3000, () => {
    // open the browser to the authorize url to start the workflow
    console.log(authorizeUrl);
    opn(authorizeUrl, { wait: false });
});

const bot = new Discord.Client({ disableEveryone: true });

//When the bot is connected and logged in to Discord
bot.on("ready", async() => {
    console.log(`${bot.user.username} is online!`);
    bot.user.setActivity(`PS battles`, { type: "watching" });
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
let players = [];
let battlelink = "";
let pokes1 = [];
let pokes2 = [];
let killer = "";
let victim = "";
let killJson = {};
let deathJson = {};
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
            let pokemon = parts[2].split(",")[0];
            if (parts[1] === "p1") pokes1.push(pokemon);
            else if (parts[1] === "p2") pokes2.push(pokemon);

            killJson[pokemon] = 0;
            deathJson[pokemon] = 0;
        } else if (linenew.startsWith("faint")) {
            if (parts[1].substring(0, 3) === "p1a") {
                killer = p2a;
                victim = p1a;
            } else {
                killer = p1a;
                victim = p2a;
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
            let winner = parts[1];
            console.log(`${winner} won!`);
            console.log("Battle link: ", battlelink);
            websocket.send(`${battlelink}|/savereplay`); //TODO finish this replay thing
            let loser = ((winner === players[players.length - 2]) ? players[players.length - 1] : players[players.length - 2]);
            console.log(`${loser} lost!`);

            //updating the google sheet accordingly
            let wintablenameArr = await getTableId(winner);
            let winSpreadsheetId = wintablenameArr[0];
            let winTableName = wintablenameArr[1];
            let winPokeInfo = await getPokemonInfo(winSpreadsheetId, winTableName);

            let losetablenameArr = await getTableId(loser);
            let loseSpreadsheetId = losetablenameArr[0];
            let loseTableName = losetablenameArr[1];
            let losePokeInfo = await getPokemonInfo(loseSpreadsheetId, loseTableName);

            //creating requests to update spreadsheet with new info
            let winRequest = {
                "spreadsheetId": winSpreadsheetId,
                "range": `${winTableName}!I14:O24`,
                "includeValuesInResponse": false,
                "responseValueRenderOption": "FORMATTED_VALUE",
                "valueInputOption": "USER_ENTERED",
                "resource": {
                    "range": `${winTableName}!I14:O24`,
                    "values": winPokeInfo.data.values
                },
                "auth": client
            };
            let loseRequest = {
                "spreadsheetId": loseSpreadsheetId,
                "range": `${loseTableName}!I14:O24`,
                "includeValuesInResponse": false,
                "responseValueRenderOption": "FORMATTED_VALUE",
                "valueInputOption": "USER_ENTERED",
                "resource": {
                    "range": `${loseTableName}!I14:O24`,
                    "values": losePokeInfo.data.values
                },
                "auth": client
            };
            console.log("winrequest before: ", winRequest.resource.values);
            console.log("loserequest before: ", loseRequest.resource.values);
            for (var i = 0; i < 10; i++) {
                let winPoke = winPokeInfo.data.values[i][1];
                let losePoke = losePokeInfo.data.values[i][1];
                //updating Games Played and Games Won
                if (winPoke in killJson || winPoke in deathJson) {
                    winRequest.resource.values[i][2] = (parseInt(winRequest.resource.values[i][2]) + 1).toString();
                }
                if (losePoke in killJson || losePoke in deathJson) {
                    loseRequest.resource.values[i][2] = (parseInt(loseRequest.resource.values[i][2]) + 1).toString();
                }

                //updating winner pokemon info
                if (killJson[winPoke] >= 0)
                    winRequest.resource.values[i][3] = (killJson[winPoke] + parseInt(winRequest.resource.values[i][3])).toString();
                if (deathJson[winPoke] >= 0)
                    winRequest.resource.values[i][4] = (deathJson[winPoke] + parseInt(winRequest.resource.values[i][4])).toString();
                //updating loser pokemon info
                if (killJson[losePoke] >= 0)
                    loseRequest.resource.values[i][3] = (killJson[losePoke] + parseInt(loseRequest.resource.values[i][3])).toString();
                if (deathJson[losePoke] >= 0)
                    loseRequest.resource.values[i][4] = (deathJson[losePoke] + parseInt(loseRequest.resource.values[i][4])).toString();
            }

            console.log("killjson: ", killJson);
            console.log("deathjson: ", deathJson);
            console.log("winrequest after: ", winRequest.resource.values);
            console.log("loserequest after: ", loseRequest.resource.values);
            //updating pokemon info
            let placholder1 = await updatePokemonInfo(winRequest);
            console.log("Winner update: ", placholder1);
            setTimeout(async function() {
                placholder1 = await updatePokemonInfo(loseRequest);
                console.log("Loser update: ", placholder1);
            }, (500));

            //resetting after every game
            dataArr = [];
            p1a = "";
            p2a = "";
            players = [];
            battlelink = "";
            pokes1 = [];
            pokes2 = [];
            killer = "";
            victim = "";
            killJson = {};
            deathJson = {};
        }
    }
});

//When a message gets sent on Discord in the channel
bot.on("message", async message => {
    let channel = message.channel;

    if (message.author.bot) return;

    let msgStr = message.content;
    let prefix = "porygon, use"

    if (channel.type === "dm") return;
    else if (
        channel.id === "670749899104452608" || //Div A
        channel.id === "670749918851366942" || //Div B
        channel.id === "670749945757827125" || //Div C
        channel.id === "670749964451840070"    //Div D
    ) {
        //separates given message into its parts
        let urls = Array.from(getUrls(msgStr)); //This is because getUrls returns a Set
        let battleLink = urls[0]; //http://sports.psim.us/battle-gen8legacynationaldex-17597 format

        //joins the battle linked
        if (battleLink) {
            channel.send(`Joining the battle...`);
            websocket.send(`|/join ${battleLink.substring(22)}`);
            channel.send(`Battle joined! Keeping track of the stats now.`);
            websocket.send(
                `${battleLink.substring(22)}|Battle joined! Keeping track of the stats now.`
            );
        }
    }

    //checks for help command
    if (msgStr.toLowerCase() === `${prefix} help`) {
        let bicon = bot.user.displayAvatarURL;
        let helpEmbed = new Discord.RichEmbed()
        .setTitle("Porygon Help")
        .setThumbnail(bicon)
        .setColor(0xffc0cb)
        .addField("Prefix", "Porygon, use ___")
        .addField("What does Porygon do? ", "It joins a Pokemon Showdown battle when the live battle link is sent to a dedicated channel and keeps track of the deaths/kills in the battle, updating a Stats Sheet at the end.")
        .addField("How do I use Porygon?", `Make a dedicated live-battle-links channel, let @harbar20#9389 know about all the detail he asks you, and that's it!`)
        .addField("Source", "https://github.com/harbar20/Porygon")
        .setFooter("Made by @harbar20#9389", `https://pm1.narvii.com/6568/c5817e2a693de0f2f3df4d47b0395be12c45edce_hq.jpg`);

        return channel.send(helpEmbed);
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

//Sheets
const sheets = google.sheets({
    version: 'v4',
    auth: api_key
});
async function getTableId(showdownName) {
    //"showdownName":"SHEETNAME"
    let aDiv = {
        "CheezitzZ": "MGM",
        "Chris_YGOPRO": "HHG",
        "ManciniTheAmazing": "ITL",
        "TheJerseyFitz": "TNT",
        "joe_pick": "TXA",
        "JoltsOfEnergy": "ADA",
        "Hylia Aria": "PIX",
        "Lunatic": "ACE",
        "Majoras_Mask4343": "LVN",
        "Kraknoix007": "PPC",
        "Skyquake29": "LCL",
        "stumbles23": "CLV",
        "the real fake josh": "LAJ",
        "TOOXIC860": "TTD",
        "yoPierre14": "EFC",
        "Kaitlyn74": "AOW"
    }
    let bDiv = {
        "PotatoZ4": "RWW",
        "Habaduh": "GBG",
        "x_x Insanity": "SCT",
        "Cradily26": "COL",
        "Jahken": "GWS",
        "The Rissoux": "OHM",
        "NathanDevious": "CHC",
        "Autumn Leavess": "MHR",
        "PikachuZappyZap": "SSH",
        "Risky Ricky": "GSG",
        "Fate LVL": "LVL",
        "Tourman": "TKK",
        "ShrekForSmash": "BUF",
        "xgamerpokestar": "NDS",
        "Zimziej": "RDR",
        "Long Island Lugias": "LIL"
    }
    let cDiv = {
        "Rufus 623": "ABA",
        "Etesian": "LCL",
        "GentlemanThomas97": "CHG",
        "Ultragoomba": "DDG",
        "SGS_Nim": "SSG",
        "TheHonch9": "CBL",
        "dont click forfeit": "NNK",
        "Coach Paddy": "III",
        "QwertyTurdy": "MLT",
        "RoseradeGod": "RVR",
        "Tax 3vasion": "DWD",
        "Ryan_Scar": "LOL",
        "DaStarfeeeeesh": "ONP",
        "Sacred Wings": "UUT",
        "Techno6377": "TXM",
        "VolsAreAwesome23": "CGB"
    }
    let dDiv = {
        "e24mcon": "BBP",
        "gannon223": "CBC",
        "umbreofxd": "NEE",
        "infernapeisawesome": "FSN",
        "Jeanmachine22": "OGG",
        "jeltevl": "BPT",
        "DeeColon": "GGZ",
        "KaiWhai": "LVL",
        "Mangle Faz": "GGR",
        "The Newkbomb": "BCB",
        "Apples in Angola": "KTK",
        "Pabloone": "OSD",
        "Ravens19": "CFF",
        "sacred_td": "LAD",
        "Hooyah Tark": "BSB",
        "Twigz11": "WCW"
    }

    //Getting player's Division & Table Name
    let tableName = "";
    let div = "";
    if (aDiv[showdownName]) {
        div = "a";
        tableName = aDiv[showdownName];
    }
    else if (bDiv[showdownName]) {
        div = "b";
        tableName = bDiv[showdownName];
    }
    else if (cDiv[showdownName]) {
        div = "c";
        tableName = cDiv[showdownName];
    }
    else if (dDiv[showdownName]) {
        div = "d";
        tableName = dDiv[showdownName];
    }
    else
        tableName = "Invalid Showdown Name";

    //Getting spreadsheetID    
    switch (div) {
        case "a":
            spreadsheetID = "12BIrC-qu-TdN7UkT39FqLbGEB9nJ1ViozaoLRCf3hjY";
        case "b":
            spreadsheetID = "1n5mHaL-T3tKTCtuqlldocOlacxun1yjsnw2gvNeO0l4";
        case "c":
            spreadsheetID = "1Mmg9b9bwvjS-73QUsBba11V6Whomv9CYcV5lE3kRSPU";
        case "d":
            spreadsheetID = "1Mmg9b9bwvjS-73QUsBba11V6Whomv9CYcV5lE3kRSPU";
        default:
            spreadsheetID = "Invalid Showdown Name";
    }
    
    return [spreadsheetID, tableName];
}

async function getPokemonInfo(spreadsheetId, tableName) {
    let request = {
        "auth": client,
        "spreadsheetId": spreadsheetId,
        "range": `${tableName}!I14:O24`
    }

    let pokemonJson = await new Promise((resolve, reject) => {
        sheets.spreadsheets.values.get(request, function(err, response) {
            if (err) {
                reject(err)
            } else {
                resolve(response)
            }
        });
    });

    return pokemonJson;
}

async function updatePokemonInfo(request) {
    let placeholder = await new Promise((resolve, reject) => {
        sheets.spreadsheets.values.update(request, function(err, response) {
            if (err) {
                reject(err)
            } else {
                resolve(response)
            }
        });
    });

    return placeholder;
}