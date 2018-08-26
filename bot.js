var Discord = require('discord.io');
var logger = require('winston');
var auth = require('./auth.json');
var rp = require('request-promise');
var tough = require('tough-cookie');
const cheerio = require('cheerio');

var msMinute = 60*1000;
var msHour = 60*60*1000;
// Set the session cookie
let cookie = new tough.Cookie({
	key: "M573SSID",
	value: "", // paste cookie value here
	domain: 'p.eagate.573.jp',
	httpOnly: true,
	maxAge: 31536000
});
var cookiejar = rp.jar();
cookiejar.setCookie(cookie, 'https://p.eagate.573.jp');

// Sets the options for the request
var options = {
	uri: `https://p.eagate.573.jp/game/ddr/ddra/p/rival/kensaku.html?mode=4&slot=`,
	jar: cookiejar,
	transform: function (body) {
		return cheerio.load(body);
	}
};
// Initial bootup
var date = new Date();
var firstRetrieval = true;
var playerNames = [];
var playerDates = [];
async function getData() {
	let result = await rp(options)
		.then(($) => {
			// Parses data
			for (var i = 1; i < $('.dancer_name').get().length - 10; i++) { // i = 1 because first value isn't a player name
				playerNames[i-1] = $('.dancer_name').eq(i).text();
				playerDates[i-1] = date;
				console.log('Boot success');
			}
			firstRetrieval = false;
		})
		.catch((err) => {
			console.log(err);
	});
}

// wtf is this
async function getCurrentData() {
	if (firstRetrieval) {
		getData();
		retrieveData();
	}
}

// Retrieves new data every minute
async function retrieveData() {
	var tempPlayerData = [];
	// Gets data
	let result = await rp(options)
		.then(($) => {
			// !! if someone logs in to another machine, they will still be on this list !!
			// if the first two players are different
			if (playerNames[0] !== $('.dancer_name').eq(1).text() && playerNames[0] !== $('.dancer_name').eq(2).text()) {
				var popIndex = 2; // popIndex indicates the number of times to call the pop() method
				// move player info 2 places down the arrays
				for (var i = playerNames.length; i > 0; i--) {
					playerNames[i+1] = playerNames[i-1];
					playerDates[i+1] = playerDates[i-1];
				}
				// add the new info to the beginning of the arrays
				playerNames[0] = $('.dancer_name').eq(1).text();
				playerNames[1] = $('.dancer_name').eq(2).text();
				playerDates[0] = new Date();
				playerDates[1] = new Date();
				// removes duplicates
				for (var i = 2; i < playerNames.length; i++) {
					if (playerNames[0] === playerNames[i]) {
						playerNames.splice(i, 1); // removes value of array at i
						playerDates.splice(i, 1);
						popIndex -= 1; // because one value was removed, the list needs to be shortened one less value
					}
					if (playerNames[1] === playerNames[i]) {
						playerNames.splice(i, 1);
						playerDates.splice(i, 1);
						popIndex -= 1;
					}
				}
				// removes players off the end of the list
				for (var i = 0; i < popIndex; i++) {
					playerNames.pop();
					playerDates.pop();
				}
				
			}
			// else, if the first player is different
			else if (playerNames[0] !== $('.dancer_name').eq(1).text()) {
				var popIndex = 1;
				// moves player info 1 place down each array
				for (var i = playerNames.length; i > 0; i--) {
					playerNames[i] = playerNames[i-1];
					playerDates[i] = playerDates[i-1];
				}
				// add the new info to the beginning of the arrays
				playerNames[0] = $('.dancer_name').eq(1).text();
				playerDates[0] = new Date();
				
				// removes duplicates
				for (var i = 1; i < playerNames.length; i++) {
					if (playerNames[0] === playerNames[i]) {
						playerNames.splice(i, 1); // removes value of array at i
						playerDates.splice(i, 1);
						popIndex -= 1; // because one value was removed, the list needs to be shortened one less value
					}
				}
				// removes players off the end of the list
				for (var i = 0; i < popIndex; i++) {
					playerNames.pop();
					playerDates.pop();
				}
			}
			console.log("Data received");
			setTimeout(retrieveData, 60000);
		}).catch((err) => {
			console.log(err);
	});
}

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
	colorize: true
});
logger.level = 'debug';

// Initialize Discord Bot
var bot = new Discord.Client({
	token: auth.token,
	autorun: true
});
bot.on('ready', function (evt) {
	logger.info('Connected');
	logger.info('Logged in as: ');
	logger.info(bot.username + ' - (' + bot.id + ')');
});
bot.on('message', function (user, userID, channelID, message, evt) {
	// Our bot needs to know if it will execute a command
	// It will listen for messages that will start with `!`
	if (message.substring(0, 1) == '!') {
		var args = message.substring(1).split(' ');
		var cmd = args[0];

		args = args.splice(1);
		switch(cmd) {
			// !ping
			case 'ping':
				var output = 'Times are given in PT\n';
				getCurrentData().then(() => {
					var currentTime = new Date();
					for (var i = 0; i < playerNames.length; i++) {
						output += playerNames[i] + ' - Last seen at ' + playerDates[i].toLocaleTimeString() 
								+ ' (' + Math.floor((currentTime - playerDates[i]) / msHour) + ' hour(s) and ' 
								+ Math.floor(((currentTime - playerDates[i]) % msHour) / msMinute)
								+  ' minute(s) ago)' + '\n';
					}
					bot.sendMessage({
						to: channelID,
						message: output
					});
				}).catch(err => {
					console.log(err);
				});
			break;
			// Just add any case commands if you want to..
		}
	}
});
