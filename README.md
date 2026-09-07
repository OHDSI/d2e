<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./internal/d2e2 white.svg?raw=true">
  <img alt="Data2Evidence Logo" src="./internal/d2e2.svg?raw=true" width="400px">
</picture>

:construction: **Data2Evidence is beta software. There might be breaking changes.** :construction:

# Data2Evidence  

**Transforming fragmented health data into actionable insights - with speed and precision.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-d9dbec.svg)](LICENSE)
[![Website](https://img.shields.io/badge/Website-data2evidence.org-d9dbec)](https://data2evidence.org)
[![Docs](https://img.shields.io/badge/Docs-Getting_Started-d9dbec)](https://data2evidence.org/docs/getting_started/)
[![Commuity](https://img.shields.io/badge/Community-Slack-d9dbec)](https://join.slack.com/t/data2evidence/shared_invite/zt-3vabnh2qr-vMev2VfLI2Sl1YA27gGVig)
[![GitHub Activity](https://img.shields.io/github/commit-activity/m/ohdsi/d2e?label=Commit%20activty&logo=github&color=d9dbec)](https://github.com/ohdsi/d2e/graphs/contributors)
[![D2E CLI Version](https://img.shields.io/npm/v/d2e?label=D2E%20installer&logo=npm&color=d9dbec)](https://www.npmjs.com/package/d2e)
[![Strategus Analysis Tests](https://github.com/ohdsi/d2e/actions/workflows/strategus-analysis-integration-test.yml/badge.svg?branch=develop)](https://github.com/ohdsi/d2e/actions/workflows/strategus-analysis-integration-test.yml)

## Overview  

**Data2Evidence (D2E)** is an open-source research platform that streamlines the entire journey from **raw health data to reproducible scientific evidence**.  
Built for the **OHDSI** community and powered by the **OMOP Common Data Model (CDM)**, it unifies data ingestion, transformation, quality assessment, and analysis within one consistent, end-to-end environment.

Modern health data is often fragmented across incompatible systems, making research time-consuming and error-prone.  
Data2Evidence directly addresses these challenges — enabling researchers, data custodians, and institutions to **standardize data, run quality checks, define cohorts, and analyze results** with unparalleled transparency and speed.

<picture>
    <img src="./internal/D2E_Screenshots1.png?raw=true" alt="D2E Researcher and Admin Portal" width="100%"/>
</picture>

## Why Researchers Choose Data2Evidence  

- **End-to-End Workflows** - Transition from raw data to research-ready cohorts, validation, and analytics - all within a single, unified environment.  
- **Design-Centric Usability** - A clean, modern interface minimizes technical overhead and decision fatigue.  
- **Reproducibility & Trust** - Built-in validation, provenance tracking, and consistent workflows ensure reliability.  
- **Accelerated Onboarding** - Lightweight installation and sensible defaults make it easy to get started.  
- **Extensible Platform** - Add custom workflows, ML models, and integrations to fit institutional needs.  

## Who It's For  

- **Data Custodians / Administrators** - Deliver high-quality OMOP datasets ready for research. Scan, map, transform, and validate data — all in one place.  
- **Researchers & Clinicians** - Explore the data, define cohorts visually, test feasibility in real-time, and run analyses in interactive notebooks.  
- **Collaborating Institutions** - Run federated, privacy-preserving studies without moving sensitive data.  

## Key Benefits  

| Category | Description |
|--|--|
| **Intuitive Cohort Building** | Define, refine, and assess patient cohorts with a no-code interface and real-time feedback. |
| **Integrated Analytics & AI** | Run R or Python notebooks, assisted by an integrated coding chatbot. |
| **Comprehensive Interoperability** | Full OMOP CDM and FHIR support, adhering to FAIR data principles. |
| **Powerful Dashboards** | Monitor dataset quality and utility through dashboards. |
| **Data Quality Checks** | Perform standardized data quality checks on entire datasets or selected cohorts. |
| **Federated & Collaborative Research** | Share cohorts and analyses across institutions via Git-based workflows. |
| **Flexible Deployment** | Containerized architecture supports both on-premise and cloud setups. |
| **Extensible Architecture** | Add custom ETL steps, ML models, and integrations as research evolves. |

## Built by and for the OHDSI Community  

Data2Evidence supercharges the **OHDSI ecosystem**, combining familiar tools with new orchestration and governance features.

### Integrated OHDSI Tools

- [White Rabbit](https://github.com/OHDSI/WhiteRabbit) & [Rabbit in a Hat](https://ohdsi.github.io/WhiteRabbit/RabbitInAHat.html)
- [Data Quality Dashboard (DQD)](https://github.com/OHDSI/DataQualityDashboard)
- [Achilles](https://github.com/OHDSI/Achilles)
- [PHOEBE](https://data.ohdsi.org/PHOEBE/)
- [ATLAS](https://github.com/OHDSI/Atlas)
- [HADES](https://github.com/OHDSI/Hades)
- [Strategus](https://github.com/OHDSI/Strategus)

### Enhanced Capabilities

- **ETL Pipeline Orchestration** - Manage data pipelines with Prefect for transparency and reproducibility.  
- **Data Storage & User Management** - Secure, compliant storage with role-based access control.  
- **FHIR Integration** - Bridge clinical data exchange standards with OMOP.  
- **Federated Network Studies** - Run analyses across sites without moving patient-level data.  

## Quick Start  

### Prerequisites  

- **Docker** ≥ 24  
- **Node.js** ≥ 18  
- **Git**  
- **Windows users:** WSL2 or Ubuntu recommended  

### Installation  

Create folder for Data2Evidence

```bash
mkdir d2e
cd d2e
```

Install the Data2Evidence CLI

Set `VERSION` and your platform, then download it as `d2e`.

**Linux / macOS** — `PLATFORM` is one of `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`:
```bash
VERSION="0.17.0-beta"        # any released version
PLATFORM="darwin-arm64"      # your OS/arch
curl -L "https://github.com/OHDSI/Data2Evidence/releases/download/v$VERSION/data2evidence-cli-$VERSION-$PLATFORM" -o d2e
chmod +x d2e
```

**Windows (PowerShell)**:
```powershell
$VERSION = "0.17.0-beta"     # any released version
curl.exe -L --progress-bar -o d2e.exe "https://github.com/OHDSI/Data2Evidence/releases/download/v$VERSION/data2evidence-cli-$VERSION-windows-x64.exe"
```

Generate `.env` file for Data2Evidence with random generated secrets and certificates

```bash
./d2e init
```

Start the Data2Evidence services

```bash
./d2e -e pull
./d2e -e start
```

Create and load demo dataset

```bash
./d2e setupdemo
```

Access via [https://localhost:443](https://localhost:443)  
Default credentials: `admin / Updatepassword12345`  

Full guide: [data2evidence.org/docs/getting_started](https://data2evidence.org/docs/getting_started)

## Architecture Overview  

```
services/   → Backend microservices (auth, ETL, storage)
ui/         → Frontend web interface
flows/      → Prefect-based orchestration flows
functions/  → Analytical utilities and notebook helpers
```

- RESTful APIs for integration and automation  
- Extensible plugin system for custom modules  
- Supports on-premise, hybrid, and cloud deployments  

#### Build / Tests
| d2e services  | d2e  functions | d2e ui  |
|:-:|:-:|:-:|
| [![d2e/cli build and publish](https://github.com/ohdsi/d2e/actions/workflows/cli-setup-npm.yml/badge.svg)](https://github.com/ohdsi/d2e/actions/workflows/cli-setup-npm.yml) | [![d2e Docker Build](https://github.com/OHDSI/d2e/actions/workflows/docker-build-push.yaml/badge.svg)](https://github.com/OHDSI/d2e/actions/workflows/docker-build-push.yaml) | [![d2e-ui/pa (vue)](https://github.com/ohdsi/d2e/actions/workflows/ui-test-vue.yml/badge.svg)](https://github.com/ohdsi/d2e/actions/workflows/ui-test-vue.yml)   |  
|  |[![d2e-functions/pa integration tests](https://github.com/ohdsi/d2e/actions/workflows/functions-mri-tests.yml/badge.svg)](https://github.com/ohdsi/d2e/actions/workflows/functions-mri-tests.yml)  | [![d2e-ui/portal unit tests (Frontend)](https://github.com/ohdsi/d2e/actions/workflows/ui-alp-portal-test-fe.yml/badge.svg)](https://github.com/ohdsi/d2e/actions/workflows/ui-alp-portal-test-fe.yml)  |   
| |  | [![d2e-ui/portal unit tests (Components Library)](https://github.com/ohdsi/d2e/actions/workflows/ui-alp-portal-test-components.yml/badge.svg)](https://github.com/ohdsi/d2e/actions/workflows/ui-alp-portal-test-components.yml) |
| |  | [![d2e-ui/pyqe tests](https://github.com/ohdsi/d2e/actions/workflows/ui-pyqe-test.yml/badge.svg)](https://github.com/ohdsi/d2e/actions/workflows/ui-pyqe-test.yml) |  

## Contributing  

We welcome community contributions!  

1. Open issues or feature requests on GitHub  
2. Submit pull requests  
3. Join our [Slack](https://join.slack.com/t/data2evidence/shared_invite/zt-3vabnh2qr-vMev2VfLI2Sl1YA27gGVig) for discussions  

## Citing  

If you use Data2Evidence in your research, please cite it using the metadata in [CITATION.cff](CITATION.cff). GitHub provides a "Cite this repository" shortcut in the sidebar that generates APA and BibTeX entries from this file.

## License  

Licensed under the [Apache 2.0 License](LICENSE).

## Acknowledgments  

Developed by **Data4Life**, supported by the **Hasso Plattner Foundation** and global research partners.  

> Let's unlock the potential of global health data - together.  
> 👉 [Explore now at data2evidence.org](https://data2evidence.org)
