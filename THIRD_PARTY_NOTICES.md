# Third-party notices

## Herdr native tab bar and Windows icons

Source project: [herdrdev/herdr-app](https://github.com/herdrdev/herdr-app).

Source revision: [`da2e8b97b9009e16c41fefdfdf0b1f5e625b350b`](https://github.com/herdrdev/herdr-app/tree/da2e8b97b9009e16c41fefdfdf0b1f5e625b350b), Herdr 0.1.12.

The following files originate in that revision's `defaults/mods/tabs/` directory:

- `mods/auto-tabs/main.js` adapts the native tab bar. It adds the `syncNames` import and 3000ms timer, increases name width from 170px to 280px, and changes Windows icon paths to `mods/auto-tabs/`.
- `mods/auto-agents/main.js` adapts the native `agents` mod from `defaults/mods/agents/`. Its rows show their tab's name and drop the space name, its secondary detail and the machine tag.
- `mods/auto-tabs/win-min.svg`, `win-max.svg`, `win-restore.svg`, and `win-close.svg` are unchanged copies.

These upstream files are covered by the Apache License 2.0. The unchanged upstream license is included at [licenses/herdr-app-APACHE-2.0.txt](licenses/herdr-app-APACHE-2.0.txt).

## Original auto-tabs mod

[longwave/herdr-auto-tabs](https://github.com/longwave/herdr-auto-tabs) supplied the original automatic tab naming mod idea and the starting point for the naming extension.

The provided original mod source has no explicit license grant. The scoped Herdr license above does not establish a repository-wide license or grant rights to other content in this repository.
