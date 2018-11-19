# kensaku

A DDR A machine-stalking Discord bot.

## Setting up the bot

For the bot to actually run.

### Install modules

`npm install` in the main folder.

### Input cookies and bot token

There are two ways to add the cookies and bot token to the program:
1. Create a new file, `secret.txt`. Paste the bot token first, and then each cookie, all separated by a space. Within `bot.js`, the token will be `secrets[0]`, the first cookie will be `secrets[1]`, the second cookie will be `secrets[2]`, and so on.
2. Add the cookie values (lines 224-228) and bot token (line 303) to `bot.js`. Remove lines 7-13 in `bot.js`.

## Commands

Typing `!whose` in Discord should yield the recent players of that location. For example, typing `!whose` in `#dnb-milpitas` should list the players who have logged in at Milpitas within the past 15 hours, up to 10 players.

## Adding more locations

1. To create a machine location, use `new Location (val, name)` where `val` is the cookie's value and `name` is the location's name.

2. Currently, the code already has 4 locations: Milpitas, San Jose, Daly City, and Concord. San Jose has two machines, and each machine is represented by a separate Location object.

3. Code for outputting each machine location has to be added manually. For example, if the channel from which the bot is called is called `#dnb-milpitas` and `milpitas` is the Location object, then this code should be added after line 251 in `bot.js`:
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
5. `getCurrentData(loc)` should be called for every Location `loc` when the bot starts (see lines 237-241 in `bot.js`).

## Bugs
* Sometimes the bot will output players with blank names.

## Changelog
* v0.3.2
  * Can now input bot token and cookies through `secret.txt`
  * Only lists players who logged in on the current day (new day starts at 4 am)
  * Lists the time a player starts their session
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
