# Decky Profile Launcher
A Decky Loader plugin for the niche use-case of launching shell script-bound Steam shortcuts using profiles.

## Overview
The plugin makes it so that when you launch a game in Steam that is tied to a shell (.sh) script in either its Target or Launch Options fields, a prompt appears that lets you select which profile to launch the game with. This expects that your shell script utilizes "profiles", meaning that it performs different operations depending on what value you've set a specific variable to (default `PROFILE`).

So for example if `PROFILE=2`, you can select Profile 2 in the launch prompt and it will then change the variable in the file to 2 before launching the game, allowing you to do just about anything you want from one single Steam shortcut.

This minimizes the amount of split configuration (such as artwork, playtime, music, achievements, etc. if you have other plugins) between shortcuts and centralizes everything into one game shortcut.

Just watch out for Steam Input. It will be shared across all profiles, naturally.

## Features
- Add or remove profiles and name them
- Rename profiles on a per-game basis (as well as revert them to default)
- Re-order profiles on a per-game basis (as well as revert them to default)
- Works with both Steam and non-Steam games
- Toggle whether a game always prompts you on launch
- Choose which profiles a game will prompt you for
- Add filename exclusions for .sh files
- Change the name of the variable it looks for to edit in the script
- Save backups of your scripts upon first-time use (can be toggled off)

## Example Use
Having one single Steam shortcut for The Legend of Zelda: Ocarina of Time, then using the script's profiles and this plugin to split it between:
- Ocarina of Time (Base Game)
- Ocarina of Time Randomizer
- Ocarina of Time Romhack
- Ocarina of Time Archipelago
- Ship of Harkinian

## Building
```
npm install
npm run build
```
## AI Disclosure
All programming was done using Claude. Testing, documentation, and any other writing is all done by me.
