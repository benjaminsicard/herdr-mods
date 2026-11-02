# Universal auto tabs implementation contract

`mods/auto-tabs/main.js` adapts Herdr 0.1.12's shipped `tabs` mod. It imports `syncNames()` from `names.js`, starts a 3000ms timer in `init(_props, cx)`, increases name width from 170px to 280px, and points Windows icons at `mods/auto-tabs/`. Other native UI behavior is unchanged in the source.

`mod.json` sets `place` to `none` because the mod replaces a layout's tab bar. It records the cloned `tabs` version as `0.1.12`. The mod uses the app's shipped menus, spinner, close icon, panel icons, layout nodes, and commands.

## Name selection

`syncNames()` reads all live tabs from `spaces()` and terminal panes from `panes()`. It ignores mod panes and panes whose tabs no longer exist. The first pane at the highest available rank supplies the name:

| Priority | Pane metadata | Name |
|---|---|---|
| Highest | Non-shell program with a useful title | Terminal title |
| Middle | Non-shell program without a useful title | Configured `program.name`, then `app` |
| Lowest | Shell with a working directory | Last folder name |

A title equal to the program key, app identity, or display name counts as a fallback. A configured display name replaces a raw identity when available. `program.agent`, status, and focus do not affect name selection. Shells ignore terminal titles.

Names preserve punctuation. Only known leading spinner frames followed by whitespace are removed. Conventional home paths become `~`. POSIX roots, drive roots, and UNC share roots keep root labels. Both slash styles are supported.

## Ownership and queued commands

The public module exports only `syncNames()`. Each tab's ownership record lives under the existing shared key `tab-titles.set`:

| Record | Meaning |
|---|---|
| `{mode: "auto", applied}` | Last confirmed automatic name, or `null` before confirmation |
| `{mode: "manual"}` | An observed manual override |
| `{mode: "pending", applied, from, target}` | Queued rename and the observed baseline |

`from` stores the baseline `named` and `name` fields. Legacy string records migrate as evidence of an automatic name. Initially unnamed tabs can enter automatic mode. A live non-shell display name also qualifies as a launcher default. Unrecognized named tabs remain unowned and can qualify later when program metadata arrives.

The module checks ownership before comparing the desired name with the current name. Title equality alone does not establish ownership. An observed manual override remains manual until the name is cleared. A preexisting manual name equal to a launcher default remains ambiguous.

`run("tab.rename", {id, name})` queues a rename. The record becomes confirmed only when live tab data matches the target. An unchanged baseline waits one poll before a retry. Changing titles wait for the pending target to be observed before the latest title is sent.

Retry waits stay in module memory. Stable polls send no commands and write no shared state. Synchronous command errors preserve observed ownership and propagate after other tabs and cleanup. Closed tabs are pruned. Mod-only tabs retain their records.

The host has no rename acknowledgment or compare-and-set operation. An already queued command can race a manual rename. Multiple bars share records without a lock, so each layout uses one instance.

## Space names

After tabs, `syncNames()` names each space after its active tab: the tab's chosen automatic name while the tab is automatic or pending, otherwise its own name when someone named it. Spaces use the same ownership records under the shared key `space-titles.set` and `space.rename`. An unnamed space starts automatic. A named space with no record is adopted when its name equals the last folder of the space folder or of any of its terminals, Herdr's own naming; any other name stays manual until cleared.

## Agents list

`mods/auto-agents/main.js` adapts Herdr 0.1.12's shipped `agents` mod. Each row shows its tab's name (the live agent title for an unnamed or default-named tab), or the agent's program for an automatic tab number. The space name, the `· detail` suffix and the machine tag are removed in every view.

## Validation scope

The dependency-free tests load the actual `names.js` with mocked Herdr APIs:

```sh
	node --experimental-vm-modules tests/names.test.mjs
```

`herdr-app check mods/auto-tabs` verifies initial loading with empty live data. Desktop interaction and live naming checks are separate. [The installation guide](README.md#check-the-installed-behavior) lists those checks without claiming that automated tests prove them.
