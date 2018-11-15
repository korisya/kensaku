var Discord = require('discord.js');
var rp = require('request-promise');
var tough = require('tough-cookie');
const cheerio = require('cheerio');

var msMinute = 60*1000;
var msHour = 60*60*1000;
var date = new Date();
date.setHours(date.getHours() - 16);

// Constructor for locations
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

	this.playerNames = [];
	this.playerDates = [];

	this.getOutput = function () {
		var currentTime = new Date();
		var output = '';
		for (var i = 0; i < this.playerNames.length; i++) {
			var hr = Math.floor((currentTime - this.playerDates[i]) / msHour);
			var min = Math.floor(((currentTime - this.playerDates[i]) % msHour) / msMinute);
			if (hr <= 15) {
				output += this.playerNames[i]
				for (var j = this.playerNames[i].length; j < 8; j++)
					output += ' ';
				output += '              (' + hr + 'h ' + min +  'm)' + '\n';
			}
		}
		return output || ' ';
	};
}

// Gets initial data
async function getInitialData(loc) {
	await rp(loc.options)
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
	console.log(loc.name + ': Retrieving data...');
	await rp(loc.options)
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

// Returns a random message from Rinon!
function getRinonMesssage() {
	var roll = Math.floor(Math.random() * 4);
	var msg;
	switch(roll) {
		case 0:
			msg = "UwU お帰りなさい、ご主人様。これが検索の結果です~";
			break;
		case 1:
			msg = "え…えっ？検索結果を見せてほしい？そ…そんな…恥ずかしいよ…"
			break;
		case 2:
			msg = "お帰り、お兄ちゃん！ご飯にする？お風呂にする？それとも…　け　ん　さ　く　の　け　っ　か"
			break;
		case 3:
			msg = "あ、そうですか。検索結果を見たいですか。見せてあげるわ。"
			break;
	}
	return msg;
}


// Initalize locations
var milpitas = new Location("", "Milpitas"); // PASTE COOKIE HERE
var sanJoseJ = new Location("", "San Jose J-Cab"); // PASTE COOKIE HERE
var sanJoseK = new Location("", "San Jose K-Cab"); // PASTE COOKIE HERE
var dalyCity = new Location("", "Daly City"); // PASTE COOKIE HERE
var concord = new Location("", "Concord"); // PASTE COOKIE HERE

// Initialize Discord Bot
var bot = new Discord.Client();

bot.on('ready', () => {
	console.log('Connected');
	console.log(`Logged in as ${bot.user.tag}!`);
	console.log(bot.user.username + ' - (' + bot.user.id + ')');
	getInitialData(sanJoseJ);
	getInitialData(sanJoseK);
	getInitialData(milpitas);
	getInitialData(dalyCity);
	getInitialData(concord);
});

bot.on('message', message => {
	if (message.content.substring(0, 1) == '!') {
		var args = message.content.substring(1).split(' ');
		var cmd = args[0];
		var subcmd = args[1];
		var channel = message.channel.name;
		if(cmd === 'whose') {
			switch (channel) {
				case 'dnb-milpitas':
					message.channel.send({embed:{
						title: milpitas.name,
						description: getRinonMesssage() + "\n```" + milpitas.getOutput() + "```",
						color: 0xFFFFFF,
						timestamp: new Date()
					}});
					break;
				case 'dnb-dalycity':
					message.channel.send({embed:{
						title: dalyCity.name,
						description: getRinonMesssage() + "\n```" + dalyCity.getOutput() + "```",
						color: 0xFFFFFF,
						timestamp: new Date()
					}});
					break;
				case 'round1-concord':
					message.channel.send({embed:{
						title: concord.name,
						description: getRinonMesssage() + "\n```" + concord.getOutput() + "```",
						color: 0xFFFFFF,
						timestamp: new Date()
					}});
					break;
				case 'round1-sanjose':
					switch (subcmd) {
						case 'jcab':
						case 'j':
							message.channel.send({embed:{
								title: sanJoseJ.name,
								description: getRinonMesssage() + "\n```" + sanJoseJ.getOutput() + "```",
								color: 0xFFFFFF,
								timestamp: new Date()
							}});
							break;
						case 'kcab':
						case 'k':
							message.channel.send({embed:{
								title: sanJoseK.name,
								description: getRinonMesssage() + "\n```" + sanJoseK.getOutput() + "```",
								color: 0xFFFFFF,
								timestamp: new Date()
							}});
							break;
					}
					break;
			}
		}
	}
});

bot.login(''); // PASTE TOKEN HERE
