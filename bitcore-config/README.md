# Bitcore (b1t-core) Konfiguration

- **bit.conf.template**: Wird als `/config/bit.conf` ins Image gemountet. Das [Bitcore-docker-B1T](https://github.com/OnlyPW/Bitcore-docker-B1T)-Image erzeugt daraus die echte Config unter `/data/bit.conf` (mit RPC_USER, RPC_PASSWORD aus der Umgebung).

- **Persistenz**: Die Blockchain liegt im benannten Volume `b1t-bitcore-data`. Durch den festen Volumenamen wird immer dasselbe Volume genutzt (auch bei Neustart oder anderem Projektpfad), sodass keine Neusynchronisation nötig ist. Falls du zuvor schon mit dem alten Volumenamen (z. B. `b1twalletorg_bitcore-data`) synchronisiert hast: Beim ersten Start nach der Umstellung wird einmal ein neues, leeres Volume verwendet – ein Neusync ist dann nötig; danach bleibt die Blockchain bei jedem Neustart erhalten.

Falls b1t-core trotzdem nicht „durchstartet“:

1. **Logs prüfen** (ob bitd Fehler ausgibt):
   ```bash
   docker-compose logs -f bitcore
   ```

2. **Frische Config erzwingen** (z. B. wenn RPC-Passwort nicht `changeme` ist oder nach Image-Update): Volume löschen und neu starten:
   ```bash
   docker-compose down
   docker volume rm b1t-bitcore-data
   docker-compose up -d bitcore
   ```
   Dann wird `/data/bit.conf` mit den Umgebungsvariablen (RPC_USER=user, RPC_PASSWORD=changeme) neu erzeugt. **Hinweis:** Die Blockchain wird dabei neu geladen (Sync von vorn).

3. **RPC erst nach Sync bereit**: Beim ersten Start lädt der Node die Blockchain; RPC (Port 8332) kann einige Minuten brauchen, bis `getblockcount` antwortet.
