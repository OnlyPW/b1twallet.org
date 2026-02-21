# Bitcore (b1t-core) Konfiguration

- **bit.conf.template**: Wird als `/config/bit.conf` ins Image gemountet. Das [Bitcore-docker-B1T](https://github.com/OnlyPW/Bitcore-docker-B1T)-Image erzeugt daraus die echte Config unter `/data/bit.conf` (mit RPC_USER, RPC_PASSWORD aus der Umgebung).

Falls b1t-core trotzdem nicht „durchstartet“:

1. **Logs prüfen** (ob bitd Fehler ausgibt):
   ```bash
   docker-compose logs -f bitcore
   ```

2. **Frische Config erzwingen** (z. B. wenn RPC-Passwort nicht `changeme` ist oder nach Image-Update): Volume löschen und neu starten:
   ```bash
   docker-compose down
   docker volume rm b1twalletorg_bitcore-data
   docker-compose up -d bitcore
   ```
   Dann wird `/data/bit.conf` mit den Umgebungsvariablen (RPC_USER=user, RPC_PASSWORD=changeme) neu erzeugt.

3. **RPC erst nach Sync bereit**: Beim ersten Start lädt der Node die Blockchain; RPC (Port 8332) kann einige Minuten brauchen, bis `getblockcount` antwortet.
