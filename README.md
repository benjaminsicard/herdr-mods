# Universal auto tabs for Herdr

A [Herdr](https://herdr.dev) mod that names tabs from terminal titles, running programs, or shell folders. It checks all terminal tabs every three seconds while its tab bar is loaded.

- A non-shell program uses its terminal title, or its configured display name and then its app name when no useful title is available.
- A shell uses its last folder name and ignores titles left by a previous program.
- An observed manual rename stays until you clear the name to resume automatic naming.
- In split tabs, useful program titles outrank program names, which outrank shell folders. Pane order breaks ties.
- Names can occupy 280px instead of the native 170px.
- Each space follows its active tab's name. Herdr's own repo or folder name for a space is replaced; a space you named yourself keeps its name until you clear it.
- An optional `auto-agents` list shows each agent row as its tab's name, without the space, repo or machine.

The tab bar and agents list use Herdr 0.1.12's native UI, including its context menu and Windows window icons. The mod starts no programs, reads no files, and makes no network requests.

## Install this checkout

These commands require an installed Herdr desktop app and a POSIX shell. Read your local `~/.config/herdr-app/AGENTS.md` first. If your app uses another configuration directory, use the paths documented there.

1. Clone this repository to an unused directory, then enter it.

   ```sh
	git clone https://github.com/benjaminsicard/herdr-universal-auto-tabs.git
	cd herdr-universal-auto-tabs
   ```

2. Copy the mod only if the destination is absent. If an existing mod or layout uses the names below, stop and compare it before proceeding. Never overwrite an existing mod or layout.

   ```sh
	if [ -e "$HOME/.config/herdr-app/mods/auto-tabs" ] || [ -L "$HOME/.config/herdr-app/mods/auto-tabs" ]; then
		printf '%s\n' 'auto-tabs exists. Stop and compare it before installing.'
	else
		mkdir -p "$HOME/.config/herdr-app/mods" &&
			cp -R mods/auto-tabs "$HOME/.config/herdr-app/mods/auto-tabs"
	fi
   ```

   For the agents list, copy `mods/auto-agents` to `$HOME/.config/herdr-app/mods/auto-agents` the same way.

3. Check the copied mod with the installed app.

   ```sh
	herdr-app check "$HOME/.config/herdr-app/mods/auto-tabs"
	herdr-app check "$HOME/.config/herdr-app/mods/auto-agents"
   ```

4. Clone the main layout to an unused name. Herdr switches to the clone and refuses an existing destination. If `auto-tabs-main` exists, stop and compare it, then choose another unused name.

   ```sh
	herdr-app do layout.clone '{"name":"main","as":"auto-tabs-main"}'
   ```

5. Open `~/.config/herdr-app/layouts/auto-tabs-main.json`. In the tab bar block, replace `"content": { "mod": "tabs" }` with `"content": { "mod": "auto-tabs" }`. For the agents list, replace `"mod": "agents"` with `"mod": "auto-agents"` in the sidebar's agents block. Preserve the other blocks.

6. Restart Herdr if it does not discover the new mod, then complete the live checks below. Copy the mod directory rather than symlinking it, so Herdr can detect changes.

To return to the shipped tab bar, select the `main` layout with Ctrl+Shift+L. Keep the cloned layout and mod until you decide to remove them.

## Check the installed behavior

After installation, check these behaviors in Herdr:

- An unnamed shell tab shows its folder within one poll. Returning from a program restores the folder name.
- A program that publishes a terminal title shows that title. A silent program shows its configured display name or app name.
- A manual name survives title changes. Clearing the name resumes automatic naming.
- A split tab follows the first pane at the highest available naming rank.
- A space shows its active tab's name and changes when you switch tabs. A manual space name stays; clearing it resumes automatic naming.
- Agent rows show the tab name alone, in both the priority and grouped views.
- Tab selection, double-click rename, right-click menu, move, close, scroll, new tab, and Files and Changes controls still work.
- Window controls work on your platform. Check minimize, maximize, restore, and close on Windows.

The automated tests exercise naming logic through a mocked Herdr module. They do not independently prove desktop interactions. `herdr-app check` loads the mod with empty live data and does not prove live naming or later UI states.

## Limits

- Conversation topics appear only when a program publishes them as terminal titles. The mod does not inspect conversations, command arguments, or session files.
- Herdr reports a program started from a shell only when it recognizes it, as with Claude Code, Codex and other listed agents. An unrecognized program run from a shell prompt counts as the shell, so its tab shows the folder. Started directly as a tab's command, it shows its title.
- A named space whose name is not a folder of its terminals counts as yours and is left alone. Clear it to hand it to automatic naming.
- A manual name equal to a live program's default launch name is indistinguishable before adoption. A rename equal to the last automatic name also leaves no observable change.
- Herdr queues rename commands without acknowledgment or compare-and-set. The mod confirms names from live data and retries an unchanged pending command every second poll. An already queued command can race a later manual rename.
- Conventional Linux, macOS, and Windows home folders show `~`. Other home locations show their last folder name. Filesystem roots retain a root label.
- Mod-only tabs keep their names. Use one auto-tabs bar per layout. Automatic naming runs only while the bar is loaded.

## Verify changes

Run the dependency-free behavior tests from the checkout root:

```sh
	node --experimental-vm-modules tests/names.test.mjs
```

The 27 tests cover generic programs, space naming, manual naming, launch defaults, delayed commands, errors, split panes, paths, and punctuation. [RECIPE.md](RECIPE.md) records the implementation contract.

## Credits and licensing

The original mod idea comes from [longwave/herdr-auto-tabs](https://github.com/longwave/herdr-auto-tabs). The native tab bar, agents list and Windows SVG icons come from [herdrdev/herdr-app](https://github.com/herdrdev/herdr-app).

[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) identifies the upstream files, modifications, and scoped Apache 2.0 license. This repository does not declare a blanket license for other content.
