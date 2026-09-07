# D2E CLI Guide

## Installation

Create a dedicated directory to store Data2Evidence configuration files. Note that subsequent commands need to be executed within this directory:

  ```bash
  mkdir d2e
  cd d2e
  ```

### Download the CLI binary
Download the appropriate binary for your operating system and architecture from the [GitHub Releases](https://github.com/OHDSI/Data2Evidence/releases) page.

#### Linux
**x64**
```bash
VERSION="0.17.0-beta"
curl -L https://github.com/OHDSI/Data2Evidence/releases/download/v$VERSION/data2evidence-cli-$VERSION-linux-x64 -o d2e
chmod +x d2e
```

**arm64**
```bash
VERSION="0.17.0-beta"
curl -L https://github.com/OHDSI/Data2Evidence/releases/download/v$VERSION/data2evidence-cli-$VERSION-linux-arm64 -o d2e
chmod +x d2e
```

#### macOS
**x64**
```bash
VERSION="0.17.0-beta"
curl -L https://github.com/OHDSI/Data2Evidence/releases/download/v$VERSION/data2evidence-cli-$VERSION-darwin-x64 -o d2e
chmod +x d2e
```

**arm64**
```bash
VERSION="0.17.0-beta"
curl -L https://github.com/OHDSI/Data2Evidence/releases/download/v$VERSION/data2evidence-cli-$VERSION-darwin-arm64 -o d2e
chmod +x d2e
```

#### Windows

**x64**
```powershell
$VERSION = "0.17.0-beta"
curl.exe -L --progress-bar -o d2e.exe "https://github.com/OHDSI/Data2Evidence/releases/download/v$VERSION/data2evidence-cli-$VERSION-windows-x64.exe"
```

---

## Checking the Installed Version

Run the following command to display version information:

```bash
./d2e version
```

> **Note:** The `version` command is available from v0.14 onwards.

The output includes the following fields:

| Field | Description |
|-------|-------------|
| `d2e CLI Version` | The installed CLI version |
| `Docker Image Tag` | The Docker image tag that will be pulled and used |
| `Plugins API Version` | The version of the plugin packages |

**Example Output - Stable release (version 0.12.0):**
```
d2e CLI version:    0.12.0
Docker image tag:   0.12.2-beta
Plugins API version: ~0.12.0
```

**Example Output - Develop mode (version 0.12.0)** (`./d2e -v develop version`):
```
d2e CLI version:    0.12.0
Docker image tag:   develop # modify the env variable in the `.env` file
Plugins API version: latest
```

---

## Upgrading D2E

Download the updated binary for your operating system and architecture using the commands in the [Download the CLI binary](#download-the-cli-binary) section, then proceed to [Update configurations](#update-configurations).

### Update configurations
In the d2e directory, open the `.env` file and make these changes:
- Set `DOCKER_TAG_NAME` to the docker image tag for the new version.
  - Example: For version `0.12.0`, set `DOCKER_TAG_NAME=0.12.0-beta`. The format is `DOCKER_TAG_NAME=<version>-beta`.
- Additional step for upgrades from versions earlier than v0.18: add `PLUGINS_SEED_UPDATE=true` to trigger a plugin upgrade on the next startup.

- Verify the new version is active:

   ```bash
   ./d2e version
   ```

- Start D2E:

   ```bash
   ./d2e -e start
   ```

---

## Troubleshooting

### `illegal hardware instruction` when running `./d2e`

**Cause:** The binary downloaded does not match your system architecture.

**Resolution:** Check your architecture and re-download the correct binary.

```bash
uname -m
```

| Output | Binary to download |
|--------|--------------------|
| `arm64` | arm64 |
| `x86_64` | x64 |

---

### `permission denied` when running `./d2e`

**Cause:** The binary is missing execute permissions.

**Resolution:** Grant execute permissions:

```bash
chmod +x d2e
```

---

### `./d2e: command not found`

**Cause:** The command was run outside the `d2e` directory.

**Resolution:** Navigate to the directory where the binary was downloaded:

```bash
cd d2e
./d2e version
```
