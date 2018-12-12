# shairport-sync-readmeta
Reads metadata piped from Mike Brady's shairport-sync and serves it to a frontend using websockets

Check out his awesome airplay receiver here:
`https://github.com/mikebrady/shairport-sync`

This parser/webserver was hacked together in an evening to display airplay meta info on a React-based frontend served from `./static`. Mostly hardcoded and non-configurable, but there's nothing to stop you from hacking away and making it your own.

See `https://github.com/mikebrady/shairport-sync-metadata-reader` for Mike Brady's sample metadata reader. I used his extensive documentation for how parsing the data works.
