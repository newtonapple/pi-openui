# Releasing pi-openui. The order and the reasons are in docs/releasing.md.
#
#   make release BUMP=patch     tests, version + changelog commit, publish, tag, push
#   make publish tag push       the same, for a version that is already bumped and committed (the first release, 0.1.0)
#   make help
#
# `npm login` is not part of this. Log in first: `make publish` stops before doing anything if you are not.
# The one step that cannot be undone is `npm publish` (a version can never be replaced), so everything that can fail is
# checked before it, and nothing is pushed or tagged until it has succeeded.

NPM    ?= npm
GIT    ?= git
NODE   ?= node
PI     ?= pi
BRANCH ?= main
export NPM GIT BRANCH

# lazy (=), so they are read again after a version bump
NAME    = $(shell $(NODE) -p "require('./package.json').name")
VERSION = $(shell $(NODE) -p "require('./package.json').version")
TAG     = v$(VERSION)
RELEASE = $(NODE) scripts/release.ts

.DEFAULT_GOAL := help
.PHONY: help test contents dry-run check version publish tag push release github-release verify

help:
	@echo "pi-openui $(VERSION)  (release process: docs/releasing.md)"
	@echo ""
	@echo "  make release BUMP=patch|minor|major|x.y.z   the whole release, in order:"
	@echo "                                              check, test, version, publish, tag, push"
	@echo ""
	@echo "  make check               is the repo ready to start a release? (branch, clean, in step with origin, changelog)"
	@echo "  make test                the test suite"
	@echo "  make contents            list the files npm would ship"
	@echo "  make dry-run             run npm publish --dry-run (nothing is published)"
	@echo "  make version BUMP=...    bump package.json, move CHANGELOG 'Unreleased' to the new version, commit 'Release vX.Y.Z'"
	@echo "  make publish             checks, npm publish (asks you to approve with 2FA), then waits until npm shows the version"
	@echo "  make tag                 tag the commit npm says it published (only after publishing)"
	@echo "  make push                push the branch and the tag"
	@echo "  make github-release      create the GitHub release for the tag, with the changelog notes (needs gh)"
	@echo "  make verify              after publishing: install the published version into a throwaway pi config, look on pi.dev"
	@echo ""
	@echo "  The first release (0.1.0 is already versioned):  make publish tag push"

check:
	@$(RELEASE) preflight start

test:
	$(NPM) test

contents:
	$(NPM) pack --dry-run

dry-run:
	$(NPM) publish --dry-run

version:
	@$(RELEASE) preflight start
	@$(RELEASE) version "$(BUMP)"

publish:
	@$(RELEASE) preflight publish
	$(NPM) publish
	@$(RELEASE) wait-published

tag:
	@$(RELEASE) tag

push:
	@$(RELEASE) push

# (GNU make expands a whole recipe before running its first line, so the final message reads the version from the shell.)
# sequential on purpose: if publishing fails (a wrong 2FA code), nothing has been tagged or pushed. Fix it and run
# `make publish tag push`; the release commit is already made.
release:
	@test -n "$(BUMP)" || { echo "BUMP is required: make release BUMP=patch|minor|major|x.y.z"; exit 1; }
	@$(RELEASE) preflight start
	$(MAKE) test
	$(MAKE) version BUMP="$(BUMP)"
	$(MAKE) publish
	$(MAKE) tag
	$(MAKE) push
	@echo ""
	@echo "Released $(NAME) $$($(NODE) -p "require('./package.json').version"). Optional: make github-release"

github-release:
	gh release create $(TAG) --verify-tag --title $(TAG) --notes "$$($(RELEASE) changelog notes $(VERSION))"

# After publishing. Installs the published version into a throwaway pi config (your own settings are not touched), then looks
# for the package in pi.dev's catalog. The catalog picks up new npm packages with the pi-package keyword on its own; it can
# take a few minutes, so a missing page is reported, not treated as a failure.
verify:
	@dir=$$(mktemp -d) && trap 'rm -rf "$$dir"' EXIT && \
	echo "installing npm:$(NAME)@$(VERSION) into a throwaway pi config..." && \
	PI_CODING_AGENT_DIR="$$dir" $(PI) install npm:$(NAME)@$(VERSION) && \
	PI_CODING_AGENT_DIR="$$dir" $(PI) list && \
	code=$$(curl -s -o /dev/null -w '%{http_code}' "https://pi.dev/packages/$(NAME)") && \
	if [ "$$code" = 200 ]; then echo "pi.dev: https://pi.dev/packages/$(NAME) is listed"; \
	else echo "pi.dev: not listed yet (HTTP $$code). The catalog indexes npm every few minutes: run make verify again later."; fi
