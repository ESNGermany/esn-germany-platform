# How to build the websites localy
```bash
cd websites/builder
URL=esn-germany.de bun start
```

Afterwards the websites can be found in websites/builder/dist/sites.
A website can then locally be hosted by
```
cd <section> # folder containing the index.htm
python -m http.server
```

# How to rebuild the websites on the server
```
cd ~/adagia/esn-germany-platform
git pull
docker compose run --rm --build websites_builder
docker compose restart platform_caddy
```
