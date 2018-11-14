var Discord = require('discord.io');
var logger = require('winston');
var auth = require('./auth.json');
var rp = require('request-promise');
var tough = require('tough-cookie');
const cheerio = require('cheerio');

var msMinute = 60*1000;
var msHour = 60*60*1000;
var date = new Date();

function Location (val, name) {
	this.name = name;
	this.cookie = new tough.Cookie({
		key: "M573SSID",
		value: val,
		domain: 'p.eagate.573.jp',
		httpOnly: true,
		maxAge: 31536000
	});
	this.cookiejar = rp.jar();
	this.cookiejar.setCookie(this.cookie, 'https://p.eagate.573.jp');
	this.options = {
		uri: `https://p.eagate.573.jp/game/ddr/ddra/p/rival/kensaku.html?mode=4&slot=`,
		jar: this.cookiejar,
		transform: function (body) {
			return cheerio.load(body);
	}};
	this.firstRetrieval = true;
	this.playerNames = [];
	this.playerDates = [];
	
	this.getOutput = function () {
		var currentTime = new Date();
		var output = 'Times are given in PT\n';
		for (var i = 0; i < this.playerNames.length; i++) {
			output += this.playerNames[i] + ' - Last seen at ' + this.playerDates[i].toLocaleTimeString() 
					+ ' (' + Math.floor((currentTime - this.playerDates[i]) / msHour) + ' hour(s) and ' 
					+ Math.floor(((currentTime - this.playerDates[i]) % msHour) / msMinute)
					+  ' minute(s) ago)' + '\n';
		}
		return output;
	};
}
//var milpitas = new Location(""); //paste cookie
var sanJoseJ = new Location("", "San Jose J-Cab"); //paste cookie
var sanJoseK = new Location("", "San Jose K-Cab"); //paste cookie

async function getData(loc) {
	let result = await rp(loc.options)
		.then(($) => {
			// Parses data
			for (var i = 1; i < $('.dancer_name').get().length - 10; i++) { // i = 1 because first value isn't a player name
				loc.playerNames[i-1] = $('.dancer_name').eq(i).text();
				loc.playerDates[i-1] = date;
				console.log(loc.name + ': Player ' + i + ' received');
			}
			loc.firstRetrieval = false;
			setTimeout(function() {
				retrieveData(loc) }, 60000);
		})
		.catch((err) => {
			console.log(err);
	});
}

// Retrieves new data every minute
async function retrieveData(loc) {
	// Gets data
	console.log(loc.name + ': Retrieving data...');
	let result = await rp(loc.options)
		.then(($) => {
			// !! if someone logs in to another machine, they will still be on this list !!
			// if the first two players are different
			if (loc.playerNames[0] !== $('.dancer_name').eq(1).text() && loc.playerNames[0] !== $('.dancer_name').eq(2).text()) {
				var popIndex = 2; // popIndex indicates the number of times to call the pop() method
				// move player info 2 places down the arrays
				for (var i = loc.playerNames.length; i > 0; i--) {
					loc.playerNames[i+1] = loc.playerNames[i-1];
					loc.playerDates[i+1] = loc.playerDates[i-1];
				}
				// add the new info to the beginning of the arrays
				loc.playerNames[0] = $('.dancer_name').eq(1).text();
				loc.playerNames[1] = $('.dancer_name').eq(2).text();
				loc.playerDates[0] = new Date();
				loc.playerDates[1] = new Date();
				// removes duplicates
				for (var i = 2; i < loc.playerNames.length; i++) {
					if (loc.playerNames[0] === loc.playerNames[i]) {
						loc.playerNames.splice(i, 1); // removes value of array at i
						loc.playerDates.splice(i, 1);
						popIndex -= 1; // because one value was removed, the list needs to be shortened one less value
					}
					if (loc.playerNames[1] === loc.playerNames[i]) {
						loc.playerNames.splice(i, 1);
						loc.playerDates.splice(i, 1);
						popIndex -= 1;
					}
				}
				// removes players off the end of the list
				for (var i = 0; i < popIndex; i++) {
					loc.playerNames.pop();
					loc.playerDates.pop();
				}
				
			}
			// else, if the first player is different
			else if (loc.playerNames[0] !== $('.dancer_name').eq(1).text()) {
				var popIndex = 1;
				// moves player info 1 place down each array
				for (var i = loc.playerNames.length; i > 0; i--) {
					loc.playerNames[i] = loc.playerNames[i-1];
					loc.playerDates[i] = loc.playerDates[i-1];
				}
				// add the new info to the beginning of the arrays
				loc.playerNames[0] = $('.dancer_name').eq(1).text();
				loc.playerDates[0] = new Date();
				
				// removes duplicates
				for (var i = 1; i < loc.playerNames.length; i++) {
					if (loc.playerNames[0] === loc.playerNames[i]) {
						loc.playerNames.splice(i, 1); // removes value of array at i
						loc.playerDates.splice(i, 1);
						popIndex -= 1; // because one value was removed, the list needs to be shortened one less value
					}
				}
				// removes players off the end of the list
				for (var i = 0; i < popIndex; i++) {
					loc.playerNames.pop();
					loc.playerDates.pop();
				}
			}
			console.log(loc.name + ": Data received");
			setTimeout(function() {
				retrieveData(loc) }, 60000);
		}).catch((err) => {
			console.log(err);
	});
}

// wtf is this
async function getCurrentData(loc) {
	if (loc.firstRetrieval) {
		getData(loc);
	}
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
	getCurrentData(sanJoseJ);
	getCurrentData(sanJoseK);
});
bot.on('message', function (user, userID, channelID, message, evt) {
	// Our bot needs to know if it will execute a command
	// It will listen for messages that will start with `!`
	if (message.substring(0, 1) == '!') {
		var args = message.substring(1).split(' ');
		var cmd = args[0];

		args = args.splice(1);
		switch(cmd) {
			/*
			case 'milpitas':
				var output = '';
				getCurrentData(milpitas).then(() => {
					output += milpitas.getOutput();
					bot.sendMessage({
						to: channelID,
						message: output
					}); 
					
				}).catch(err => {
					console.log(err);
				});
				break;*/
				
			case 'sanjosej':
				var output = '';
				getCurrentData(sanJoseJ).then(() => {
					output += sanJoseJ.getOutput();
					bot.sendMessage({
						to: channelID,
						message: output
					}); 
					
				}).catch(err => {
					console.log(err);
				});
				break;
			case 'sanjosek':
				var output = '';
				getCurrentData(sanJoseK).then(() => {
					output += sanJoseK.getOutput();
					bot.sendMessage({
						to: channelID,
						message: output
					}); 
					
				}).catch(err => {
					console.log(err);
				});
				break;
		}
	}
});
