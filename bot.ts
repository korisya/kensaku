import * as Discord from 'discord.js';
import NodeFetch from 'node-fetch';
import * as ToughCookie from 'tough-cookie';
import * as cheerio from 'cheerio';
// Don't use default import for config, it crashes on launch
import * as config from 'config';

let updateTimeoutId: NodeJS.Timeout;

const adminDiscordTags: Array<string> = config.get('adminDiscordTags');
const adminPlayers: Array<string> = config.get('adminPlayers');
const REFRESH_INTERVAL: number = config.get('refreshIntervalMs');
const showAllNames: boolean = config.get('showAllNames');

// Report time in UTC (GMT+0)
const usReportTime = 12;
const jpReportTime = 20;

// Special players who will get extra-exposed when they show up
const tftiPlayers: Array<string> = config.get('tftiPlayers');

// Using object spread to clone the .get() array so that we can push new players in without restarting/reloading config
const configHiddenPlayers: Array<string> = config.get('hiddenPlayers'); // Hidden players who never be shown, regardless of mode
const hiddenPlayers = [...configHiddenPlayers];
const configVisiblePlayers: Array<string> = config.get('visiblePlayers'); // Visible players who will get revealed when they show up
const visiblePlayers = [...configVisiblePlayers];

const tftiEmoji = '<:TFTI:542983258728693780>'; // ID from DDR Machine Tracking

const msMinute = 60 * 1000;
const msHour = 60 * 60 * 1000;
const RECENT_PLAYER_CUTOFF_MINUTES = 90;
function timeDifferential(nowTime: Date, beforeTime: Date) {
  const nowTimeMs = nowTime.getTime();
  const beforeTimeMs = beforeTime.getTime();
  const hr = Math.floor((nowTimeMs - beforeTimeMs) / msHour);
  const min = Math.floor(((nowTimeMs - beforeTimeMs) % msHour) / msMinute);
  const minOnly = Math.floor((nowTimeMs - beforeTimeMs) / msMinute);
  return {
    h: hr,
    m: min,
    minOnly: minOnly,
    str: `${hr}h ${min}m`,
  };
}
function timeString(time: Date, timeZone: string) {
  return time.toLocaleTimeString([], {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timeZone,
  });
}

type IncomingPlayer = {
  dancerName: string;
  ddrCode: string;
  loc: any;
};

class Player {
  name: string;
  ddrCode: string;
  loc: any;
  firstTime: Date;
  lastTime: Date;

  constructor(incomingPlayer: IncomingPlayer) {
    this.name = incomingPlayer.dancerName;
    this.ddrCode = incomingPlayer.ddrCode;
    this.loc = incomingPlayer.loc;
    this.firstTime = new Date();
    this.lastTime = new Date();
  }

  toLocaleString = () => {
    return this.name + ' ' + this.ddrCode;
  };
}

function playerIsHidden(player: Player) {
  return hiddenPlayers.includes(player.ddrCode);
}

function playerIsVisible(player: Player, shop: Shop) {
  if (showAllNames) {
    return true;
  } else if (player.name.indexOf('TFTI') > -1 || player.name.indexOf('PRIM') > -1) {
    return true;
  } else if (playerIsHidden(player)) {
    return false;
  } else {
    return (
      shop?.eventMode ||
      shop?.todaysPlayers.map((p) => p.ddrCode).some((shopDdrCodes) => adminPlayers.includes(shopDdrCodes)) ||
      visiblePlayers.includes(player.ddrCode)
    );
  }
}

function isDailyMaintenanceTime() {
  const now = new Date();
  const japanHour = (now.getUTCHours() + 9) % 24;
  return japanHour === 5 || japanHour === 6;
}

function isExtendedMaintenanceTime() {
  // TODO: 3rd Tuesday of the month, 2am-7am Japan time
  return false;
}

// Determine which URL to hit
function getUrl() {
  return 'https://p.eagate.573.jp/game/ddr/ddra20/p/rival/kensaku.html?mode=4';
}

class Cab {
  players: Array<Player>;
  newPlayers: Array<Player>;
  cookieValue: string;
  cookie: ToughCookie.Cookie;
  prunedPlayers: number;

  constructor(cookieValue: string) {
    this.players = [];
    this.newPlayers = [];
    this.cookieValue = cookieValue;
    this.cookie = new ToughCookie.Cookie({
      key: 'M573SSID',
      value: cookieValue,
      domain: 'p.eagate.573.jp',
      httpOnly: true,
      maxAge: 31536000,
    });
    this.prunedPlayers = 0;
  }
}

// Constructor for shops
type ConfigShop = {
  id: string;
  timeZone: string;
  cookies: Array<string>;
  eventMode?: boolean;
};
class Shop {
  name: string; // Friendly name
  id: string; // Channel name
  cabs: Array<Cab>;
  timeZone: string;
  todaysPlayers: Array<Player>;
  numPlayersEachHour: Array<number>;
  alreadyReported: boolean;
  eventMode: boolean;

  constructor(configShop: ConfigShop) {
    this.name = configShop.id;
    this.id = configShop.id;
    this.cabs = configShop.cookies.map((cookie) => new Cab(cookie));
    this.timeZone = configShop.timeZone;
    this.todaysPlayers = [];
    this.numPlayersEachHour = [
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
    ];
    this.alreadyReported = false; // If you start the bot during a report hour, the bot will immediately report an empty day.
    this.eventMode = configShop.eventMode || false;
  }
}

function getRecentPlayers(shop: Shop): Array<string> {
  const currentTime = new Date();
  const playerStrings: Array<string> = [];
  // TODO: Use a reduce function
  shop.todaysPlayers.forEach(function (player) {
    const timeSinceSeen = timeDifferential(currentTime, player.lastTime);
    if (timeSinceSeen.minOnly <= RECENT_PLAYER_CUTOFF_MINUTES) {
      if (playerIsHidden(player)) {
      } else if (playerIsVisible(player, shop)) {
        playerStrings.push(`${player.name.padEnd(8)} ${player.ddrCode} Seen ${timeSinceSeen.minOnly}m ago`);
      } else {
        playerStrings.push(`******** ******** Seen ${timeSinceSeen.minOnly}m ago`);
      }
    }
  });
  return playerStrings;
}

function getTodaysPlayers(shop: Shop) {
  const currentTime = new Date();
  const playerStrings: Array<string> = [];
  // TODO: Use a reduce function
  shop.todaysPlayers.forEach(function (player: Player) {
    const firstTime = timeString(player.firstTime, player.loc.timeZone);
    const lastTime = timeString(player.lastTime, player.loc.timeZone);
    const timePlayed = timeDifferential(player.lastTime, player.firstTime);
    if (playerIsHidden(player)) {
    } else if (playerIsVisible(player, shop)) {
      playerStrings.push(`${player.name.padEnd(8)} ${player.ddrCode} (${timePlayed.str})`);
    } else {
      playerStrings.push(`******** ******** (${timePlayed.str})`);
    }
  });
  return playerStrings;
}

function tftiCheck(incomingPlayer: Player, locationId: string) {
  if (tftiPlayers.includes(incomingPlayer.ddrCode)) {
    getChannelsWithName('tfti').map((tftiChannel) => {
      const locationIdChannel = tftiChannel.guild.channels.cache.find((c) => c.name === locationId);
      const locationIdString = locationIdChannel ? locationIdChannel.toString() : '#' + locationId;

      const tftiEmojiForThisGuild = tftiChannel.guild.emojis.cache.find((emoji) => emoji.name === 'TFTI');
      const tftiMessage = `${incomingPlayer.name} (${incomingPlayer.ddrCode}) was spotted at ${locationIdString}! ${tftiEmojiForThisGuild}`;

      console.info(`Sending message to ${tftiChannel.guild.name}/#tfti: ${tftiMessage}`);
      tftiChannel.send(tftiMessage).then((message) => {
        if (tftiEmojiForThisGuild) {
          message.react(tftiEmojiForThisGuild);
        }
      });
    });
  }
}

function reportNewPlayer(loc: Shop, incomingPlayer: Player) {
  if (playerIsHidden(incomingPlayer)) {
  } else if (playerIsVisible(incomingPlayer, loc)) {
    pingChannelsForLocation(loc, monospace(`+ ${incomingPlayer.name.padEnd(8)} ${incomingPlayer.ddrCode}`));
  } else {
    pingChannelsForLocation(loc, monospace('+ ******** ********'));
  }
  tftiCheck(incomingPlayer, loc.id);
  console.log('\t> @' + loc.name + ': + ' + incomingPlayer.toLocaleString());
}

function reportNewPlayers(loc: Shop, players: Array<Player>) {
  let playersToReport: Array<string> = [];

  players.forEach((player) => {
    if (playerIsHidden(player)) {
    } else if (playerIsVisible(player, loc)) {
      playersToReport.push(`+ ${player.name.padEnd(8)} ${player.ddrCode}`);
    } else {
      playersToReport.push('+ ******** ********');
    }
    console.log(`\t> @${loc.name}: + ` + player.toLocaleString());
    tftiCheck(player, loc.id);
  });

  if (playersToReport.length) {
    pingChannelsForLocation(loc, monospace(playersToReport.join('\n')));
  }
}

// Gets initial data
// Ideally, we'd just retrieveData() or do whatever we do repeatedly (no special case and no duplicated code for the first run)
function getInitialData(shop: Shop) {
  console.log(`getInitialData ${shop.id}`);
  return shop.cabs.map((cab, cabIndex) => {
    return getInitialDataForCab({
      cab,
      cabIndex,
      shop,
    });
  });
}

async function getInitialDataForCab({ cab, cabIndex, shop }: { cab: Cab; cabIndex: number; shop: Shop }) {
  const fetch = await NodeFetch(getUrl(), {
    headers: {
      cookie: cab.cookie.toString(),
    },
  });

  const body = await fetch.text();

  const $ = cheerio.load(body);
  const dancerRows = $('td.dancer_name').get().length;
  if (dancerRows === 0) {
    // Error state - we won't work here. Happens during maintenance.
    // We have to restart.
    const error =
      `0 dancers found at ${shop.id} cab${cabIndex}. Restart the bot. username:` +
      $('#user_name .name_str')
        .get()
        .map((n) => $(n).text()) +
      ' rival_list:' +
      $('table.tb_rival_list');
    console.error(error);
    throw new Error(error);
  }

  console.log(`getInitialData ${shop.id} @cab${cabIndex} found ${dancerRows} dancers:`);
  // Parses data
  for (let dancerIndex = 0; dancerIndex < Math.min(dancerRows, 7); dancerIndex++) {
    // Get up to 7 dancers, but don't break if we have less than 20
    cab.players[dancerIndex] = new Player({
      dancerName: $('td.dancer_name').eq(dancerIndex).text(),
      ddrCode: $('td.code').eq(dancerIndex).text(),
      loc: shop,
    });
    console.log(
      `--> ${shop.name} cab${cabIndex}: Player ${dancerIndex} received - ` + cab.players[dancerIndex].toLocaleString()
    );
  }
}

// Retrieves new data
// Ideally this should be done in update() instead
function retrieveData(loc: Shop) {
  const now = new Date();

  const isAmerica = loc.timeZone.startsWith('America') || loc.timeZone.indexOf('Honolulu') > -1;

  let nowReportTimeDiff = isAmerica ? now.getUTCHours() - usReportTime : now.getUTCHours() - jpReportTime;
  if (nowReportTimeDiff <= 0) {
    nowReportTimeDiff += 24;
  }

  if (loc.numPlayersEachHour[nowReportTimeDiff - 1] < 0) {
    let numPlayersLastHour = 0;
    loc.todaysPlayers.forEach(function (player) {
      const timeSinceSeen = timeDifferential(now, player.lastTime);
      if (timeSinceSeen.minOnly <= 60) {
        numPlayersLastHour++;
      }
    });
    loc.numPlayersEachHour[nowReportTimeDiff - 1] = numPlayersLastHour;
  }

  // What happens if people are playing during this hour? This would run multiple times in the hour
  // In Japan, should be impossible (daily maintenance or shop closed)
  // In USA, everything should be closed
  const usShouldReport = isAmerica && now.getUTCHours() === usReportTime; // 12pm GMT+0 = 4am PST, 5am PDT. TODO: Make it 2am at the location's local time. Not important.
  const jpShouldReport = !isAmerica && now.getUTCHours() === jpReportTime; // 8pm GMT+0 = 5am Japan (beginning of maintenance)

  // We assume that neither of the report times are 23:00 GMT.
  if ((isAmerica && now.getUTCHours() === usReportTime + 1) || (!isAmerica && now.getUTCHours() === jpReportTime + 1)) {
    loc.alreadyReported = false;
    loc.numPlayersEachHour[23] = -1;
  }

  if (!loc.alreadyReported && (usShouldReport || jpShouldReport)) {
    reportTodaysPlayers(loc);
    loc.todaysPlayers = [];
    loc.numPlayersEachHour = [
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      0,
    ];
    loc.alreadyReported = true;
    loc.eventMode = false; // By default, turn off event mode at the end of the day, even if events last multiple days.
  }

  if (isDailyMaintenanceTime() || isExtendedMaintenanceTime()) {
    console.log('Not checking during daily maintenance.');
    return [];
  }

  console.log('--> ' + loc.name + ': Retrieving data...');
  return loc.cabs.map(async (cab, cabIndex) => {
    const fetch = await NodeFetch(getUrl(), {
      headers: {
        cookie: cab.cookie.toString(),
      },
    });

    const body = await fetch.text();

    const $ = cheerio.load(body);
    const dancerCount = $('td.dancer_name').length;
    if (dancerCount === 0) {
      const errorMessage =
        `--> ${loc.name} @cab${cabIndex}: No dancers found. Is this cookie set up correctly? ` +
        loc.cabs[cabIndex].cookieValue;
      console.error(errorMessage);
      throw new Error(errorMessage);
    } else {
      const receivedPlayers = [];
      for (let dancerIndex = 0; dancerIndex < Math.min(dancerCount, 10); dancerIndex++) {
        // Only receive up to 10 players for debugging. 20 is too long, but might still be useful for extended downtime with lots of players playing.
        const dancerName = $('td.dancer_name').eq(dancerIndex).text();
        const ddrCode = $('td.code').eq(dancerIndex).text();
        if (dancerName === '') {
          console.error(`--> ${loc.name} @cab${cabIndex}: Ghost ${ddrCode} appeared. Spooky af :monkaPrim:`);
          // TODO: If we find the dancerName for this ddrCode later on, then we should populate the dancerName.
        }
        receivedPlayers[dancerIndex] = new Player({
          dancerName,
          ddrCode,
          loc,
        });
      }
      console.log(`--> ${loc.name} @cab${cabIndex}: Data received >` + receivedPlayers.toLocaleString());

      // Until we fix some logic, only put top 2 into loc.cabs.newPlayers
      for (let dancerIndex = 0; dancerIndex < Math.min(dancerCount, 2); dancerIndex++) {
        loc.cabs[cabIndex].newPlayers[dancerIndex] = receivedPlayers[dancerIndex];
      }
    }
  });
}

// Updates player lists using new data
function updatePlayerList(loc: Shop) {
  loc.cabs.forEach(function (cab, cabIndex) {
    if (!cab.players.length) {
      return;
    }

    // Check if the previous first player shifted down a spot.
    // We assume this means that cab.newPlayers[0] contains a player who just finished a game.
    if (
      cab.players[0]?.ddrCode &&
      cab.newPlayers[0]?.ddrCode &&
      cab.newPlayers[1]?.ddrCode &&
      cab.players[0]?.ddrCode !== cab.newPlayers[0]?.ddrCode &&
      cab.players[0]?.ddrCode === cab.newPlayers[1]?.ddrCode
    ) {
      const incomingPlayer = cab.newPlayers[0];

      // Check if the incomingPlayer already exists in cab.players.
      const foundPlayer = cab.players.find(function (player) {
        return player.ddrCode === incomingPlayer.ddrCode;
      });
      console.log(`--> ${loc.name}: cab${cabIndex}.players before: ` + cab.players.toLocaleString());

      // Update cab.players with our new information.
      if (foundPlayer) {
        // Remove the duplicate and re-add the incomingPlayer to the front of cab.players.
        cab.players.splice(cab.players.indexOf(foundPlayer), 1);
        cab.players.unshift(incomingPlayer);
      } else {
        // Add the incomingPlayer to the front of cab.players.
        cab.players.unshift(incomingPlayer);
        // Tries to keep cab.players the same length as it started.
        if (cab.prunedPlayers > 0) {
          cab.prunedPlayers--;
        } else {
          cab.players.pop();
        }
      }
      console.log(`--> ${loc.name}: cab${cabIndex}.players after: ` + cab.players.toLocaleString());

      // Check if the incomingPlayer exists in loc.todaysPlayers.
      const foundTodaysPlayer = loc.todaysPlayers.find(function (player) {
        return player.ddrCode === incomingPlayer.ddrCode;
      });

      // Update loc.todaysPlayers accordingly.
      if (foundTodaysPlayer) {
        // The incomingPlayer has already played today, so we need to retrieve their first logout time.
        // Remove the duplicate from loc.todaysPlayers, and re-add the incomingPlayer to the front of loc.todaysPlayers.
        incomingPlayer.firstTime = foundTodaysPlayer.firstTime;
        loc.todaysPlayers.splice(loc.todaysPlayers.indexOf(foundTodaysPlayer), 1);
        loc.todaysPlayers.unshift(incomingPlayer);
      } else {
        // Ths incomingPlayer must be a new player.
        // Add the incomingPlayer to the front of loc.todaysPlayers, and report to the channel.
        loc.todaysPlayers.unshift(incomingPlayer);
        reportNewPlayer(loc, incomingPlayer);
      }
    }
    // Check if the first two players are different in any way (other than the previous situation).
    // We assume that this means cab.newPlayers[0] and cab.newPlayers[1] both contain players who just finished a game together.
    else if (
      cab.players[0]?.ddrCode &&
      cab.newPlayers[0]?.ddrCode &&
      cab.newPlayers[1]?.ddrCode &&
      !(
        cab.players[0]?.ddrCode === cab.newPlayers[0]?.ddrCode && cab.players[1]?.ddrCode === cab.newPlayers[1]?.ddrCode
      )
    ) {
      const incomingPlayer0 = cab.newPlayers[0];
      const incomingPlayer1 = cab.newPlayers[1];

      const foundPlayer0 = cab.players.find(function (player) {
        return player.ddrCode === incomingPlayer0.ddrCode;
      });
      const foundPlayer1 = cab.players.find(function (player) {
        return player.ddrCode === incomingPlayer1.ddrCode;
      });

      console.log(`--> ${loc.name}: cab${cabIndex}.players before: ` + cab.players.toLocaleString());
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
      console.log(`--> ${loc.name}: cab${cabIndex}.players after: ` + cab.players.toLocaleString());

      const foundTodaysPlayer0 = loc.todaysPlayers.find(function (player) {
        return player.ddrCode === incomingPlayer0.ddrCode;
      });
      const foundTodaysPlayer1 = loc.todaysPlayers.find(function (player) {
        return player.ddrCode === incomingPlayer1.ddrCode;
      });

      const playersToReport = [];
      if (foundTodaysPlayer1) {
        incomingPlayer1.firstTime = foundTodaysPlayer1.firstTime;
        loc.todaysPlayers.splice(loc.todaysPlayers.indexOf(foundTodaysPlayer1), 1);
        loc.todaysPlayers.unshift(incomingPlayer1);
      } else {
        loc.todaysPlayers.unshift(incomingPlayer1);
        playersToReport.push(incomingPlayer1);
      }

      if (foundTodaysPlayer0) {
        incomingPlayer0.firstTime = foundTodaysPlayer0.firstTime;
        loc.todaysPlayers.splice(loc.todaysPlayers.indexOf(foundTodaysPlayer0), 1);
        loc.todaysPlayers.unshift(incomingPlayer0);
      } else {
        loc.todaysPlayers.unshift(incomingPlayer0);
        playersToReport.push(incomingPlayer0);
      }

      reportNewPlayers(loc, playersToReport);
    }
  });
}

function updatePlayerLists() {
  return ALL_LOCATIONS.forEach((shop) => {
    return updatePlayerList(shop);
  });
}

// Removes players who move cabs
function pruneData() {
  console.log('Pruning data. We should see this after we have retrieved all data.');
  ALL_LOCATIONS.forEach(function (loc1) {
    ALL_LOCATIONS.forEach(function (loc2) {
      loc1.cabs.forEach(function (cab1) {
        loc2.cabs.forEach(function (cab2) {
          if (cab1 !== cab2) {
            cab1.newPlayers.forEach(function (newPlayer) {
              let foundPlayer = cab2.players.find(function (player) {
                return player.ddrCode === newPlayer.ddrCode;
              });
              if (foundPlayer) {
                console.log(
                  '--> ' + loc2.name + ' to ' + loc1.name + ': stop switching cabs pls, ' + foundPlayer.toLocaleString()
                );
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

function update() {
  const locationPromises = ALL_LOCATIONS.map((loc) => {
    const cabPromises = retrieveData(loc);
    return Promise.all(cabPromises).catch((err) => {
      console.error(err, `${getUrl()} failed`);
    });
  });

  return Promise.all(locationPromises)
    .then(() => {
      if (!(isDailyMaintenanceTime() || isExtendedMaintenanceTime())) {
        pruneData();
        // TODO: Update channel topic only on player list success per location.
        updatePlayerLists();
        updateChannelTopics();
      }
      console.log('update() loop complete'); // Ideally, this would run after the above processing is complete, by making nice batches of promises
      updateTimeoutId = setTimeout(update, REFRESH_INTERVAL);
    })
    .catch((err) => {
      console.log(err);
      console.log('\n@@@@@\n--> Error detected in at least 1 cab. \n@@@@@\n');
    });
}

// Initialize Discord Bot
const client = new Discord.Client();

client.on('ready', () => {
  console.log('Connected');
  console.log(`Logged in as ${client.user?.tag}!`);
  console.log(client.user?.username + ' - (' + client.user?.id + ')');
});

// Reused in a few places
// Plus we have the same channel name on multiple guilds
function getChannelsWithName(name: string): Discord.Collection<string, Discord.TextChannel> {
  // Discord types aren't smart about checking type here, so cast to TextChannel after we've already checked for 'text'
  const textChannels: Discord.Collection<string, Discord.TextChannel> = client.channels.cache.filter(
    (channel) => channel.type === 'text'
  ) as Discord.Collection<string, Discord.TextChannel>;

  return textChannels.filter((channel) => channel.name === name);
}

function monospace(message: string) {
  return '```' + (message || ' ') + '```';
}

function pingChannel(channel: Discord.TextChannel, message: string) {
  console.info(`Sending message to ${channel.guild.name}/#${channel.name}: ${message}`);
  channel.send(message);
}

function pingChannelsForLocation(loc: Shop, message: string) {
  console.info('pingChannel ' + loc.id + ': ' + message);
  const channels = getChannelsWithName(loc.id);
  if (!channels.size) {
    console.error('Could not find channels for location ' + loc.id);
  } else {
    channels.forEach((channel) => pingChannel(channel, message));
  }
}
function reportTodaysPlayers(loc: Shop) {
  getChannelsWithName(loc.id).forEach((channel) => reportTodaysPlayersForChannel(channel, loc));
}

// https://medium.com/@Dragonza/four-ways-to-chunk-an-array-e19c889eac4
function chunk(array: Array<string>, size: number) {
  const chunked_arr = [];
  let index = 0;
  while (index < array.length) {
    chunked_arr.push(array.slice(index, size + index));
    index += size;
  }
  return chunked_arr;
}

function reportTodaysPlayersForChannel(channel: Discord.TextChannel, loc: Shop) {
  const todaysPlayers = getTodaysPlayers(loc);
  const today = todaysPlayers.length === 0 ? 'today.' : 'today:';
  const s = todaysPlayers.length === 1 ? '' : 's';
  let message = `${todaysPlayers.length} player${s} ${today}`; // TODO: replace with YYYY-MM-DD
  // Instead of trying to compute the perfect string length <= 2000, just safely/simply cut off at 48 players per message.
  chunk(todaysPlayers, 48).forEach((chunkOf48Players) => {
    message += monospace(chunkOf48Players.join('\n'));
    console.info(`Sending message to ${channel.guild.name}/#${channel.name}: ${message}`);
    channel.send(message);
    message = '';
  });
  if (message && todaysPlayers.length) {
    // Any remaining message that wasn't chunked and sent
    channel.send(message);
  }

  if (todaysPlayers.length && loc.numPlayersEachHour.some((element) => element > 0)) {
    const reportTime = new Date();
    if (loc.timeZone.startsWith('America') || loc.timeZone.indexOf('Honolulu') > -1) {
      reportTime.setUTCHours(usReportTime);
    } else {
      reportTime.setUTCHours(jpReportTime);
    }
    const localReportTime = new Date(reportTime.toLocaleString('en-US', { timeZone: loc.timeZone }));

    const graphStrings = ['...'];

    // Determine the hour at which the first player of the day is detected.
    // This is when we should begin our graph.
    let graphStartingIndex = 0;
    for (let index = 0; index < 24; index++) {
      if (loc.numPlayersEachHour[index] > 0) {
        graphStartingIndex = index;
        break;
      }
    }

    // Determine the hour at which the last player of the day is detected.
    // This is when we should end our graph.
    let graphEndingIndex = 23;
    for (let index = 23; index >= 0; index--) {
      if (loc.numPlayersEachHour[index] > 0) {
        graphEndingIndex = index;
        break;
      }
    }

    for (let index = graphStartingIndex; index <= graphEndingIndex; index++) {
      const hour = (index + localReportTime.getHours()) % 24;

      let timeString;
      if (hour === 0) {
        timeString = `12 AM `;
      } else if (hour === 12) {
        timeString = `12 PM `;
      } else if (hour < 12) {
        timeString = `${hour} AM `;
      } else {
        timeString = `${hour - 12} PM `;
      }

      if (loc.numPlayersEachHour[index] > 0) {
        graphStrings.push(
          `${timeString.padStart(6).padEnd(6 + loc.numPlayersEachHour[index], '█')} ${loc.numPlayersEachHour[index]}`
        ); // 12 AM █████ 5
      } else {
        graphStrings.push(`${timeString.padStart(6)}`);
      }
    }

    graphStrings.push('...');
    channel.send(monospace(graphStrings.join('\n')));
  }
}

function summaryHereString(loc: Shop, { includeList = true } = {}) {
  const currentTime = new Date();
  const nowString = timeString(currentTime, loc.timeZone);

  let numActivePlayers = 0;
  const playerNamesTimes: string[] = [];

  loc.todaysPlayers.forEach(function (player) {
    const timeSinceSeen = timeDifferential(currentTime, player.lastTime);
    if (timeSinceSeen.minOnly <= RECENT_PLAYER_CUTOFF_MINUTES) {
      numActivePlayers++;
      if (playerIsHidden(player)) {
      } else if (playerIsVisible(player, loc)) {
        playerNamesTimes.push(`${player.name} ${timeSinceSeen.minOnly}m`);
      } else {
        playerNamesTimes.push(`${timeSinceSeen.minOnly}m`);
      }
    }
  });

  let summaryHereString;
  if (loc.todaysPlayers.length === 0) {
    summaryHereString = `${nowString}: 0 players today.`;
  } else if (numActivePlayers === 0) {
    // TODO: If a hiddenPlayer is here, we'll still report them. Since this is pretty rare, just don't solve for this for now.
    const players =
      loc.todaysPlayers.length === 1 ? "Today's only player has" : `All ${loc.todaysPlayers.length} players today have`;
    const timeSinceSeen = timeDifferential(currentTime, loc.todaysPlayers[0].lastTime);
    summaryHereString = `${nowString}: ${players} left! :eyes:`;
    if (!playerIsHidden(loc.todaysPlayers[0]) && playerIsVisible(loc.todaysPlayers[0], loc)) {
      summaryHereString += ` Last player seen: ${loc.todaysPlayers[0].name} ${timeSinceSeen.str} ago.`;
    }
  } else {
    const s = numActivePlayers === 1 ? '' : 's';
    summaryHereString = `${nowString}: ${numActivePlayers}/${loc.todaysPlayers.length} player${s} in the last ${RECENT_PLAYER_CUTOFF_MINUTES} minutes. :eyes: ${tftiEmoji}`;
    if (includeList && playerNamesTimes.length !== 0) {
      const numAnonymousPlayers = numActivePlayers - playerNamesTimes.length;
      const playersNamesTimesString = playerNamesTimes.join(', ');
      const othersString = numAnonymousPlayers > 0 ? ` and ${numAnonymousPlayers} others` : '';
      const commaString = othersString && playerNamesTimes.length > 1 ? ',' : '';
      summaryHereString += ' (' + playersNamesTimesString + commaString + othersString + ')';
    }
  }

  return summaryHereString;
}

function updateChannelTopic(loc: Shop, channel: Discord.TextChannel): Promise<void> {
  return channel
    .setTopic(summaryHereString(loc))
    .then((guildChannel) => {
      // We know this is a text channel
      const textChannel = guildChannel as Discord.TextChannel;
      console.log(`Updated topic in ${textChannel.guild.name}/#${loc.id}: ${textChannel.topic}`);
    })
    .catch((error) => console.error('Failed to update ' + loc.id, error));
}

function updateChannelsTopicForLocation(loc: Shop): Array<Promise<void>> {
  const channels = getChannelsWithName(loc.id);
  if (!channels.size) {
    console.error('Could not find channels for location ' + loc.id);
    return [];
  } else {
    return channels.map((channel) => updateChannelTopic(loc, channel));
  }
}

function updateChannelTopics() {
  return ALL_LOCATIONS.forEach((loc) => {
    return updateChannelsTopicForLocation(loc);
  });
}

client.on('error', console.error);

client.on('message', (message) => {
  if (message.content.substring(0, 1) == '!') {
    const args = message.content.split(' ');
    const cmd = args[0].substring(1);
    console.info('Command ' + cmd + ' received from ' + message.author.tag);

    const channel = message.channel;
    if (channel.type !== 'text') {
      return;
    }

    const shop = ALL_LOCATIONS.find((shop) => shop.id === channel.name);

    const isAdmin = adminDiscordTags.includes(message.author.tag);

    if (isAdmin) {
      if (cmd === 'yeet' && shop) {
        return ALL_LOCATIONS.forEach((loc) => reportTodaysPlayers(loc));
      } else if (cmd === 'revealEverywhere') {
        channel.send('Dancer names will be revealed automatically for the rest of the day.');
        return ALL_LOCATIONS.forEach((loc) => (loc.eventMode = true));
      } else if (cmd === 'hideEverywhere') {
        channel.send('Dancer-name-reveal behavior is now back to default.');
        return ALL_LOCATIONS.forEach((loc) => (loc.eventMode = false));
      }
    }

    if (!shop) {
      console.error('Could not find shop with id ' + channel.name);
      return;
    }

    if (cmd === 'here') {
      const recentPlayers = getRecentPlayers(shop);
      const response = summaryHereString(shop, { includeList: false }) + monospace(recentPlayers.join('\n'));
      console.info(`Sending message to ${channel.guild.name}/#${channel.name}: ${response}`);
      channel.send(response);

      // Also force a !refresh (afterwards)
      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId);
      }
      update();
    } else if (cmd === 'whose') {
      channel.send('joe mamma... hoes mad');
    } else if (isAdmin) {
      if (cmd === 'all') {
        reportTodaysPlayersForChannel(channel, shop); // Change to true for debugging.
      } else if (cmd === 'addcab') {
        const cookieValue = args[1];
        const cab = new Cab(cookieValue);
        const cabIndex = shop.cabs.length;
        shop.cabs.push(cab);
        getInitialDataForCab({
          cab,
          cabIndex,
          shop,
        })
          .then(() => {
            channel.send('Added');
          })
          .catch((err) => {
            console.error('Failed to add cab', err);
          });
      } else if (cmd === 'removecab') {
        const cabIndex = parseInt(args[1]);
        console.log(
          'before remove',
          shop.cabs.map((cab) => cab.cookieValue)
        );
        shop.cabs.splice(cabIndex, 1);
        console.log(
          'after remove',
          shop.cabs.map((cab) => cab.cookieValue)
        );
        channel.send('Removed');
      } else if (cmd === 'addvisibleplayer') {
        const ddrCode = args[1];
        visiblePlayers.push(ddrCode);
        channel.send('Added');
      } else if (cmd === 'removevisibleplayer') {
        const ddrCode = args[1];
        const index = visiblePlayers.indexOf(ddrCode);
        if (index >= 0) {
          visiblePlayers.splice(index, 1);
        }
        channel.send('Removed');
      } else if (cmd === 'reveal') {
        shop.eventMode = true;
        channel.send('Dancer names will be revealed automatically for the rest of the day.');
      } else if (cmd === 'refresh' || cmd === 'resume') {
        if (updateTimeoutId) {
          clearTimeout(updateTimeoutId);
        }
        update();
      } else if (cmd === 'pause') {
        if (updateTimeoutId) {
          clearTimeout(updateTimeoutId);
        }
      }
    }
  }
});

// Initialize locations
const CONFIG_LOCATIONS: Array<ConfigShop> = config.get('shops') || [];
const ALL_LOCATIONS: Array<Shop> = CONFIG_LOCATIONS.map((configShop) => new Shop(configShop));

function getAllInitialData() {
  console.log('getAllInitialData');

  const promises = ALL_LOCATIONS.map((loc) => {
    return Promise.all(getInitialData(loc))
      .catch((err) => {
        console.error(getUrl(), 'failed,', err, 'retrying', loc.id, getUrl());
        return Promise.all(getInitialData(loc))
          .then(() => {
            updateChannelsTopicForLocation(loc);
          })
          .catch((err) => {
            const errorMessage = `Damn we failed on the retry, too. ${loc.id}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
          });
      })
      .then(() => {
        updateChannelsTopicForLocation(loc);
      });
  });
  return (
    Promise.all(promises)
      // We would use .finally() if it existed, but .then() is fine since we'll exit on an error anyways.
      .then(() => {
        console.log('getAllInitialData complete, starting update loop');
        updateTimeoutId = setTimeout(update, REFRESH_INTERVAL);
      })
  );
}

const DISCORD_BOT_TOKEN: string = config.get('discordBotToken');
if (!DISCORD_BOT_TOKEN) {
  console.error('Missing discordBotToken config key.');
  process.exit();
}
client
  .login(DISCORD_BOT_TOKEN)
  .then(getAllInitialData)
  .catch((err) => {
    console.error('--> Failed to get initial data. Restart the bot.');
    process.exit();
    throw err;
  });
