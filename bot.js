var Discord = require('discord.js');
var rp = require('request-promise');
var tough = require('tough-cookie');
const cheerio = require('cheerio');
require('http').createServer().listen(3000);
require('dotenv').config();

const msMinute = 60*1000;
const msHour = 60*60*1000;
const REFRESH_INTERVAL = msMinute;
function timeDifferential(nowTime, beforeTime) {
  const hr = Math.floor((nowTime - beforeTime) / msHour);
  const min = Math.floor(((nowTime - beforeTime) % msHour) / msMinute);
  return {
    h: hr,
    m: min,
    str: `${hr}h ${min}m`
  };
}
function timeString(time, timeZone) {
  return time.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timeZone
  });
}

var killBot = false;

// Constructor for Players
function Player (args) {
  this.name = args.dancerName;
  this.ddrCode = args.ddrCode;
  this.loc = args.loc;

  this.firstTime = new Date();
  this.lastTime = new Date();

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
  this.requestDataOptions = {
    uri: `https://p.eagate.573.jp/game/ddr/ddra/p/rival/kensaku.html?mode=4`,
    jar: this.cookiejar,
    transform: function (body) {
      return cheerio.load(body);
    }};
  this.prunedPlayers = 0;
}
// Constructor for locations
function Location (loc) {
  this.name = loc.name;
  this.id = loc.id;
  this.cabs = loc.cabs;
  this.timeZone = loc.timeZone;
  this.todaysPlayers = [];

  this.getRecentPlayers = function () {
    const currentTime = new Date();
    let output = '';
    // TODO: Use a reduce function
    this.todaysPlayers.forEach(function(player) {
      const timeSinceSeen = timeDifferential(currentTime, player.lastTime);
      if (timeSinceSeen.h < 2) {
        const firstTimeString = timeString(player.firstTime, this.timeZone);
        output += `${player.name.padEnd(8)}   ${firstTimeString}   Seen ${timeSinceSeen.str} ago\n`;
      }
    });
    return output || ' ';
  };

  this.getTodaysPlayers = function () {
    const currentTime = new Date();
    let output = '';
    // TODO: Use a reduce function
    this.todaysPlayers.forEach(function(player) {
      const firstTime = timeString(player.firstTime, player.loc.timeZone);
      const lastTime = timeString(player.lastTime, player.loc.timeZone);
      const timePlayed = timeDifferential(player.lastTime, player.firstTime);
      output += `${player.name.padEnd(8)}   ${firstTime} - ${lastTime}   (${timePlayed.str})\n`;
    });
    return output || ' ';
  };
}

// Gets initial data
async function getInitialData(loc) {
  loc.cabs.forEach(async function(cab) {
    await rp(cab.requestDataOptions).then(($) => {
      // Parses data
      for (var dancerIndex = 1; dancerIndex < $('.dancer_name').get().length - 13; dancerIndex++) { // dancerIndex = 1 because first value isn't a player name
        cab.players[dancerIndex-1] = new Player({
          dancerName: $('.dancer_name').eq(dancerIndex).text(),
          ddrCode: $('.code').eq(dancerIndex).text(),
          loc: loc
        });
        console.log('--> ' + loc.name + ': Player ' + dancerIndex + ' received - ' + cab.players[dancerIndex-1].toLocaleString());
      }
    }).catch((err) => {
      console.log('--> Failed to get initial data. Restart the bot.')
      throw err;
    });
  });
  setTimeout(function() {
    retrieveData(loc)
  }, REFRESH_INTERVAL);
}

// Retrieves new data every minute
async function retrieveData(loc) {
  var currentTime = new Date();
  // Autoyeet at 5am GMT+9 Tokyo (beginning of maintenance)
  // TODO: For cabs on USA server, autoyeet/reset at 4am local time.
  // For all other cabs (all on JP server), autoyeet/reset at the beginning of maintenance.
  // The current deployment for USA cabs runs on GMT+0, so "12" means 4am GMT-8.

  // Assumes that we run this client in GMT-8... :(
  // TODO: Fix this so that we don't depend on the time zone which the client is run from.
  // Might be easiest to hard-code to Tokyo
  //
  // What happens if people are playing during this hour?
  // In Japan, should be impossible (daily maintenance or shop closed)
  // In USA, everything should be closed
  if (currentTime.getHours() == 12 && loc.todaysPlayers.length != 0) {
    reportTodaysPlayersAllGuilds(loc);
    loc.todaysPlayers = [];
  }

  console.log('--> ' + loc.name + ': Retrieving data...');

  for (let index = 0; index < loc.cabs.length; index++) {
    await rp(loc.cabs[index].requestDataOptions).then(($) => {
      if ($('.dancer_name').length === 0) {
        console.error('--> ' + loc.name + ': No dancers found. Is this cookie set up correctly?');
      } else if ($('.dancer_name').eq(1).text() === '' || $('.dancer_name').eq(2).text() === '') {
        console.error('--> ' + loc.name + ': Ghosts appeared. Spooky af :monkaPrim:');
      } else {
        loc.cabs[index].newPlayers[0] = new Player({
          dancerName: $('.dancer_name').eq(1).text(),
          ddrCode: $('.code').eq(1).text(),
          loc: loc
        });
        loc.cabs[index].newPlayers[1] = new Player({
          dancerName: $('.dancer_name').eq(2).text(),
          ddrCode: $('.code').eq(2).text(),
          loc: loc
        });
        console.log('--> ' + loc.name + ': Data received @cab' + (index + 1) + '\n\t> ' + loc.cabs[index].newPlayers.toLocaleString());
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
    if (!cab.players.length) {
      return;
    }

    // if the previous first player shifted down a spot
    if (cab.players[0].ddrCode !== cab.newPlayers[0].ddrCode
      && cab.players[0].ddrCode === cab.newPlayers[1].ddrCode) {
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
        pingChannel(loc.id, '+ ' + incomingPlayer.name + '    ' + incomingPlayer.ddrCode);
        console.log('\t> @' + loc.name + ': + ' + incomingPlayer.toLocaleString());
      }
      // how are we going to get total session times? yay now it's ez
    } // else, if the first two players are different in any way
    else if (!(cab.players[0].ddrCode === cab.newPlayers[0].ddrCode
      && cab.players[1].ddrCode === cab.newPlayers[1].ddrCode)) {

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

      if (str !== '') {
        pingChannel(loc.id, str);
      }
    }
  });
  setTimeout(function() {
    retrieveData(loc)
  }, REFRESH_INTERVAL);
}

// Initialize Discord Bot
var bot = new Discord.Client();

bot.on('ready', () => {
  console.log('Connected');
  console.log(`Logged in as ${bot.user.tag}!`);
  console.log(bot.user.username + ' - (' + bot.user.id + ')');
});

// Reused in a few places
// Plus we have the same channel name on multiple guilds
function getChannelsWithName(name) {
  return bot.channels.filter(channel => channel.name === name);
};

function pingChannel(channelName, message) {
  getChannelsWithName(channelName).forEach(channel => channel.send('```' + message + '```'));
}

function reportTodaysPlayersAllGuilds(loc) {
  getChannelsWithName(loc.id).forEach(channel => reportTodaysPlayers(channel, loc));
}

function reportTodaysPlayers(channel, loc) {
  channel.send('```' + loc.getTodaysPlayers() + '```');
}

function updateChannelTopic(loc, channel) {
  const currentTime = new Date();
  const nowString = timeString(currentTime, loc.timeZone);

  let numPlayers = 0;
  const playerNamesTimes = [];

  loc.todaysPlayers.forEach(function(player) {
    const timeSinceSeen = timeDifferential(currentTime, player.lastTime);
    if (timeSinceSeen.h < 1) {
      numPlayers++;
      playerNamesTimes.push(`${player.name} ${timeSinceSeen.m}m`);
    }
  });
  const s = (numPlayers === 1) ? '' : 's';

  let topic;
  if (loc.todaysPlayers.length === 0) {
    // TODO: Perhaps include the day's start time (local time per arcade)
    topic = `${nowString}: 0 players today.`;
  } else if (numPlayers === 0) {
    const timeSinceSeen = timeDifferential(currentTime, loc.todaysPlayers[0].lastTime);
    topic = `${nowString}: All ${loc.todaysPlayers.length} player${s} today left! :eyes: Last player seen: ${loc.todaysPlayers[0].name} ${timeSinceSeen.str} ago.`;
  } else {
    topic = `${nowString}: ${numPlayers} player${s} in the last hour. :eyes: <:TFTI:483651827984760842> (${playerNamesTimes.join(', ')})`;
  }
  channel.setTopic(topic)
    .then(updated => console.log(`Updated topic #${loc.id}: ${updated.topic}`))
    // TODO: log loc.id
    .catch((error) => console.error('Failed to update ' + loc.id, error));
}

async function updateChannelTopics() {
  if (!killBot) {
    ALL_LOCATIONS.forEach(function(loc) {
      const channels = getChannelsWithName(loc.id);
      if (!channels.size) {
        console.error('Could not find channels for location ' + loc.id);
      } else {
        channels.forEach((channel) => updateChannelTopic(loc, channel));
      }
    });
    setTimeout(() => { updateChannelTopics(); }, REFRESH_INTERVAL);
  }
}

bot.on('error', console.error);

bot.on('message', message => {
  if (message.content.substring(0, 1) == '!') {
    const cmd = message.content.substring(1).split(' ')[0];
    const channel = message.channel;
    const shop = ALL_LOCATIONS.find((shop) => shop.id === channel.name);

    if (!shop) {
      console.error('Could not find shop with id ' + channel.name);
      return;
    }

    if (cmd === 'whose') {
      channel.send('Git gud.');
    } else if (cmd === 'here') {
      channel.send("```" + shop.getRecentPlayers() + "```");
    // What is the expected value of ADMIN_TAG? Is it something that would be reasonable to put in code?
    // Does `tag` mean all roles? What happens if `author` has multiple roles?
    } else if (message.author.tag === process.env.ADMIN_TAG) {
      if (cmd === 'all') {
        reportTodaysPlayers(channel, shop);
      }
    }
  }
});

// Initalize locations
// TODO: Move location and bot-token data to a separate file outside of version control
const ALL_LOCATIONS = [
  new Location({
    name: 'Round1 San Jose',
    id: 'round1-sanjose',
    timeZone: 'America/Los_Angeles',
    cabs: [
      new Cab(process.env.EACOOKIE_ROUND1SANJOSE_J),
      new Cab(process.env.EACOOKIE_ROUND1SANJOSE_K),
    ]
  }),
  new Location({
    name: 'D&B Milpitas',
    id: 'dnb-milpitas',
    timeZone: 'America/Los_Angeles',
    cabs: [
      new Cab(process.env.EACOOKIE_DNBMILPITAS),
    ]
  }),
  new Location({
    name: 'D&B Daly City',
    id: 'dnb-dalycity',
    timeZone: 'America/Los_Angeles',
    cabs: [
      new Cab(process.env.EACOOKIE_DNBDALYCITY),
    ]
  }),
  new Location({
    name: 'Round1 Concord',
    id: 'round1-concord',
    timeZone: 'America/Los_Angeles',
    cabs: [
      new Cab(process.env.EACOOKIE_ROUND1CONCORD),
    ]
  }),
];
function getAllInitialData() {
  ALL_LOCATIONS.forEach((loc) => getInitialData(loc));
}

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!DISCORD_BOT_TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN environment variable.');
  process.exit();
}
bot.login(DISCORD_BOT_TOKEN)
  .then(getAllInitialData)
  .then(updateChannelTopics);
