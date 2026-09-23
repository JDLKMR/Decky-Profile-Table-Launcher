# Decky Profile Launcher
A Decky Loader plugin for the niche use-case of launching shell script-bound Steam shortcuts using profiles.

## Overview
The plugin makes it so that when you launch a game in Steam that is tied to a shell (.sh) script in either its Target or Launch Options fields, a prompt appears that lets you select which profile to launch the game with. This expects that your shell script utilizes "profiles", meaning that it performs different operations depending on what value you've set a specific variable to (default `PROFILE`). This variant of the plugin automatically generates the list of profiles every time a game is selected according to how the profiles are arranged in a table within the shell script.

Example table:

```
declare -A PROFILE_TYPES=(
    [1]=default
    [2]=ap
)
declare -A PROFILE_NAMES=(
    [1]="Base Game"
    [2]="Archipelago"
)
```

In this example, `PROFILE_TYPES` dictates how the script's side handles things, and `PROFILE_NAMES` dictates how this plugin reads it.

So for example, you can select the second profile in the launch prompt to set `PROFILE=2`,  and it will then change the variable in the file to `2` before launching the game, making it run the set of tasks associated with that profile and allowing you to do just about anything you want from one single Steam shortcut.

This minimizes the amount of split configuration (such as artwork, playtime, music, achievements, etc. if you have other plugins) between shortcuts and centralizes everything into one game shortcut.

Just watch out for Steam Input. It will be shared across all profiles, naturally.

## Features
- Works with both Steam and non-Steam games
- Toggle whether a game always prompts you on launch
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
