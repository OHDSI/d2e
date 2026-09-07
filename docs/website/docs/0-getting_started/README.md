# Quick start

## Pre-requisites

- Install pre-requisite software for running Data2Evidence. Refer to the [installation guide](../2-admin_guide/5-setup/README.md)

The following document outlines the Quick Start setup with demo data & pulls all images from the GitHub container registry.

:::note

- If you are starting the application for first time, start from the [Environment Variables and Credentials Setup](#environment-variables-and-credentials-setup) section
- If you have setup the application before, start from the [Start Data2Evidence](#start-data2evidence) section

:::

## Getting started
- Create a directory to store Data2Evidence configuration files. Note that subsequent commands need to be executed in the directory:

  ```bash
  mkdir d2e
  cd d2e
  ```

- Download the appropriate binary for your operating system and architecture from the [GitHub Releases](https://github.com/OHDSI/Data2Evidence/releases) page.


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


- Verify if the executable works by running `./d2e` to display the help section for a list of commands. Ensure that `./` is included when running the executable.

- Check version using
  ```bash
  ./d2e version
  d2e CLI version:    0.12.0
  Docker image tag:   0.12.2-beta
  Plugins API version: ~0.12.0
  ```
  For more info and troubleshooting: [System setup cli guide](../2-admin_guide/5-setup/0-system-setup/cli.md)

## Environment variables and credentials setup

### Custom environment variables (mandatory for a remote virtual machine)

Export additional shell variables as relevant ([go to admin guide](../2-admin_guide/5-setup/0-system-setup/env-types.md)).

- `export CADDY__ALP__PUBLIC_FQDN=<FQDN>` - Remote Virtual Machine Server scenario (otherwise unset). Ensure that the `FQDN` url is in lowercase. 
- `export TLS__CADDY_DIRECTIVE=' '` (blank) - Publicly Resolvable FQDN scenario (otherwise unset)



### Environment variables & secrets

Generate `.env file` with random generated secrets and certificates:

```bash
./d2e init
```

_See [Environment variables](../2-admin_guide/5-setup/0-system-setup/env-vars.md) for further details._

## Start Data2Evidence

Start Data2Evidence services:

```bash
./d2e -e pull
./d2e -e start
```

**Note**: If you are running behind a proxy

- Add the following in the `noProxy` configuration
- If env `PROJECT_NAME` is different from the default `d2e`, do a search and replace from `d2e-` with `${PROJECT_NAME}-` in the below config
- If env `TLS__INTERNAL__DOMAIN` is different from the default `d2e.local`, replace `.d2e.local` below with `.${TLS__INTERNAL__DOMAIN}` — otherwise internal calls start traversing the proxy

```bash
.d2e.local,registry-1.docker.io,localhost,::1,d2e-demodb,d2e-caddy,d2e-enterprise-gateway,d2e-minerva-redis-1,d2e-minerva-postgres-1,d2e-minerva-pg-mgmt-init-1,d2e-logto-1,d2e-logto-post-init-1,d2e-trex,d2e-supabase-storage-1,d2e-minerva-fhir-server-1,d2e-supabase-storage-post-init-1,d2e-dataflow-gen-1,d2e-dataflow-gen-worker
```

## Data2Evidence guide

### Researcher Portal

- Input the Researcher Portal URL into a Chrome web browser:

  - [https://localhost:443](https://localhost:443) - local workstation
  - `https://<FQDN>` - remote server

- A ["**Proceed to localhost**"](../2-admin_guide/images/chrome/chrome-proceed-to-localhost.png) display is expected.
- Select **Advanced** > **Proceed to localhost (unsafe)**
- You will see the [**Data2Evidence login screen**](../2-admin_guide/images/portal/LoginPage.png)
- You can find more information about the usage of the Researcher Portal in the [user guide](../1-user_guide/README.md)

### Accessing Admin Portal

The Admin Portal allows authorized personnel to login and perform the management of users, datasets and job plugins.

- Login as admin with following credentials:

  - username - `admin`
  - password - `Updatepassword12345`

- Click **Account** on the top right > switch to Admin Portal

> **The expected display is:**
> ![AdminPortal](../2-admin_guide/images/portal/AdminPortal.png)

Additional info:

- [Performing password change](../2-admin_guide/5-setup/data-load/1-initial-admin.md)
- [Performing user management](../2-admin_guide/5-setup/data-load/2-users-roles.md)

:::tip
For quick access to the Admin Portal, input the following URL in the search bar:

- [https://localhost:443/d2e/portal/systemadmin/user-overview](https://localhost:443/d2e/portal/systemadmin/user-overview) - local workstation
- `https://<FQDN>/d2e/portal/systemadmin/user-overview` - remote server

:::

### Configure Data2Evidence with a custom dataset

Find information on how to add a custom dataset and configure Data2Evidence in the [data load section](../2-admin_guide/5-setup/data-load/README.md).

### Configure Data2Evidence using the demo dataset

These are the two methods to load the demo dataset:

- Run the command: `./d2e setupdemo`
- [Via Admin Portal](../2-admin_guide/5-setup/data-load/8-load-broadsea.md)

Upon completion, switch to the Researcher Portal by navigating to Account > switch to Researcher Portal. The [demo dataset](../2-admin_guide/images/portal/ResearcherPortalDemoDataset.png) will be shown.

### Stop the application

Stop the application:

```bash
./d2e -e stop
```

### Remove the resources

:::warning
Removes all Data2Evidence data.\
For a fresh startup, re-run from [environment variables and credentials setup](#environment-variables-and-credentials-setup) section

:::

```bash
./d2e clean
```
