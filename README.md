# @enapragma/lifeos

Opinionated installer CLI for the LifeOS internal beta.

## One-command install

```bash
npx @enapragma/lifeos install
```

That installs LifeOS into `~/.lifeos/app`, starts it with launchd, runs doctor, and prints the URL.

## Commands

```bash
lifeos install              # clone/update, start, run doctor
lifeos up                   # same as install, idempotent
lifeos doctor               # verify local LifeOS
lifeos open                 # open http://127.0.0.1:3333
lifeos path                 # print install directory
lifeos uninstall            # stop launchd and remove ~/.lifeos/app
```

## Channels

Default channel is `stable`.

```bash
lifeos install --channel main
lifeos install --channel stable
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
