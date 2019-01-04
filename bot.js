var Discord = require('discord.js');
var rp = require('request-promise');
var tough = require('tough-cookie');
const cheerio = require('cheerio');
require('http').createServer().listen(3000);
require('dotenv').config();

const msMinute = 60*1000;
const msHour = 60*60*1000;

// Constructor for Players
function Player (dancerName, ddrCode, locName) {
	this.name = dancerName;
	this.ddrCode = ddrCode;

	this.firstTime = new Date();
	this.lastTime = new Date();

	this.location = locName;

	this.toLocaleString = function () {
		return this.name + ' ' + this.ddrCode;
	};
}

// Constructor for cabs
function Cab (cookie) {
	this.players = [];
	this.newPlayers = [];
	this.cookie = new tough.Cookie({
		key: "M573SSID",
		value: cookie,
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
	this.prunedPlayers = 0;
}
// Constructor for locations
function Location (cabs, name) {
	this.name = name;
	this.cabs = cabs;
	this.todaysPlayers = [];

	this.getOutput = function () {
		var currentTime = new Date();
		var output = '';
		for (var i = 0; i < this.todaysPlayers.length; i++) {
			var hr = Math.floor((currentTime - this.todaysPlayers[i].lastTime) / msHour);
			var min = Math.floor(((currentTime - this.todaysPlayers[i].lastTime) % msHour) / msMinute);

			if (hr < 2) {
				output += this.todaysPlayers[i].name;
				for (var k = this.todaysPlayers[i].name.length; k < 8; k++)
					output += ' ';

				output += '   ' + this.todaysPlayers[i].firstTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', timeZone: 'America/Los_Angeles'});
				output += '   Seen ' + hr + 'h ' + min +  'm ago\n';
			}
		}
		return output || ' ';
	};

	this.getAll = function () {
		var currentTime = new Date();
		var output = '';
		for (var i = 0; i < this.todaysPlayers.length; i++) {
			var hr = Math.floor((this.todaysPlayers[i].lastTime - this.todaysPlayers[i].firstTime) / msHour);
			var min = Math.floor(((this.todaysPlayers[i].lastTime - this.todaysPlayers[i].firstTime) % msHour) / msMinute);

			output += this.todaysPlayers[i].name;
			for (var k = this.todaysPlayers[i].name.length; k < 8; k++)
				output += ' ';

			output += '   ' + this.todaysPlayers[i].firstTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', timeZone: 'America/Los_Angeles'});
			output += ' - ' + this.todaysPlayers[i].lastTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', timeZone: 'America/Los_Angeles'});
			output += '   (' + hr + 'h ' + min + 'm)\n';
		}
		return output || ' ';
	};
}

// Gets initial data
async function getInitialData(loc) {
	loc.cabs.forEach(async function(cab) {
		await rp(cab.options).then(($) => {
				// Parses data
				for (var i = 1; i < $('.dancer_name').get().length - 13; i++) { // i = 1 because first value isn't a player name
					cab.players[i-1] = new Player($('.dancer_name').eq(i).text(), $('.code').eq(i).text(), loc.name);
					console.log('--> ' + loc.name + ': Player ' + i + ' received - ' + cab.players[i-1].toLocaleString());
				}
			}).catch((err) => {
				console.log('--> Failed to get initial data. Restart the bot.')
				throw err;
		});
	});
	setTimeout(function() {
		retrieveData(loc)
	}, 60000);
}

// Retrieves new data every minute
async function retrieveData(loc) {
	var currentTime = new Date();
	if (currentTime.getHours() == 12 && loc.todaysPlayers.length != 0) {
		loc.todaysPlayers = [];
	}

	console.log('--> ' + loc.name + ': Retrieving data...');

	for (var i = 0; i < loc.cabs.length; i++) {
		await rp(loc.cabs[i].options).then(($) => {
			if ($('.dancer_name').eq(1).text() === '' || $('.dancer_name').eq(2).text() === '') {
				console.log('--> ' + loc.name + ': Ghosts appeared. Spooky af :monkaPrim:');
			} else {
				loc.cabs[i].newPlayers[0] = new Player($('.dancer_name').eq(1).text(), $('.code').eq(1).text(), loc.name);
				loc.cabs[i].newPlayers[1] = new Player($('.dancer_name').eq(2).text(), $('.code').eq(2).text(), loc.name);
				console.log('--> ' + loc.name + ': Data received @cab' + (i + 1) + '\n\t> ' + loc.cabs[i].newPlayers.toLocaleString());
			}
		}).catch((err) => {
			console.log(err);
			console.log('\n@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n--> Failed to retrieve data. @' + loc.name + '\n@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n');
		});
	}

	loc.cabs.forEach(function(cab1) {
		loc.cabs.forEach(function(cab2) {
			if (cab1 !== cab2) {
				cab1.newPlayers.forEach(function(newPlayer) {
					var foundPlayer = cab2.players.find(function(player) {
						return player.ddrCode === newPlayer.ddrCode;
					});
					if (foundPlayer) {
						console.log('--> ' + loc.name + ': stop switching cabs pls, ' + foundPlayer.toLocaleString());
						cab2.players.splice(cab2.players.indexOf(foundPlayer), 1);
						cab2.prunedPlayers++;
					}
				});
			}
		});
	});
	loc.cabs.forEach(function(cab) {
		// if the previous first player shifted down a spot
		if (cab.players[0].ddrCode !== cab.newPlayers[0].ddrCode && cab.players[0].ddrCode === cab.newPlayers[1].ddrCode) {
			var incomingPlayer = cab.newPlayers[0];

			// Check for duplicates
			var foundPlayer = cab.players.find(function(player) {
				return player.ddrCode === incomingPlayer.ddrCode;
			});
			console.log('--> ' + loc.name + ': cab.players before: ' + cab.players.toLocaleString());
			// if duplicate, remove and unshift. else unshift and pop
			if (foundPlayer) {
				cab.players.splice(cab.players.indexOf(foundPlayer), 1);
				cab.players.unshift(incomingPlayer);
			} else {
				cab.players.unshift(incomingPlayer);
				if (cab.prunedPlayers > 0) {
					cab.prunedPlayers--;
				} else {
					cab.players.pop();
				}
			}
			console.log('--> ' + loc.name + ': cab.players after: ' + cab.players.toLocaleString());

			// find out if the player is on today's list
			var foundTodaysPlayer = loc.todaysPlayers.find(function(player) {
				return player.ddrCode === incomingPlayer.ddrCode;
			});

			// if duplicate, remove and unshift. else unshift
			if (foundTodaysPlayer) {
				incomingPlayer.firstTime = foundTodaysPlayer.firstTime;
				loc.todaysPlayers.splice(loc.todaysPlayers.indexOf(foundTodaysPlayer), 1);
				loc.todaysPlayers.unshift(incomingPlayer);
			} else {
				loc.todaysPlayers.unshift(incomingPlayer);
				pingChannel('+ ' + incomingPlayer.name + '    ' + incomingPlayer.ddrCode, loc.name);
				console.log('\t> @' + loc.name + ': + ' + incomingPlayer.toLocaleString());
			}
			// how are we going to get total session times? yay now it's ez
		} // else, if the first two players are different in any way
		else if (!(cab.players[0].ddrCode === cab.newPlayers[0].ddrCode && cab.players[1].ddrCode === cab.newPlayers[1].ddrCode)) {

			var incomingPlayer0 = cab.newPlayers[0];
			var incomingPlayer1 = cab.newPlayers[1];

			var foundPlayer0 = cab.players.find(function(player) {
				return player.ddrCode === incomingPlayer0.ddrCode;
			});
			var foundPlayer1 = cab.players.find(function(player) {
				return player.ddrCode === incomingPlayer1.ddrCode;
			});

			console.log('--> ' + loc.name + ': cab.players before: ' + cab.players.toLocaleString());
			if (foundPlayer1) {
				cab.players.splice(cab.players.indexOf(foundPlayer1), 1);
				cab.players.unshift(incomingPlayer1);
			} else {
				cab.players.unshift(incomingPlayer1);
				if (cab.prunedPlayers > 0) {
					cab.prunedPlayers--;
				} else {
					cab.players.pop();
				}
			}
			if (foundPlayer0) {
				cab.players.splice(cab.players.indexOf(foundPlayer0), 1);
				cab.players.unshift(incomingPlayer0);
			} else {
				cab.players.unshift(incomingPlayer0);
				if (cab.prunedPlayers > 0) {
					cab.prunedPlayers--;
				} else {
					cab.players.pop();
				}
			}
			console.log('--> ' + loc.name + ': cab.players after: ' + cab.players.toLocaleString());

			var foundTodaysPlayer0 = loc.todaysPlayers.find(function(player) {
				return player.ddrCode === incomingPlayer0.ddrCode;
			});
			var foundTodaysPlayer1 = loc.todaysPlayers.find(function(player) {
				return player.ddrCode === incomingPlayer1.ddrCode;
			});

			var str = '';
			if (foundTodaysPlayer1) {
				incomingPlayer1.firstTime = foundTodaysPlayer1.firstTime;
				loc.todaysPlayers.splice(loc.todaysPlayers.indexOf(foundTodaysPlayer1), 1);
				loc.todaysPlayers.unshift(incomingPlayer1);
			} else {
				loc.todaysPlayers.unshift(incomingPlayer1);
				str += '+ ' + incomingPlayer1.name + '    ' + incomingPlayer1.ddrCode;
				console.log('\t> @' + loc.name + ': + ' + incomingPlayer1.toLocaleString());
			}

			if (foundTodaysPlayer0) {
				incomingPlayer0.firstTime = foundTodaysPlayer0.firstTime;
				loc.todaysPlayers.splice(loc.todaysPlayers.indexOf(foundTodaysPlayer0), 1);
				loc.todaysPlayers.unshift(incomingPlayer0);
			} else {
				loc.todaysPlayers.unshift(incomingPlayer0);
				str += '\n+ ' + incomingPlayer0.name + '    ' + incomingPlayer0.ddrCode;
				console.log('\t> @' + loc.name + ': + ' + incomingPlayer0.toLocaleString());
			}

			if (str !== '') pingChannel(str, loc.name)
		}
	});
	setTimeout(function() {
		retrieveData(loc)
	}, 60000);
}

// Returns a random message from Rinon!
function getRinonMesssage() {
	var roll = Math.floor(Math.random() * 5);
	var msg;
	switch(roll) {
		case 0:
			msg = "UwU お帰りなさい、ご主人様。これが検索の結果です~ ごゆっくり。";
			break;
		case 1:
			msg = "え…えっ？検索結果を見せてほしい？そ…そんな…恥ずかしいよ…";
			break;
		case 2:
			msg = "お帰り、お兄ちゃん！ご飯にする？お風呂にする？それとも…　け・ん・さ・く・の・け・っ・か";
			break;
		case 3:
			msg = "あ、そうですか。検索結果を見たいですか。見せてあげるわ。変態。";
			break;
		case 4:
			msg = "お兄ちゃん、私の検索結果を見ちゃダメェ…！あっ…見ちゃった…もう兄ちゃんだけとしか結婚できない…お兄ちゃんは責任を取るよね";
			break;
	}
	return msg;
}

// Initalize locations
var milpitas = new Location([new Cab(process.env.MILPITAS)], 'Milpitas');
var sanJose = new Location([new Cab(process.env.SANJOSEJ), new Cab(process.env.SANJOSEK)], 'San Jose');
var dalyCity = new Location([new Cab(process.env.DALYCITY)], 'Daly City');
var concord = new Location([new Cab(process.env.CONCORD)], 'Concord');

// Initialize Discord Bot
var bot = new Discord.Client();

bot.on('ready', () => {
	console.log('Connected');
	console.log(`Logged in as ${bot.user.tag}!`);
	console.log(bot.user.username + ' - (' + bot.user.id + ')');
});

function pingChannel(str, locName) {
	bot.channels.forEach(function(channel) {
		if (locName === 'Milpitas' && channel.name === 'dnb-milpitas') {
			channel.sendCode('javascript', str);
		} else if (locName === 'Daly City' && channel.name === 'dnb-dalycity') {
			channel.sendCode('javascript', str);
		} else if (locName === 'Concord' && channel.name === 'round1-concord') {
			channel.sendCode('javascript', str);
		} else if (locName === 'San Jose' && channel.name === 'round1-sanjose') {
			channel.sendCode('javascript', str);
		}
	});
}

bot.on('error', console.error);
bot.on('message', message => {
	if (message.content.substring(0, 1) == '!') {
		var args = message.content.substring(1).split(' ');
		var cmd = args[0];
		var channel = message.channel.name;
		if (cmd === 'whose') {
			switch (channel) {
				case 'dnb-milpitas':
					message.channel.send({embed:{
						title: milpitas.name,
						description: getRinonMesssage() + "\n```" + milpitas.getOutput() + "```",
						color: 0xFF69B4,
						timestamp: new Date(),
						footer: {
							text: "hella tfti",
							icon_url: 'https://media.discordapp.net/attachments/477222516990017546/483482589424910342/tfti.png'
						}
					}});
					break;
				case 'dnb-dalycity':
					message.channel.send({embed:{
						title: dalyCity.name,
						description: getRinonMesssage() + "\n```" + dalyCity.getOutput() + "```",
						color: 0xFF69B4,
						timestamp: new Date(),
						footer: {
							text: "hella tfti",
							icon_url: 'https://media.discordapp.net/attachments/477222516990017546/483482589424910342/tfti.png'
						}
					}});
					break;
				case 'round1-concord':
					message.channel.send({embed:{
						title: concord.name,
						description: getRinonMesssage() + "\n```" + concord.getOutput() + "```",
						color: 0xFF69B4,
						timestamp: new Date(),
						footer: {
							text: "hella tfti",
							icon_url: 'https://media.discordapp.net/attachments/477222516990017546/483482589424910342/tfti.png'
						}
					}});
					break;
				case 'round1-sanjose':
					message.channel.send({embed:{
						title: sanJose.name,
						description: getRinonMesssage() + "\n```" + sanJose.getOutput() + "```",
						color: 0xFF69B4,
						timestamp: new Date(),
						footer: {
							text: "hella tfti",
							icon_url: 'https://media.discordapp.net/attachments/477222516990017546/483482589424910342/tfti.png'
						}
					}});
					break;
			}
		} else if (cmd === 'yeet') {
			switch(channel) {
				case 'dnb-milpitas':
					message.channel.send({embed:{
						title: milpitas.name,
						description: getRinonMesssage() + "\n```" + milpitas.getAll() + "```",
						color: 0xFFFFFF,
						timestamp: new Date(),
					}});
					break;
				case 'dnb-dalycity':
					message.channel.send({embed:{
						title: dalyCity.name,
						description: getRinonMesssage() + "\n```" + dalyCity.getAll() + "```",
						color: 0xFFFFFF,
						timestamp: new Date()
					}});
					break;
				case 'round1-concord':
					message.channel.send({embed:{
						title: concord.name,
						description: getRinonMesssage() + "\n```" + concord.getAll() + "```",
						color: 0xFFFFFF,
						timestamp: new Date()
					}});
					break;
				case 'round1-sanjose':
					message.channel.send({embed:{
						title: sanJose.name,
						description: getRinonMesssage() + "\n```" + sanJose.getAll() + "```",
						color: 0xFFFFFF,
						timestamp: new Date()
					}});
					break;
			}
		} else if (cmd == 'help') {
			message.channel.send('Commands: !whose, !yeet');
		}
	}
});
getInitialData(milpitas);
getInitialData(sanJose);
getInitialData(dalyCity);
getInitialData(concord);
bot.login(process.env.CLIENT_TOKEN);
