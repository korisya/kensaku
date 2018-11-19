var Discord = require('discord.js');
var rp = require('request-promise');
var tough = require('tough-cookie');
const cheerio = require('cheerio');
var fs = require('fs');

// -----------Remove if you want to paste the cookies and tokens into the code itself.-----------
console.log('Finding cookies and cream:');
var secrets = fs.readFileSync('secret.txt', {encoding: 'utf8'}).trim().split(' ');
console.log('cream: ' + secrets[0]);
for (var i = 1; i < secrets.length; i++)
	console.log('cookie ' + i + ': ' + secrets[i]);
// ----------------------------------------------------------------------------------------------

const msMinute = 60*1000;
const msHour = 60*60*1000;

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
	this.sandList = [];
	this.sandTime = [];

	this.getOutput = function () {
		var currentTime = new Date();
		var output = '';
		for (var i = 0; i < this.playerNames.length; i++) {
			for (var j = 0; j < this.sandList.length; j++) {
				if (this.sandList[j] === this.playerNames[i]) {
					var hr = Math.floor((currentTime - this.playerDates[i]) / msHour);
					var min = Math.floor(((currentTime - this.playerDates[i]) % msHour) / msMinute);

					output += this.playerNames[i]
					for (var k = this.playerNames[i].length; k < 8; k++)
						output += ' ';

					output += '   ' + this.sandTime[j].toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
					output += '   Seen ' + hr + 'h ' + min +  'm ago\n';
					break;
				}
			}
		}
		return output || ' ';
	};
}

// Gets initial data
async function getInitialData(loc) {
	await rp(loc.options)
		.then(($) => {
			var date = new Date();
			// Parses data
			for (var i = 1; i < $('.dancer_name').get().length; i++) { // i = 1 because first value isn't a player name
				loc.playerNames[i-1] = $('.dancer_name').eq(i).text();
				loc.playerDates[i-1] = date;
				console.log(loc.name + ': Player ' + i + ' received - ' + loc.playerNames[i-1]);
			}

			setTimeout(function() {
				retrieveData(loc) }, 60000);
		})
		.catch((err) => {
			console.log(err);
	});
}

// Retrieves new data every minute
async function retrieveData(loc) {
	var currentTime = new Date();
	if (currentTime.getHours() == 4 && loc.sandList.length != 0) {
		loc.sandList = [];
		loc.sandTime = [];
	}

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
				loc.playerDates[0] = currentTime;
				loc.playerDates[1] = currentTime;

				// checks if this is the start of a player's session. if true, initialize their start time
				var newSession0 = true, newSession1 = true;
				for (var j = 0; j < loc.sandList.length; j++) {
					if (loc.playerNames[0] === loc.sandList[j])
						newSession0 = false;
					else if (loc.playerNames[1] === loc.sandList[j])
						newSession1 = false;
				}
				if (newSession0) {
					loc.sandList[loc.sandList.length] = loc.playerNames[0];
					loc.sandTime[loc.sandTime.length] = currentTime;
				}
				if (newSession1) {
					loc.sandList[loc.sandList.length] = loc.playerNames[1];
					loc.sandTime[loc.sandTime.length] = currentTime;
				}

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
				loc.playerDates[0] = currentTime;

				// checks whether this is the start of a player's session. if true, appends them to sandList
				var newSession0 = true;
				for (var j = 0; j < loc.sandList.length; j++) {
					if (loc.playerNames[0] === loc.sandList[j]) {
						newSession0 = false;
						break;
					}
				}
				if (newSession0) {
					loc.sandList[loc.sandList.length] = loc.playerNames[0];
					loc.sandTime[loc.sandTime.length] = currentTime;
				}

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
var milpitas = new Location(secrets[1], "Milpitas"); // PASTE COOKIE HERE iF NOT USING secret.txt
var sanJoseJ = new Location(secrets[2], "San Jose J-Cab"); // PASTE COOKIE HERE iF NOT USING secret.txt
var sanJoseK = new Location(secrets[3], "San Jose K-Cab"); // PASTE COOKIE HERE iF NOT USING secret.txt
var dalyCity = new Location(secrets[4], "Daly City"); // PASTE COOKIE HERE iF NOT USING secret.txt
var concord = new Location(secrets[5], "Concord"); // PASTE COOKIE HERE iF NOT USING secret.txt

// Initialize Discord Bot
var bot = new Discord.Client();

bot.on('ready', () => {
	console.log('Connected');
	console.log(`Logged in as ${bot.user.tag}!`);
	console.log(bot.user.username + ' - (' + bot.user.id + ')');
	getInitialData(milpitas);
	getInitialData(sanJoseJ);
	getInitialData(sanJoseK);
	getInitialData(dalyCity);
	getInitialData(concord);
});

bot.on('message', message => {
	if (message.content.substring(0, 1) == '!') {
		var args = message.content.substring(1).split(' ');
		var cmd = args[0];
		var subcmd = args[1];
		var channel = message.channel.name;
		if (cmd === 'whose') {
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

bot.login(secrets[0]); // PASTE TOKEN HERE iF NOT USING secret.txt
