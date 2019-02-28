# kensaku

A DDR machine-stalking Discord bot.

## Implementation

The node script polls `kensaku.html?mode=4` every minute and determines differentials. Relevant information is stored in memory and reported to Discord channels. Currently, a single script handles all of this.

## Setup

1. Install `nvm` (https://github.com/creationix/nvm) and `node` (`nvm install node` works)

1. `npm install`

1. Edit `config/default.json` with your Discord bot token and your shops (one provided as an example) with p.eagate573.jp `M573SSID` cookie values:

1. Run with `node bot.js`. For a different config file (like `config/production.json`), run `NODE_ENV=production node bot.js`.

## Usage

The bot sends a message when a player completes their first game of the day (except when they were also the last person to play the day before, which is a rare occurrence.)

The bot also updates the topic every minute with the players seen over the past hour.

Manual commands `!here` and `!all` in a channel will show players at the shop which that channel represents. For example, typing `!here` in `#dnb-milpitas` should list the players who have logged in at Milpitas within the last 2 hours.
