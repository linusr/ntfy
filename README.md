# ntfy with native APNs

A fork of [ntfy](https://github.com/binwiederhier/ntfy) that delivers notifications directly to iOS through Apple Push
Notification service (APNs), without Firebase or a relay through ntfy.sh. It pairs with
[ntfy-ios](https://github.com/linusr/ntfy-ios), a native iOS and watchOS client.

Everything else is upstream ntfy; see the [ntfy documentation](https://docs.ntfy.sh) for publishing, subscribing,
access control and configuration.

## Differences from upstream

| | Upstream ntfy | This fork |
|---|---|---|
| iOS delivery from a self-hosted server | Poll request relayed through ntfy.sh and Firebase | Direct to APNs with your own auth key |
| Message content in push | `New message`; the app fetches the content | Full message, or IDs only with `apns-payload: minimal` |
| iOS app | Official ntfy app | [ntfy-ios](https://github.com/linusr/ntfy-ios), built and signed by your Apple Developer team |

APNs delivery requires an [Apple Developer Program](https://developer.apple.com/programs/) membership, since pushes
must be signed by the team that owns the app. Changes live on the [`apns`](https://github.com/linusr/ntfy/tree/apns)
branch; `main` mirrors upstream.

## Running

Images for `linux/amd64` and `linux/arm64` are published to `ghcr.io/linusr/ntfy`:

| Tag | Source |
|---|---|
| `apns` | Latest commit on the `apns` branch |
| `sha-<commit>` | A specific commit |
| `<version>`, `latest` | `fork-v<version>` release tags |

```yaml
services:
  ntfy:
    image: ghcr.io/linusr/ntfy:apns
    command: serve
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - /etc/ntfy:/etc/ntfy              # server.yml and the APNs auth key
      - /var/cache/ntfy:/var/cache/ntfy  # message cache, device registrations, attachments
      - /var/lib/ntfy:/var/lib/ntfy      # user database
```

## APNs configuration

Create an APNs auth key in the Apple Developer portal (*Certificates, Identifiers & Profiles → Keys*) and add to
`server.yml`:

```yaml
base-url: "https://ntfy.example.com"
apns-key-file: "/etc/ntfy/AuthKey_ABC123DEFG.p8"
apns-key-id: "ABC123DEFG"
apns-team-id: "DEF123GHIJ"
apns-bundle-id: "me.4vr.ntfy"
apns-file: "/var/cache/ntfy/apns.db"
# apns-payload: "minimal"   # send only message IDs through Apple
```

Devices register their topics with `POST /v1/apns`. Priorities map to iOS interruption levels, messages sharing a
sequence ID replace each other, and deletes withdraw delivered notifications. The full reference is in the
[APNs section of the configuration docs](docs/config.md#apple-push-notification-service-apns).

## Building

```sh
make cli-deps-static-sites   # placeholder web app and docs
go build -o ntfy .
go test ./apns/ ./server/ -run APNS
```

`Dockerfile-build` builds the complete image including the web app and docs.

## Syncing with upstream

```sh
git fetch upstream
git checkout main && git merge --ff-only upstream/main && git push origin main
git checkout apns && git rebase main && git push --force-with-lease origin apns
```

## License
ntfy is made by [Philipp C. Heckel](https://heckel.io) and its [contributors](https://github.com/binwiederhier/ntfy/graphs/contributors).
This fork keeps its licensing: the project is dual licensed under the [Apache License 2.0](LICENSE) and the [GPLv2 License](LICENSE.GPLv2).

Third-party libraries and resources:
* [github.com/urfave/cli](https://github.com/urfave/cli) (MIT) is used to drive the CLI
* [Mixkit sounds](https://mixkit.co/free-sound-effects/notification/) (Mixkit Free License) are used as notification sounds
* [Sounds from notificationsounds.com](https://notificationsounds.com) (Creative Commons Attribution) are used as notification sounds
* [Roboto Font](https://fonts.google.com/specimen/Roboto) (Apache 2.0) is used as a font in everything web
* [React](https://reactjs.org/) (MIT) is used for the web app
* [Material UI components](https://mui.com/) (MIT) are used in the web app
* [MUI dashboard template](https://github.com/mui/material-ui/tree/master/docs/data/material/getting-started/templates/dashboard) (MIT) was used as a basis for the web app
* [Dexie.js](https://github.com/dexie/Dexie.js) (Apache 2.0) is used for web app persistence in IndexedDB
* [GoReleaser](https://goreleaser.com/) (MIT) is used to create releases
* [go-smtp](https://github.com/emersion/go-smtp) (MIT) is used to receive e-mails
* [stretchr/testify](https://github.com/stretchr/testify) (MIT) is used for unit and integration tests
* [github.com/mattn/go-sqlite3](https://github.com/mattn/go-sqlite3) (MIT) is used to provide the persistent message cache
* [Firebase Admin SDK](https://github.com/firebase/firebase-admin-go) (Apache 2.0) is used to send FCM messages
* [github/gemoji](https://github.com/github/gemoji) (MIT) is used for emoji support (specifically the [emoji.json](https://raw.githubusercontent.com/github/gemoji/master/db/emoji.json) file)
* Go's [text/template](https://pkg.go.dev/text/template) (BSD-3-Clause) is vendored under [template/gotext/](template/gotext/) with a small patch adding an execution deadline (see [template/gotext/README.md](template/gotext/README.md))
* [Lightbox with vanilla JS](https://yossiabramov.com/blog/vanilla-js-lightbox) as a lightbox on the landing page 
* [HTTP middleware for gzip compression](https://gist.github.com/CJEnright/bc2d8b8dc0c1389a9feeddb110f822d7) (MIT) is used for serving static files
* [Regex for auto-linking](https://github.com/bryanwoods/autolink-js) (MIT) is used to highlight links (the library is not used)
* [Statically linking go-sqlite3](https://www.arp242.net/static-go.html)
* [Linked tabs in mkdocs](https://facelessuser.github.io/pymdown-extensions/extensions/tabbed/#linked-tabs)
* [webpush-go](https://github.com/SherClockHolmes/webpush-go) (MIT) is used to send web push notifications
* [Sprig](https://github.com/Masterminds/sprig) (MIT) is used to add template parsing functions
