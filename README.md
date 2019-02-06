# kensaku

A DDR A machine-stalking Discord bot.

## Setting up the bot

For the bot to actually run.

### Install modules

`npm install` in the main folder.

### Input cookies and bot token

1. Make a file, and name it `.env`.

2. Input cookie values, bot token, and admin tag. For example,
```
CLIENT_TOKEN=[client token]
MILPITAS=[cookie for Milpitas]
SANJOSEJ=[cookie for San Jose J-cab]
SANJOSEK=[cookie for San Jose K-cab]
DALYCITY=[cookie for Daly City]
CONCORD=[cookie for Concord]
ADMIN_TAG=[username#tag]
```

## Commands

Typing `!whose` in Discord should yield the recent players of that location. For example, typing `!whose` in `#dnb-milpitas` should list the players who have logged in at Milpitas within the last 2 hours. `!help` will list the available commands. `!yeet` and `!reset` are restricted to the user with the admin tag. `!yeet` lists all players that played on the current day, and `!reset` resets the channel topics to `kensaku is offline.`.

## Adding more locations

1. To create a machine location, use `new Location (cabs, name)` where `cabs` is the array of `Cab` objects and `name` is the location's name.

2. To create a cab, use `new Cab (cookie, name)` where `cookie` is the cookie value (and can be accessed with `process.env.[name of value in the .env file]`) and `name` is the cabinet name.

3. Currently, the code already contains 4 locations: Milpitas, San Jose, Daly City, and Concord. San Jose has two cabs.

3. Code regarding specific locations have to be added manually. For example, if the channel from which the bot is called is called `dnb-milpitas` and `milpitas` is the Location object, then `function pingChannel(str, locName)`, `function yeet(locName)`, `async function updateChannelTopics()`, and `bot.on('message', message => { ... })` must be updated.

5. `getInitialData(loc)` should be called for every Location `loc`.

## Bugs
* Players who switch locations and were last to play at another location will mess up the list of the current day's players at their previous location. Specifically, the two players before the player who switched locations will show up.

## Changelog
* v0.5.0
  * Renamed `getCurrentData` to `getInitialData`
  * Secrets stored in `.env`
  * Updates the channel topics with recent players
  * `now.json` allows the code to be run with [now](https://zeit.co/now)
  * `getRinonMessage()` is no longer used
  * `!yeet` can now only be called by admin
  * `!whose` is still available for normal users
  * Added commands `!reset`, `!help`
  * Restructured data into `Location`s that have `Cab`s which store `Player`s
    * As a result, data from 2+ cabs in 1 location is merged
    * Fixed situation where one player would switch cabs when they were last to play on the old cab
* v0.3.2
  * Can now input bot token and cookies through `secret.txt`
  * Only lists players who logged in on the current day (new day starts at 4 am)
  * Lists the time a player starts their session
  * Max 20 players instead of 10
* v0.3.0
  * Uses `discord.js` instead of `discord.io`
  * Removed a lot of useless code
  * Improved output formatting
  * Output is based on the channel from which the bot is called
  * Only lists players who logged in within the past 15 hours
  * Rinon sends you a cute message
* v0.2.0
  * Added support for multiple locations
* v0.1.0
  * Initial release
