# @enapragma/lifeos

Opinionated installer/updater CLI for the LifeOS internal beta.

The npm package is only the tiny bootstrapper. The LifeOS app updates from the private `ena-pragma/lifeos` GitHub repo, default branch/channel `stable`.

## One-command install

```bash
npx @enapragma/lifeos install
```

That installs LifeOS into `~/.lifeos/app`, starts it with launchd, runs doctor, and prints the URL.

## Update

```bash
npx @enapragma/lifeos up
```

`up` fetches the latest `stable` channel, prints the current source version and updated source version, restarts LifeOS, and runs doctor.

## Commands

```bash
lifeos install              # clone/update, start, run doctor
lifeos up                   # update existing install, restart, run doctor
lifeos doctor               # verify local LifeOS
lifeos open                 # open http://127.0.0.1:3333
lifeos path                 # print install directory
lifeos uninstall            # stop launchd and remove ~/.lifeos/app
```

## Channels

Default channel is `stable`.

```bash
lifeos install --channel main
lifeos up --channel stable
```

## Private repo access

LifeOS is private. If clone fails, ask Carl for `ena-pragma/lifeos` access, then authenticate GitHub on the machine:

```bash
gh auth login
```

Or use SSH with a configured GitHub key:

```bash
lifeos install --repo git@github.com:ena-pragma/lifeos.git
```

## Local test before publish

From this package directory:

```bash
npm run check
npm run smoke
node bin/lifeos.js install --dir /tmp/lifeos-installer-smoke --port 3344 --label com.enapragma.lifeos.smoke --skip-doctor
node bin/lifeos.js doctor --dir /tmp/lifeos-installer-smoke --port 3344
node bin/lifeos.js uninstall --dir /tmp/lifeos-installer-smoke --label com.enapragma.lifeos.smoke
```
