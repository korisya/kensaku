var Discord = require('discord.js');
var rp = require('request-promise');
var tough = require('tough-cookie');
const cheerio = require('cheerio');
require('http').createServer().listen(3000);
require('dotenv').config();

// Special players
const tftiPlayers = [
  '51448180', // RCKYWONG
  '51415530', // T3ALIZES
  '51400807', // MEGUMIN
  '51504563', // DEREKH
  '51500816', // WINBER
  '51407772', // ZEO
  '51502133', // ORANGEEE
];
//const tftiEmoji = '<:TFTI:483651827984760842>'; // ID from San Jose DDR Players
//const tftiEmoji = '<:TFTI:537689355553079306>'; // ID from BotTester
const tftiEmoji = '<:TFTI:542983258728693780>'; // ID from DDR Machine Stalking

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
    hour12: true,
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
    const playerStrings = [];
    // TODO: Use a reduce function
    this.todaysPlayers.forEach(function(player) {
      const timeSinceSeen = timeDifferential(currentTime, player.lastTime);
      if (timeSinceSeen.h < 2) {
        const firstTimeString = timeString(player.firstTime, player.loc.timeZone);
        playerStrings.push(`${player.name.padEnd(8)}   ${firstTimeString}   Seen ${timeSinceSeen.str} ago`);
      }
    });
    return playerStrings;
  };

  this.getTodaysPlayers = function () {
    const currentTime = new Date();
    const playerStrings = [];
    // TODO: Use a reduce function
    this.todaysPlayers.forEach(function(player) {
      const firstTime = timeString(player.firstTime, player.loc.timeZone);
      const lastTime = timeString(player.lastTime, player.loc.timeZone);
      const timePlayed = timeDifferential(player.lastTime, player.firstTime);
      playerStrings.push(`${player.name.padEnd(8)}   ${firstTime} - ${lastTime}   (${timePlayed.str})`);
    });
    return playerStrings;
  };
}

function tftiCheck(incomingPlayer, locationId) {
  if (tftiPlayers.includes(incomingPlayer.ddrCode)) {
    pingChannel('tfti', `${incomingPlayer.name} (${incomingPlayer.ddrCode}) was spotted at #${locationId}! ${tftiEmoji}`);
  }
}

// Gets initial data
async function getInitialData(loc) {
  loc.cabs.forEach(async function(cab) {
    await rp(cab.requestDataOptions).then(($) => {
      const dancerCount = $('.dancer_name').get().length - 1; // First one is row header
      console.log(`getInitialData ${loc.id} found ${dancerCount} dancers:`);
      // Parses data
      for (var dancerIndex = 1; dancerIndex <= Math.min(dancerCount, 7); dancerIndex++) { // Get up to 7 dancers, but don't break if we have less than 20
        cab.players[dancerIndex-1] = new Player({
          // $('.dancer_name').eq(0) is a row header, so store row 1 in players[0]
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
}

// Retrieves new data
async function retrieveData(loc) {
  // What happens if people are playing during this hour? This would run multiple times in the hour
  // In Japan, should be impossible (daily maintenance or shop closed)
  // In USA, everything should be closed
  //
  // Ideally this should be done in update() instead
  var now = new Date();
  const clientHoursBehindUtc = now.getTimezoneOffset() / 60; // This could be static at boot time, but runtime would support changing time zones during runtime
  const usShouldReport = loc.timeZone.startsWith('America') && (now.getHours() + clientHoursBehindUtc) === 12; // 12pm GMT+0 = 4am PST, 5am PDT. TODO: Make it 4am at the location's local time. Not important.
  const jpShouldReport = !loc.timeZone.startsWith('America') && (now.getHours() + clientHoursBehindUtc) === 20; // 8pm GMT+0 = 5am Japan (beginning of maintenance)
  if (loc.todaysPlayers.length !== 0 && (usShouldReport || jpShouldReport)) {
    reportTodaysPlayers(loc);
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
}

// Updates player lists using new data
function updatePlayerLists(loc) {
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
        // New player
        loc.todaysPlayers.unshift(incomingPlayer);
        pingChannel(loc.id, monospace(`+ ${incomingPlayer.name}     ${incomingPlayer.ddrCode}`));
        tftiCheck(incomingPlayer, loc.id);
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
        tftiCheck(incomingPlayer1, loc.id);
      }

      if (foundTodaysPlayer0) {
        incomingPlayer0.firstTime = foundTodaysPlayer0.firstTime;
        loc.todaysPlayers.splice(loc.todaysPlayers.indexOf(foundTodaysPlayer0), 1);
        loc.todaysPlayers.unshift(incomingPlayer0);
      } else {
        loc.todaysPlayers.unshift(incomingPlayer0);
        str += '\n+ ' + incomingPlayer0.name + '    ' + incomingPlayer0.ddrCode;
        console.log('\t> @' + loc.name + ': + ' + incomingPlayer0.toLocaleString());
        tftiCheck(incomingPlayer0, loc.id);
      }

      if (str !== '') {
        pingChannel(loc.id, monospace(str));
      }
    }
  });
}

// Removes players who move cabs
function pruneData() {
  console.log('Pruning data. We should see this after we have retrieved all data.')
  ALL_LOCATIONS.forEach(function(loc1) {
    ALL_LOCATIONS.forEach(function(loc2) {
      loc1.cabs.forEach(function(cab1) {
        loc2.cabs.forEach(function(cab2) {
          if (cab1 !== cab2) {
            cab1.newPlayers.forEach(function(newPlayer) {
              var foundPlayer = cab2.players.find(function(player) {
                return player.ddrCode === newPlayer.ddrCode;
              });
              if (foundPlayer) {
                console.log('--> ' + loc2.name + ' to ' + loc1.name + ': stop switching cabs pls, ' + foundPlayer.toLocaleString());
                cab2.players.splice(cab2.players.indexOf(foundPlayer), 1);
                cab2.prunedPlayers++;
              }
            });
          }
        });
      });
    });
  });
}

async function update() {
  let promises = [];
  ALL_LOCATIONS.forEach((loc) => promises.push(retrieveData(loc)));
  Promise.all(promises).then(() => {
    pruneData();
    ALL_LOCATIONS.forEach((loc) => updatePlayerLists(loc));
  });

  setTimeout(function() {
    update()
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

function monospace(message) {
  return '```' + (message || ' ') + '```';
}

function pingChannel(channelName, message) {
  console.info('Sending message to ' + channelName + ': ' + message);
  getChannelsWithName(channelName).forEach(channel => channel.send(message));
}

function reportTodaysPlayers(loc) {
  getChannelsWithName(loc.id).forEach(channel => reportTodaysPlayersForChannel(channel, loc));
}

function reportTodaysPlayersForChannel(channel, loc) {
  const todaysPlayers = loc.getTodaysPlayers();
  const s = todaysPlayers.length === 1 ? '' : 's';
  const message = `${todaysPlayers.length} player${s} today:` + monospace(todaysPlayers.join('\n'));
  console.info('Sending message to ' + channel.name + ': ' + message);
  channel.send(message);
}

function summaryHereString(loc) {
  const currentTime = new Date();
  const nowString = timeString(currentTime, loc.timeZone);

  let numPlayers = 0;
  const playerNamesTimes = [];

  loc.todaysPlayers.forEach(function(player) {
    const timeSinceSeen = timeDifferential(currentTime, player.lastTime);
    if (timeSinceSeen.h < 2) {
      numPlayers++;
      playerNamesTimes.push(`${player.name} ${timeSinceSeen.m}m`);
    }
  });

  let summaryHereString;
  if (loc.todaysPlayers.length === 0) {
    // TODO: Perhaps include the day's start time (local time per arcade)
    summaryHereString = `${nowString}: 0 players today.`;
  } else if (numPlayers === 0) {
    const players = (loc.todaysPlayers.length === 1) ? "Today's only player has" : `All ${loc.todaysPlayers.length} players today have`;
    const timeSinceSeen = timeDifferential(currentTime, loc.todaysPlayers[0].lastTime);
    summaryHereString = `${nowString}: ${players} left! :eyes: Last player seen: ${loc.todaysPlayers[0].name} ${timeSinceSeen.str} ago.`;
  } else {
    const s = (numPlayers === 1) ? '' : 's';
    summaryHereString = `${nowString}: ${numPlayers} player${s} in the last 2 hours. :eyes: ${tftiEmoji} (${playerNamesTimes.join(', ')})`;
  }

  return summaryHereString;
}

function updateChannelTopic(loc, channel) {
  channel.setTopic(summaryHereString(loc))
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
    console.info('Command ' + cmd + ' received from ' + message.author.tag);

    const channel = message.channel;
    const shop = ALL_LOCATIONS.find((shop) => shop.id === channel.name);

    if (!shop) {
      console.error('Could not find shop with id ' + channel.name);
      return;
    }

    if (cmd === 'whose') {
      channel.send('Check the channel topic. Use `!here` if you really need it saved in message history.');
    } else if (cmd === 'here') {
      const recentPlayers = shop.getRecentPlayers();
      const response = "Check the channel topic.\n\n" + summaryHereString(shop) + monospace(recentPlayers.join('\n'));
      console.info('Sending message to channel #', channel.name, ':', response);
      channel.send(response);
    // What is the expected value of ADMIN_TAG? Is it something that would be reasonable to put in code?
    // Does `tag` mean all roles? What happens if `author` has multiple roles?
    } else if (message.author.tag === process.env.ADMIN_TAG) {
      if (cmd === 'all') {
        reportTodaysPlayersForChannel(channel, shop);
      }
    }
  }
});

// Initialize locations
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
  setTimeout(function() {
    update()
  }, REFRESH_INTERVAL);
}

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!DISCORD_BOT_TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN environment variable.');
  process.exit();
}
bot.login(DISCORD_BOT_TOKEN)
  .then(getAllInitialData)
  .then(updateChannelTopics);
