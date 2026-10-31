# Releasing

How a version gets from this repository to people, and why the steps are in the order they are. The Makefile does the work:
`make help` lists it.

## The short version

```sh
npm login                   # yourself, once. The Makefile never logs in.

# the first release: 0.1.0 is already versioned and has its changelog heading
make publish tag push
make verify

# every later release
#   1. list what changed under "## Unreleased" in CHANGELOG.md, commit, push
make release BUMP=patch     # or minor, or major, or an exact version like 1.0.0
make verify
```

`npm publish` asks for your 2FA code. That is the only prompt.

## What each step does

| Target | Does |
|---|---|
| `make check` | Is the repo ready to start a release? On `main`, nothing uncommitted, in step with `origin`, and something under "Unreleased". Changes nothing. |
| `make test` | `npm test`. |
| `make contents` | `npm pack --dry-run`: the files npm would ship. |
| `make dry-run` | `npm publish --dry-run`. Nothing is published. |
| `make version BUMP=patch` | Bumps `package.json`, moves the changelog's "Unreleased" under the new version with today's date and leaves a fresh empty "Unreleased" above it, and commits both as `Release vX.Y.Z` (the notes are the commit body). |
| `make publish` | Checks (clean tree, not behind `origin`, changelog heading for this version, version not on npm, no tag yet, logged in), then `npm publish`. `prepublishOnly` runs the tests once more. |
| `make tag` | Tags the commit npm recorded as the source of the published version (an annotated tag carrying the changelog notes). Refuses if the version is not on npm. |
| `make push` | Pushes the branch, then the tag. |
| `make release BUMP=...` | Check, test, version, publish, tag, push, in that order. |
| `make github-release` | Creates the GitHub release for the tag with the changelog notes (needs `gh`). |
| `make verify` | After publishing: installs the published version into a throwaway pi config and looks for it in pi.dev's catalog. |

### Why this order

`npm publish` is the one step that cannot be undone: a version, once published, can never be replaced. So everything that can
fail is checked before it, and nothing is tagged or pushed until it has succeeded. A tag that is pushed before publishing is a
promise that the version exists, and moving a pushed tag is the thing to avoid.

The tag goes on the commit npm says it published from (the `gitHead` it records), not on whatever `HEAD` is by then, so it is
right even if you committed something in between.

### If it stops half way

| What happened | State | Do |
|---|---|---|
| A check refused to start | Nothing changed | Read the message and fix that. |
| Tests failed | Nothing changed | Fix them. |
| The changelog step failed | `package.json` is put back | Fix `CHANGELOG.md`, run again. |
| `npm publish` failed (a wrong 2FA code, a dropped connection) | The release commit exists locally. Nothing is tagged, nothing is pushed | Run `make publish tag push`. |
| Published, but the push failed | npm has it, the tag exists locally | Fix the git credentials (see below), run `make push`. |
| You published something wrong | It is on npm for good | Fix it and release a new patch version. |

If `git push` asks for a password, run `gh auth setup-git` once. GitHub no longer accepts passwords, and this lets git use your
`gh` login.

## The changelog

`CHANGELOG.md` keeps a `## Unreleased` section at the top. Add a line there with every change a user can see, in the commit
that makes the change. `make version` turns it into `## 0.2.0 (2026-11-02)`.

The file ships in the npm package, and pi shows it to users after an update: it reads headings that start with `## ` and a
version, such as `## 0.2.0 (2026-11-02)`, and shows the entries newer than the version the user had.

## The package metadata

| Where | What |
|---|---|
| `description` in `package.json` | Shown on npm, on pi.dev's catalog card and, kept the same, as the GitHub repository description. One sentence, under 160 characters. |
| `keywords` in `package.json` | npm search. `pi-package` is required for pi.dev (below). |
| GitHub topics | Repository search. Set with `gh repo edit newtonapple/pi-openui --add-topic <topic>`. Currently: `ai-agents`, `charts`, `coding-agent`, `dashboard`, `data-visualization`, `diagrams`, `kitty-graphics`, `openui`, `pi`, `pi-coding-agent`, `pi-extension`, `pi-package`, `terminal-ui`, `tui`, `typescript`. |
| `pi.image` in `package.json` | The preview picture on pi.dev: an `https` URL to a PNG, JPEG, GIF or WebP. `pi.video` takes an MP4. It points at `docs/screenshots/dashboard.png` on GitHub's raw host, so keep that file where it is. |
| `repository`, `homepage`, `bugs` | The links on npm's page. They also make the README's relative pictures and links work there. |
| GitHub social preview | Settings, Social preview, upload an image (`docs/screenshots/dashboard.png` works). The API cannot set it. |

`test/package.test.ts` checks the manifest, the keywords, the preview picture and the README's install commands.

## pi.dev's package catalog

[pi.dev/packages](https://pi.dev/packages) is an index of **npm** packages that carry the `pi-package` keyword. There is no
submission and nothing to apply for: publish to npm with the keyword (it is already in `package.json`) and the package appears,
with its description and the `pi.image` preview. A package installed only from git is not listed.

Indexing is not instant. After `make publish`, run `make verify` to install the published version into a throwaway config and
see whether `https://pi.dev/packages/pi-openui` exists yet. A "not listed yet" is a reason to wait, not a failure.

## GitHub is enough for installing

pi installs from git as well, so people can use `pi install git:github.com/newtonapple/pi-openui` without npm. pi clones the
repository, reads the `pi` key in `package.json` (`"extensions": ["./src/pi/extension.ts"]`) and loads that file. npm adds the
catalog listing and `pi install npm:pi-openui`.

The extension has no runtime dependencies of its own. It imports `@earendil-works/pi-tui`, `@earendil-works/pi-coding-agent`
and `typebox`, which pi supplies, so they are `peerDependencies` with the range `"*"` and are never listed under `dependencies`
(a second copy would split pi's classes and registries). Without the `pi` key an install appears to succeed and pi then fails
with `Cannot find module`. `test/package.test.ts` checks all of this. The `.pi/extensions/openui.ts` shim is for working inside
this repository only.

A tag lets people pin the git install (`pi install git:github.com/newtonapple/pi-openui@v0.1.0`). `make tag` makes it after
publishing. pi pins tags and commits: a configured tag does not move on `pi update`.

## npm: the one-time setup

You do **not** need an access token to publish from your own machine. You need an account, 2FA and a login.

1. **Account.** Sign up at [npmjs.com](https://www.npmjs.com/signup) (free) and verify your email.
2. **2FA.** Account settings, Two-Factor Authentication, Enable 2FA. npm requires 2FA, or a token that bypasses it, to publish.
3. **Name.** `npm view pi-openui` returned 404 (free) when this was written. If it is taken by then, use a scoped name such as
   `@newtonapple/pi-openui`; `publishConfig.access` is already `public`.
4. **Log in.** `npm login` opens your browser (its default, `auth-type=web`) and saves the credentials in `~/.npmrc`. You never
   create or paste a token yourself.
5. **Look first.** `make contents` and `make dry-run`. The package is `src/` and the changelog, plus the README, LICENSE and
   `package.json` that npm always includes: 40 files, about 130 kB.

### When you do need a token

Only for publishing without you at the keyboard, such as from CI. Then prefer **trusted publishing** over a token: GitHub
Actions proves who it is to npm with a short-lived OIDC credential, so no secret is stored anywhere.

- Publish the first version by hand, as above. A trusted publisher is configured in the package's settings on npmjs.com, so the
  package must exist, and the configuration must complete a first publish within 2 days.
- On npmjs.com: the package, Settings, Trusted publishing, GitHub Actions: your account, the repository, and the workflow's file
  name (for example `publish.yml`).
- The workflow needs `permissions: id-token: write`, Node 22.14 or newer and npm 11.5.1 or newer, and runs `npm publish` (or
  `npm stage publish`, which holds the release until you approve it with 2FA). `repository.url` in `package.json` must match the
  GitHub repository exactly.
- Then set the package's publishing access to "Require two-factor authentication and disallow tokens".

If you cannot use trusted publishing, create a **granular access token** with read and write access to this one package, an
expiry and "bypass 2FA", and keep it in your CI's secret store, never in the repository. Classic tokens no longer exist.

## Updating

People run `pi update --extensions` to reconcile their installs. pi shows them the changelog entries for what changed.
