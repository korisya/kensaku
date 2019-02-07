# kensaku

A DDR A machine-stalking Discord bot.

## Setting up the bot

For the bot to actually run.

### Install modules

`npm install` in the main folder.

### Input cookies and bot token

1. Make a file, and name it `.env`.

2. Input your Discord admin user tag, Discord bot token, and p.eagate573.jp `M573SSID` cookie values:
```
ADMIN_TAG=[username#tag]
DISCORD_BOT_TOKEN=[bot token from discordapp.com/developers/applications/id/bots]
EACOOKIE_ROUND1SANJOSE_J=12345678-90ab-cdef-0123-4567890abcde
EACOOKIE_ROUND1SANJOSE_K=[cookie for San Jose K-cab]
EACOOKIE_DNBMILPITAS=[cookie for Milpitas]
EACOOKIE_DNBDALYCITY=[cookie for Daly City]
EACOOKIE_ROUND1CONCORD=[cookie for Concord]
```

## Commands

Typing `!here` in Discord should yield the recent players of that location. For example, typing `!here` in `#dnb-milpitas` should list the players who have logged in at Milpitas within the last 2 hours. `!all` is restricted to the user with the admin tag. `!all` lists all players that played on the current day.

## Adding more locations

1. To create a machine location, use `new Location({name, id, timeZone, cabs: []})` where `id` represents the Discord channel for this location, `timeZone` is a TZ database name (like `America/Los_Angeles`), `cabs` is an array of `Cab` objects, and `name` is the location's name (currently only used for logging - will delete soon).

2. To create a cab, use `new Cab(cookie)` where `cookie` is the cookie value (and can be accessed with `process.env.[name of value in the .env file]`).

3. Currently, the code already contains 4 locations: Milpitas, San Jose, Daly City, and Concord. San Jose has two cabs. To add a location, modify the `ALL_LOCATIONS` array. In the future, this will be removed in favor of a separate configuration file.

5. `getInitialData(loc)` should be called for every `Location` `loc`.

## Bugs
* https://github.com/t3alizes/kensaku/issues

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
