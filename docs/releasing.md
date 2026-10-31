# Releasing

How people get this extension, and what to do before you share it.

## GitHub is enough

pi installs a package from a git repository. Nobody needs npm for this:

```sh
pi install git:github.com/newtonapple/pi-openui
```

pi clones the repository, reads the `pi` key in `package.json` (`"extensions": ["./src/pi/extension.ts"]`) and loads that file.
The extension has no runtime dependencies of its own. It imports `@earendil-works/pi-tui`, `@earendil-works/pi-coding-agent`
and `typebox`, which pi supplies, so they are `peerDependencies` with the range `"*"` and are never listed under `dependencies`.
A second copy would split pi's classes and registries. `test/package.test.ts` checks all of this.

Without the `pi` key an install appears to succeed and pi then fails with `Cannot find module`, because the extension is not
in a conventional `extensions/` folder. (The `.pi/extensions/openui.ts` shim is for working inside this repository only.)

## Before the first public push

- The license is MIT: the `LICENSE` file and the `license` field in `package.json`.
- `package.json` points at `github.com/newtonapple/pi-openui` (`repository`, `homepage`, `bugs`) and the README's install
  commands use the same name. If you create the repository under another name or account, change those four places.
- Run `npm test`. It makes no network or model calls.
- `version` in `package.json` and the changelog's top heading are both `0.1.0`. For the next release, change both.

The folder syncs through iCloud. Keep the working copy out of a synced folder if you can: a synced `.git` directory can be
corrupted when two machines write to it. Create the repository on GitHub (`gh repo create newtonapple/pi-openui --public
--source . --push` does it in one step), or create it on the website and `git remote add origin <url>`.

## A version people can pin

```sh
git tag v0.1.0 && git push origin v0.1.0
pi install git:github.com/newtonapple/pi-openui@v0.1.0
```

pi pins tags and commits: a configured tag does not move on `pi update`. Without `@tag` pi follows the default branch.

## npm, if you want it

npm adds two things: `pi install npm:pi-openui`, and a listing in pi's [package gallery](https://pi.dev/packages), which finds
packages by the `pi-package` keyword (already in `package.json`). Do it only if you want those.

You do **not** need an access token to publish from your own machine. You need an account, 2FA, and a login.

1. **Account.** Sign up at [npmjs.com](https://www.npmjs.com/signup) (free) and verify your email.
2. **2FA.** Account settings, Two-Factor Authentication, Enable 2FA (a security key, or an authenticator app). npm requires
   2FA, or a token that bypasses it, to publish at all.
3. **Name.** `npm view pi-openui` returned 404 (free) when this was written. If it is taken by then, use a scoped name such as
   `@newtonapple/pi-openui`, which needs `npm publish --access public` the first time.
4. **`package.json`.** `"private": true` is removed, so `npm publish` will publish. `version`, `license`, `author`, `repository`,
   `homepage`, `bugs`, `files` and `publishConfig` are set. A published version cannot be taken back: check the version first. `files` limits the tarball to `src/` and the changelog (40 files, 130 kB;
   without it the tests and screenshots go too, 139 files, 1.6 MB). The README and LICENSE are always included.
5. **Look first.** `npm pack --dry-run` lists what would ship. Read it.
6. **Log in.** `npm login` opens your browser to sign in (its default, `auth-type=web`) and saves the credentials in `~/.npmrc`. You never create or paste a token yourself.
7. **Publish.** `npm publish`. npm asks for a 2FA code. An unscoped public package is public by default.

After that, `pi install npm:pi-openui` works. A published version cannot be changed or re-published: fix forward with
`npm version patch` (or `minor`) and publish again. Keep the version in step with the git tag.

The README's pictures and links are relative. On npm's package page, relative paths resolve against the `repository` field when
it is a GitHub URL, which is one more reason it is set. If you ever see broken images on the npm page, switch them to full
`https://raw.githubusercontent.com/...` URLs.

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
expiry, and "bypass 2FA", and keep it in your CI's secret store, never in the repository. Classic tokens no longer exist.

## Updating

People run `pi update --extensions` to reconcile their installs. Add a line to `CHANGELOG.md` with every change a user can see.
