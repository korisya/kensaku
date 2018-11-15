# kensaku

A DDR A machine-stalking Discord bot.

## Setting up the bot

For the bot to actually run.

### Install modules

`npm install` in the main folder.

### Necessary code

The cookie values (lines 165-169) and bot token (line 244) must be added to bot.js.

## Commands

Typing `!whose` in Discord should yield the recent players of that location. For example, typing `!whose` in `#dnb-milpitas` should list the players who have logged in at Milpitas within the past 15 hours, up to 10 players.

## Adding more locations

1. To create a machine location, use `new Location (val, name)` where `val` is the cookie's value and `name` is the location's name.

2. Currently, the code already has 4 locations: Milpitas, San Jose, Daly City, and Concord. San Jose has two machines, and each machine is represented by a separate Location object.

3. Code for outputting each machine location has to be added manually. For example, if the channel from which the bot is called is called `#dnb-milpitas` and `milpitas` is the Location object, then this code should be added after line 192 in bot.js:
```javascript
case 'dnb-milpitas':
  message.channel.send({embed:{
    title: milpitas.name,
    description: getRinonMesssage() + "\n```" + milpitas.getOutput() + "```",
    color: 0xFFFFFF,
    timestamp: new Date()
  }});
  break;
```

4. If a location has two machines, then two Location objects are necessary. Furthermore, if they are to be called from the same channel, then the command `!whose` must have an argument; for example, typing `!whose j` in the channel `#round1-sanjose` will list players who logged on to the J-cab. The argument `'j'` is stored in the variable `subcmd`. See the following code for reference:
```javascript
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
```
5. `getCurrentData(loc)` should be called for every Location `loc` when the bot starts (see lines 178-182)

## Changelog
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
