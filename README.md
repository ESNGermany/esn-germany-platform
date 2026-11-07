# Website

## How to build the websites locally
You need Bun, git, yarn and Node.js.
```bash
cd websites/builder
URL=esn-germany.de bun start
```
`URL` is the domain the sites are built for. It ends up in the sitemaps, the Caddyfile and the Directus
requests, and defaults to `localhost`.

Afterwards the websites can be found in `websites/builder/dist/sites` and the matching Caddy
configuration in `websites/builder/dist/Caddyfile`. A full build takes about a minute with a warm
yarn cache.

## How the build works
`websites/builder/src/index.ts` clears the temp folder (`$TMPDIR/esn-germany-platform/websites`) and then builds
three things in parallel:

| What | Source | Result in `dist/sites` |
|---|---|---|
| National website | repo `esn-germany-website` | `@` |
| Alumni website | repo `esn-section-website`, branch `Alumni_site` | `alumni` |
| Section websites | repo `esn-section-website`, branch `main` | `_shared` and one folder per section |

Every repo is cloned, installed with yarn and built with Angular. The yarn installs run one at a time (a lock
file in `/tmp`), because parallel installs can corrupt yarn's shared cache.

The section template is built **once** and then turned into one website per section
(`src/scripts/buildAlumniSections.ts`):

1. **Shared files:** every file of the built template that is identical for all sections is moved to `_shared`.
2. **Section banner:** `src/section-banner-generator` draws the logo of each section (the section name without
   the leading `ESN `) onto `template.png` with the Work Sans font and writes it to
   `<section>/assets/logo/DE-logo-colour.png`.
3. **Placeholders:** the template files that contain placeholders are written once per section with the values
   replaced. The placeholders are `REPLACE_SECTION_NAME`, `REPLACE_SECTION_CNAME`, `REPLACE_SECTION_ID`,
   `REPLACE_SECTION_URL` and `REPLACE_META_DESCRIPTION`. The meta description is loaded from Directus
   (`website_main_information`). Which files contain placeholders is detected automatically (currently
   `index.html`, `main.*.js`, `robots.txt` and `sitemap.xml`).
4. **Service worker manifest:** the hashes in `ngsw.json` have to match the final files. `ngsw-config` is run on
   the files of the section itself and the result is merged into the manifest of the template, so that every
   section's `ngsw.json` also covers the shared files and its own banner.

Finally `src/scripts/buildCaddyfile.ts` writes `dist/Caddyfile` and everything is copied to `dist/sites`.

## What the result looks like
```
dist/
  Caddyfile
  sites/
    @/            national website, complete
    alumni/       alumni website, complete
    _shared/      files that are identical for all sections (JS, fonts, assets/, ...)
    aachen/       only the files that differ per section:
      index.html
      main.<hash>.js
      robots.txt
      sitemap.xml
      ngsw.json
      assets/logo/DE-logo-colour.png
    augsburg/
    ...
```
A section folder is **not** a complete website on its own. It only works together with `_shared`.

## How the sites are served
`dist/Caddyfile` is generated from `websites/builder/src/config.ts`. `docker-compose.override.yml` mounts it into
the Caddy container (`websites.builder.Caddyfile`) and mounts `websites/data/builder/sites` as `/srv`.

- The national website and alumni use the snippet `esn_site`, which serves `/srv/<folder>` and falls back to its
  `index.html` for app routes.
- Every section uses the snippet `esn_section`. It looks for a requested file in the section's own folder first,
  then in `/srv/_shared`, and otherwise falls back to the section's `index.html`. The URLs are the same as in a
  complete copy, so nothing in the websites changes. `_shared` also holds the template's own
  `assets/logo/DE-logo-colour.png`, which is never served for a section, because the section's own banner is found first.

The Caddyfile and the folder layout belong together. After every build restart Caddy, and when the layout of
`dist/sites` changes (for example when `_shared` was introduced), put the new Caddyfile in place before the new sites.

## Adding or changing a section
Sections are listed in `websites/builder/src/config.ts`:

| Field | Meaning |
|---|---|
| `id` | Section id in Directus, used for the content and the meta description |
| `name` | Name of the section, used for the page title and the banner |
| `cname` | Subdomain and folder name: `<cname>.<URL>` |
| `redirects` | Optional additional domains, which redirect to `<cname>.<URL>` |

Add or change the entry, rebuild and restart Caddy. DNS records for the new domains have to exist.

## Look at a section locally
`dist/sites/@` and `dist/sites/alumni` are complete websites. A section folder has to be combined with `_shared` first:
```bash
cd websites/builder/dist/sites
mkdir /tmp/preview && cp -rf _shared/. /tmp/preview && cp -rf aachen/. /tmp/preview   # the section's files win
cd /tmp/preview
python -m http.server
```
Python's server does not fall back to `index.html`, so a reload on a page like `/team` shows a 404 there.

To test the generated Caddy configuration, including routes and redirects, run Caddy with local certificates (from the repo
root; `sed -n 1,8p platform/Caddyfile` is the `hardened_security` snippet):
```bash
{ printf '{\n    local_certs\n    admin off\n}\n'; sed -n 1,8p platform/Caddyfile; echo 'import /etc/caddy/config/*.Caddyfile'; } > /tmp/Caddyfile.test
docker run --rm -p 18443:443 -e URL=localhost \
  -v /tmp/Caddyfile.test:/etc/caddy/Caddyfile:ro \
  -v $PWD/websites/builder/dist/Caddyfile:/etc/caddy/config/builder.Caddyfile:ro \
  -v $PWD/websites/builder/dist/sites:/srv:ro caddy:2.10-alpine
```
In a second terminal (`-k` accepts the test certificate, `--resolve` points the name at your machine):
```bash
curl -sk --resolve aachen.localhost:18443:127.0.0.1 https://aachen.localhost:18443/ | grep -o '<title>[^<]*'
```
Build with `URL=localhost` if you want the generated pages to use `localhost` as well.

## How to rebuild the websites on the server
```
cd ~/adagia/esn-germany-platform
git pull
docker compose run --rm --build websites_builder
docker compose restart platform_caddy
```
