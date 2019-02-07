# kensaku

A DDR machine-stalking Discord bot.

## Implementation

The node script polls for changes every minute and stores results in memory to determine differentials. Relevant information is reported to Discord channels.

## Setup

1. Install `nvm` (https://github.com/creationix/nvm) and `node` (`nvm install node` works)

1. `npm install`

1. Create a file called `.env` with your Discord admin user tag, Discord bot token, and p.eagate573.jp `M573SSID` cookie values:
```
ADMIN_TAG=[username#tag]
DISCORD_BOT_TOKEN=[bot token from discordapp.com/developers/applications/id/bots]
EACOOKIE_ROUND1SANJOSE_J=12345678-90ab-cdef-0123-4567890abcde
EACOOKIE_ROUND1SANJOSE_K=[cookie for San Jose K-cab]
EACOOKIE_DNBMILPITAS=[cookie for Milpitas]
EACOOKIE_DNBDALYCITY=[cookie for Daly City]
EACOOKIE_ROUND1CONCORD=[cookie for Concord]
```

1. Run with `node bot.js`

## Usage

The bot sends a message when a player completes their first game of the day (except when they were also the last person to play the day before, which is a rare occurrence.)

The bot also updates the topic every minute with the players seen over the past hour.

Manual commands `!here` and `!all` in a channel will show players at the shop which that channel represents. For example, typing `!here` in `#dnb-milpitas` should list the players who have logged in at Milpitas within the last 2 hours, and `!all` (restricted to an admin) will show the entire day.

## Adding more locations

1. To create a shop, use `new Location({name, id, timeZone, cabs: []})` where `id` represents the Discord channel for this shop, `timeZone` is a TZ database name (like `America/Los_Angeles`), `cabs` is an array of `Cab` objects, and `name` is the shop's name (currently only used for logging - will delete soon).

2. To create a cab within a shop, use `new Cab(cookie)` where `cookie` is the cookie value (and can be accessed with `process.env.[name of value in the .env file]`).

3. Currently, the code already contains 4 locations: Milpitas, San Jose, Daly City, and Concord. San Jose has two cabs. To add a location, modify the `ALL_LOCATIONS` array. In the future, this will be removed in favor of a separate configuration file.
